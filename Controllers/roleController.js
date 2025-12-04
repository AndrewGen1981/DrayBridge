// *** Глобальні константи
const { USER_ROLES } = require("../Models/userModel.js")


// Список публічних раутів (дозволених без логіну)
// АЛЕ, вони перевіряються на redirectToHome логіку. Тобто, залогіненим туди не можна, всім іншим - можна
const publicPaths = [ "/login", "/register", "/reset-password", "/validate-username" ]


// Ролі READONLY за замовчуванням заборонені всі POST раути, але є виключення, наприклад перевірка чи зміна паролю
const readonlyAllowedPOSTs = [ "/check-password", "/password-update", "/find-by-oem-refs", "/update-max-on-page" ]


// Сюди можна взагалі всім
const publicWhiteListPaths = [
    // validate-password це проста перевірка паролю на відповідність умовам: скільки символів,
    // великі/малі і т.д. Тобто правила валідації з registerController/passwordValidator
    // В жодному разі не аутентифікація. Будь-що пов*язане із сесією тут бути не може!!!
    "/validate-password",
    // "/snapshot-via-USDOT"   // <= це виключно технічний раут, див. server.js
]


// Список ролей, з якими дозволено відвідування раутів
const allowedStatuses = [ "ACTIVE" ]

// Відомі системі ролі, просто для того, щоб відслідковувати не відомі ролі
const allowedRoles = USER_ROLES || [ "USER", "ADMIN" ]



exports.checkRole = (expectedRole = "/") => {

    return function (req, res, next) {
        const { _id, status, role, auth, mustChangePassword } = req.session || {}

        // Дозволені раути, жодних перевірок
        const isPublicWhiteListPath = publicWhiteListPaths.some(p => req.path === p || req.path.startsWith(p + "/"))
        if (isPublicWhiteListPath) return next()

        // Зберігаю метод, бо res.redirect доцільно тільки при GET запитах
        const isGet = req.method === "GET"

        // 🔍 Перевіряю на публічні раути; req.path іноді буває лише частковим (без /register/step2 тощо)
        const isPublicPath = publicPaths.some(p => req.path === p || req.path.startsWith(p + "/"))

        // ⛔️ Не залогінений
        if (!_id || !role) {
            if (isPublicPath) return next()

            //  перевірка типу-redirectToLogin, з урахуванням методу
            if (isGet) {
                req.session.redirectTo = req.originalUrl    // зберігаємо оригінальний шлях, куди намагався потрапити користувач
                return res.redirect("/login")
            }

            return res.status(401).json("Unauthorized. Please login")
        }

        // ⚠️ Некоректний статус
        if (!allowedStatuses.includes(status)) {
            return isGet
                ? res.status(403).send(`<h1 style="text-align:center;color:crimson;margin-block:3em;">Sorry, your status in the system is "${ status || 'UNKNOWN' }"</h1>`)
                : res.status(403).json(`Sorry, your status in the system is "${ status || 'UNKNOWN' }"`)
        }

        // ✅ Роль відповідає очікуваній
        if (role === expectedRole) {
            // ⚠️ Якщо mustChangePassword = true, користувач повинен змінити пароль перед доступом до інших маршрутів.
            // ✅ Дозволяємо тільки GET/POST запити до:
            //     - /must-change-password: форма для зміни пароля
            //     - /password-update: обробка сабміту форми
            // ❌ Усі інші запити блокуються (403 або редірект), поки користувач не змінить пароль.

            if (mustChangePassword) {
                const allowedOnly = [ "/must-change-password", "/check-password", "/password-update" ]
                const isChangePasswordPath = allowedOnly.some(path => req.path === path || req.path.startsWith(`${ path }/`))

                if (!isChangePasswordPath) {
                    return isGet
                        ? res.redirect(`/${ role.toLowerCase() }/must-change-password`)
                        : res.status(403).json("You must change your password before accessing other parts of the system")
                }
            }

            //  🧭 Перевірка типу-redirectToHome, але з урахуванням методу.
            if (isPublicPath) return isGet
                ? res.redirect(`/${ role.toLowerCase() }/profile`)
                : res.status(400).json("Already authorized")


            // ---  Контроль типу доступа - auth

            // якщо це GET, то дозволяю доступ з будь-якими правами (auth)
            if (isGet) return next()

            // якщо НЕ GET, то перевіряю повноваження чи доступ до дозволених POST
            return auth === "READONLY" && !readonlyAllowedPOSTs.includes(req.path)
                ? res.status(401).json("Sorry, your auth is READONLY")
                : next()
        }

        // 🚫 Роль не відповідає очікуваній
        // 🕵️ але відома
        if (allowedRoles.includes(role)) return isGet
            ? res.redirect(`/${ role.toLowerCase() }`)
            : res.status(403).json(`Forbidden: ${ role } role required`)

        // 🕵️ Невідома роль
        return isGet
            ? res.status(403).send("<h1>🧐 Show yourself, stranger! 🔍 <a href='/user'>Login</a></h1>")
            : res.status(403).json("Forbidden: unknown ROLE")
    }

}