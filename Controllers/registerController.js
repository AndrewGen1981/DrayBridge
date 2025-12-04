// User REGISTRATION Controller
// is used in the userRouter.js

const bcrypt = require('bcrypt')


// MODELS import
// const { AuthSMS } = require("../../models/authSMSModel")
const { User } = require("../Models/userModel")
const { fulfillPerSchema } = require("../Utils/mongoose_utils")



function userRegister(req, res, errors = [], body = {}) {
    try {
        res.render("../Views/register.ejs", {
            errors: Array.isArray(errors) ? errors : [ errors ],
            body: req.body || body })
    } catch(e) {
        console.error(e)
    }
}



exports.index = (req, res, next) => {
    try {
        userRegister(req, res)
    } catch(e) {
        next(e)
    }    
}


// Нормалізація телефону
exports.normalizePhone = (req, res, next) => {
    // if (req.body?.phone) req.body.phone = req.body.phone.replace(/\D/g, '') // тільки цифри
    next()
}


// Нормалізація емейлу
exports.normalizeEmail = (req, res, next) => {
    if (req.body?.email) req.body.email = req.body.email.trim().toLowerCase()
    next()
}


// Нормалізація юзернейму
exports.normalizeUsername = (req, res, next) => {
    if (req.body?.username) req.body.username = req.body.username.replace(/\s+/g, '') // прибираємо всі пробіли
    next()
}



exports.registerNewUser = async (req, res, next) => {
    try {

        return userRegister(req, res, "❌ Disabled for now")

        // Базові перевірки
        const { CAPTCHA_SECRET_KEY } = process.env
        if (!CAPTCHA_SECRET_KEY) return userRegister(req, res, "🚫 Environment has no reCaptcha secret")

        const { body: requestBody = {} } = req
        
        // Getting site key from client side
        const response_key = requestBody["g-recaptcha-response"]
        if (!response_key) return userRegister(req, res, "❌ Nice try, reCaptcha test is required")
        
        // Hitting POST request to the URL, Google will respond with success or error scenario
        const reCaptchaURL = `https://www.google.com/recaptcha/api/siteverify?secret=${ CAPTCHA_SECRET_KEY }&response=${ response_key }`

        // Якщо Google не відповість або відповість повільно — запит «зависне» на невизначений час. Рішення - використовувати таймаут
        const controller = new AbortController()    //  це тільки для fetch, у axios це вбудована можливість
        const timeout = setTimeout(() => controller.abort(), 10000)  // 10s таймаут - це передається в POST

        fetch(reCaptchaURL, { method: "POST", signal: controller.signal })
        .then((response) => response.json())
        .then(async(google_res) => {

            if (google_res?.success === false) {
                const errors = google_res["error-codes"] || "reCaptcha test failed"
                return userRegister(req, res, errors, requestBody)
            }

            const newUser = fulfillPerSchema(requestBody, User)

            // Це майже неможливо, але переконаюся, що ці поля присутні
            if (!newUser?.username) return userRegister(req, res, "🔐 Username is required", requestBody)
            if (!newUser?.password) return userRegister(req, res, "🔐 Password is required", requestBody)

            newUser.password = await bcrypt.hash(newUser.password, 10)

            const user = await User.create(newUser)

            // Одразу логін і перенаправити в кабінет
            // req.session._id = user._id
            // req.session.email = user.email
            // req.session.username = user.username
            // res.redirect('/user/profile')

            // Але ні, я перенаправлю на loginController.logUserIn з прописаними полями
            // щоб перевірити реєстрацію користувача. Це потім можна змінити

            req.body.loginTitle = "Registered successfully!"

            next()
  
        })
        .catch(error => {
            return userRegister(req, res, error.message || error, requestBody)
        })
        .finally(() => clearTimeout(timeout))
    
    } catch(e) {
        next(e)
    }
}