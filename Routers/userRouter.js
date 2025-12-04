const express = require('express')

// throttling (rate limiting) на окремі раути
const rateLimit = require('express-rate-limit')


// Controllers
const authController = require("../Controllers/authController")
const loginController = require("../Controllers/loginController")
const registerController = require("../Controllers/registerController")

const roleController = require('../Controllers/roleController')
const validatorsController = require('../Controllers/validatorsController')


const sharedUserAdminRoutes = require('./sharedUserAdminRoutes')


const userRouter = express.Router()
.use(roleController.checkRole("USER")) // перевіряє роль


// *** ПУБЛІЧНІ раути

// @GET /user/register
// render registration form
userRouter.get('/register', registerController.index)


// @POST /user/register
// validates user registration request, handle phone/email auth, creates new user
userRouter.post('/register', 
    // Нормалізація, далі по ланцюгу передаються вже очищені дані
    registerController.normalizePhone,
    registerController.normalizeEmail,
    registerController.normalizeUsername,
    // registerController.normalizeTextFields,
    // Валідація
    validatorsController.registerValidationRules,
    validatorsController.handleValidationErrors({
        returnIfAny: true,
        template: "../Views/register.ejs"
    }),
    // Створення нового користувача
    registerController.registerNewUser,
    loginController.index
)


// @GET /user/reset-password
// reset password form
// userRouter.get('/reset-password', authController.prepareResetPasswordForm)

// @POST /user/reset-password
// reset password
// userRouter.post('/reset-password', 
//     rateLimit({
//         windowMs: 60 * 1000, // 1 хвилина
//         max: 2, // максимум 3 запити на хвилину
//         message: 'Too many requests, please try again later.'
//     }),
//     authController.resetUserPassword
// )


// *** НЕПУБЛІЧНІ раути, пов*язані із наявністю сесії


// Інжект - перед рендером профайлу
const beforeProfileRender = async (req, res, next) => {
    try {
        // Передаю в профайл параметри командної строки, масив замовлень клієнта
        res.locals.query = req.query || {}
        // res.locals.checkouts = await getCheckoutsByEmail(req)

        // return res.json(res.locals.checkouts[0])

        next()
    } catch (error) {
        next(error)
    }
}



// спільні раути
userRouter.use(sharedUserAdminRoutes({
    beforeProfileRender     //  інжект мідлвару, виконається перед рендером профайлу
}))



module.exports = userRouter