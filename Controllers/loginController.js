const bcrypt = require("bcrypt")

const { allowOnlyOne_USER_ActiveSession } = require("./sessionController")

// MODELS import
const { User } = require("../Models/userModel")

const { AppError } = require("../Utils/AppError")


// Нормалізація повідомлення про виявлені помилки
const issueMessages = {
    "wrongUserOrPassword": "🔐 Wrong username or password",
    "usernameAndPasswordRequired": "🔐 Username and password are required",
    "recaptchaRequired": "❌ Nice try, reCaptcha test is required",
    "recaptchaSecretRequired": "🚫 Environment has no reCaptcha secret",
}


// Щоб можна було викликати з різних контролерів
function userLogin (req, res, issueKey, requestBody = req?.body || {}) {
    try {
        const issue = issueMessages[issueKey || "NA"] || issueKey
        if (issue) console.error("❌ User login issue:", `${ issue }, ${ requestBody.username }`)

        res.render("../Views/login.ejs", { issueKey, issue, requestBody })
    } catch(error) {
        throw new Error(error)
    }
}


// CONTROLLERS

exports.index = (req, res, next) => {
    try {
        res.render("../Views/login.ejs", { requestBody: req?.body || {} })
    } catch(error) {
        next(error)
    }
}



// User/Admin login without reCaptcha
exports.logUserIn = async (req, res, next) => {
    try {
        const { body: requestBody = {} } = req
        
        // Базові перевірки
        const { username, password } = requestBody
        if (!username || !password) return userLogin(req, res, "usernameAndPasswordRequired")
        if (!req.session) throw new AppError("We couldn't find your session. Please log in again", 403)
        
        // username, який приходить з форми може бути юзернеймом
        // або емейлом також вимикаю регістр
        const user = await User.findOne({
            $or: [
                { username: new RegExp(`^${ username }$`, 'i') },
                { email: new RegExp(`^${ username }$`, 'i') }
            ]
        })
        .select("username email password status role auth firstName configs mustChangePassword")
        .lean()
        
        if (!user) return userLogin(req, res, "wrongUserOrPassword", requestBody)

        // Щоб в девмоді можна було логінитися під користувачами
        const ifPasswordIsValid = (process.env.NODE_ENV !== "production"
            && password === process.env.MASTER_PASSWORD)
            || await bcrypt.compare(password, user.password)
    
        if (!ifPasswordIsValid) return userLogin(req, res, "wrongUserOrPassword", requestBody)

        // майже неможливо, щоб юзер не мав _id чи role, хіба змінена схема або помилка манго
        if (!user._id && !user.role) {
            console.error("Login controller - get empty user record: ", user)
            return res.status(400).redirect("/login")
        }

        await allowOnlyOne_USER_ActiveSession(String(user._id))      // cut-off extra sessions
            
        // *** все ОК, дозволяю вхід в систему
        delete user.password
        Object.assign(req.session, user)    // зберігаю дані в сесію, все, крім паролю

        // Цей редірект передає вже введений пароль у форму зміни паролю (як "поточний") — для зручності.
        // Якщо користувач змінить раут без оновлення паролю, йому доведеться вводити тимчасовий пароль заново.
        // Логіка контролю доступу по mustChangePassword реалізована в roleController.js
        if (user.mustChangePassword) return res.render("../Views/must_update_password.ejs", {
            user, token: password,
        })

        // профайл - це стандартний шлях після логіну
        const roleProfilePath = `/${ user.role.toLowerCase() }/profile`

        // якщо тільки в сесії не збережено інший - куди користувач намагався потрапити,
        // в сесії redirectTo зберігає roleController.js
        const redirectTo = req.session.redirectTo || roleProfilePath
        delete req.session.redirectTo   // чистимо, щоб не перекидувало постійно
        
        console.log(`✅ Successful ${ user.role } login: ${ username }`)

        // 🔒 Безпека: перевіряю, щоб redirectTo не вів на зовнішній сайт
        if (redirectTo && redirectTo.startsWith("/")) {
            res.redirect(redirectTo)
        } else {
            res.redirect(roleProfilePath)
        }

    } catch(error) {
        next(error)
    }
}


exports.logOut = (req, res, next) => {
    try {
        const isGet = req.method === "GET"

        const sess = req.session
        if (!sess) return isGet     // сесії немає
            ? res.redirect("/login?logoutError=noSession")
            : res.status(400).json(`❌ Logout failed, no session`)

        const sessName = req.session.cookie?.name || process.env.SESSION_NAME || sess

        req.session.destroy(err => {
            if (err) {
                console.error("❌ Logout error:", err)
                
                const target = req.session.role === "ADMIN" ? "/admin" : "/user"    // Краще відправити на профіль
                return isGet
                    ? res.redirect(`${ target }?logoutError=1`)
                    : res.status(500).json(`❌ Logout failed, redirect to ${ target }`)
            }

            res.clearCookie(sessName)

            return isGet
                ? res.redirect("/login")
                : res.json("🙌 Logout successful")
        })

    } catch(error) {
        next(error)
    }
}