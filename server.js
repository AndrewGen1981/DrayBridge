const express = require("express")


// Node.js compression middleware
const compression = require("compression")


// Set environment
const devPORT = 5000
const devServer = `http://localhost:${ devPORT }`
const { NODE_ENV, PORT = devPORT } = process.env


const isProduction = NODE_ENV === "production"
if (!isProduction) require("dotenv").config()


// Перекриваю стандартні методи console.log, console.warn i console.error
// роблю логер в манго, щоб відслідковувати повідомлення і помилки
require("./Models/_consoleInterceptor.js")


// Express setup
const app = express()
    .use(compression())
    .set("view engine", "ejs")
    .set('trust proxy', 1)  // must-have на Heroku, інакше щоразу створюється нова сесія, попередня не передається сервером
    .use(express.static("Views"))
    .use(express.static("Public"))
    .use(express.static("Config"))
    .use(express.urlencoded({ extended: true }))
    .use(express.json({ type: [ "application/json", "text/plain" ] }))


// *** CONFIG: в app.locals конфігурації для шаблонів client-side
app.locals = {
    config: {
        ...require("./Config/__config.json"),
        // для відображення ролі в профайлах
        USER_TYPES: require("./Models/userModel.js").USER_TYPES || {},
        // isProduction потрібно для QR кодів
        isProduction: isProduction
    },
    SESSION_LIFETIME: process.env.SESSION_LIFETIME,
    CAPTCHA_SITE_KEY: process.env.CAPTCHA_SITE_KEY,
    main_menu: require("./Views/__header_footer_navs.json"),
    tools: {
        ...require("./Utils/tools.js"),
        ...require("./Utils/localDateTime.js")
    },
}

// *** CONFIG: в global конфігурації для server-side
const {
    MAX_FILES_ALLOWED_TO_UPLOAD = 15,
    MAX_BYTES_PER_FILE = 5 * 1024 *1024,   //  5Mb per file
} = require("./Config/__config.json")

global.MAX_FILES_ALLOWED_TO_UPLOAD = MAX_FILES_ALLOWED_TO_UPLOAD
global.MAX_BYTES_PER_FILE = MAX_BYTES_PER_FILE
global.isProduction = isProduction



// --- Антибот та антиспам ---
// порядок грає роль, перевіряю до сесій і всього решту
const { botDetector } = require("./Controllers/botController.js")
app.use(botDetector)

const { limiter } = require("./Controllers/botController.js")
app.use(limiter)



// --- Сесії ---
// @SESSION setup
const { userSession } = require("./Controllers/sessionController")
app.use(userSession()) // підключає сесію



// --- Основні маршрути ---

app.use((req, res, next) => {
    // Мідлвар суто для відобреження кнопки logout в хедері в кожному шаблоні

    // 📌 Express створює свій окремий res.locals для кожного запиту, і він автоматично доступний у шаблонах
    // тобто(!) якщо, наприклад роль зберегти в app.locals, натомість, а не в res.locals,
    // то кілька користувачів у системі можуть бачити не свою роль у шаблонах 😬
    const ROLE = req.session?.role || null

    res.locals.role = ROLE
    res.locals.isAuthenticated = !!req.session?._id

    // 📌 Ідентифікатор сесії створюється автоматично, і доступний прямо у req.sessionID. Використовую його
    // для socket.io коли сесії знищуються, щоб повідомляти залогінених користувачів (прописую в хедері)
    if (ROLE) res.locals.sessionID = req.sessionID

    next()
})



// *** Глобальні раути
app.get("/", async (req, res) => {
    res.send(`
        <ul>
            <li>
                <a href="/profile">Profile</a>
            </li>
        </ul>
    `)
})



app.get(['/profile', '/logout'], async (req, res) => {
    const { role } = req.session || {}
    // Частково дублює логіку roleController, але враховує роль і мінімізує редіректи.
    // Ціль - для зручності користування хедером    
    if (!role) return res.status(401).redirect('/login')
    res.redirect(`/${ role.toLowerCase() }${ req.path }`)
})



// Переадресація та логування повідомлень з шаблонів, в т.ч. з __errorHandler.js
app.post('/log', (req, res) => {
    const { role = "USER", firstName = "NONAME" } = req.session || {}
    const { level = "info", text } = req.body || {}

    // text може бути не текстом, може бути об*єктом, масивом і т.д.
    if (text && JSON.stringify(text).trim()) {
        const message = `${ role } ${ firstName } consoled ${ level }:`
        if (level === "error") {
            console.error(message, text)
        } else if (level === "warn") {
            console.warn(message, text)
        } else {
            console.log(message, text)
        }
    }

    res.end()
})



// ***  Публічні раути
app.use("/login", require("./Routers/loginRouter"))


// ***  Приватні раути
app.use("/user", require("./Routers/userRouter"))
app.use("/admin", require("./Routers/adminRouter"))



// *** Технічні раути


// Для опису кодів помилок в шаблоні error.ejs
const { STATUS_CODES } = require("http")


// *** Глобальний error handle. Отримує всі виклики з контролерів catch(e) { next(e) }

app.use(
    // Обробка 404.Page not found
    (req, res, next) => {
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(",")[0].trim()
        const err = new Error(`Can't find "${ req.originalUrl }", fwd="${ ip }"`)
        err.status = 404
        next(err)
    },

    // Обробка інших викликів із шаблонів по catch(e) { next(e) }
    (err, req, res, next) => {
        const status = err.status || 500
        const message = err.message || "Internal Server Error"

        // виводжу в консоль і записую в логи (для продакшена)
        isProduction
            ? console.error(`${ status }.${ message }`)
            : console.error(status, `\x1b[31m${ String(err) }\x1b[0m`, (err.stack?.split("\n")[1] || message).trim())

        // Цей механізм дозволяє (теоретично) повертати помилки в шаблони при обробці запитів (без переадресації) post і т.д.
        // Плюс підходу в тому, що з шаблону можна просто замість return.status(4..).json(...) і він опиниться тут throw new Error(...) і це забезпечує
        // однаковий шаблон відповіді в UI, наприклад { status: "error" | "ok", message } і т.д.
        const isFetchRequest = req.xhr || req.headers.accept?.includes("application/json")
        if (isFetchRequest) return res.status(status).json({ status: "error", message })

        res.status(status).render("../Views/__errors/errors.ejs", {
            error: err,
            statusCode: status,
            statusMeaning: STATUS_CODES[status],
            message, isProduction
        })
    }
)



const { startSocketIOWatcher } = require("./Controllers/socketWatcherController.js")



startSocketIOWatcher(
    // server
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущено на ${ isProduction ? `port: ${ PORT }` : devServer }`)
    }),

    // options for startSocketIOWatcher
    {
        cors: isProduction
            ? undefined
            : {
                origin: devServer,
                credentials: true
            }
    }
)