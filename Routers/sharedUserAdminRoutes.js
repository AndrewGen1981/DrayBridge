const express = require("express")


const authController = require("../Controllers/authController")
const loginController = require("../Controllers/loginController")
const profileController = require("../Controllers/profileController")

const validatorsController = require("../Controllers/validatorsController")



//  мікроутиліта, щоб перевіряти чи передано якийсь додатковий мідрвар
const def = (fn) => typeof fn === 'function' ? fn : (req, res, next) => next()


module.exports = ({ beforeProfileRender } = {}) => {

    const sharedRouter = express.Router()

    // @GET /user, /user/profile
    // @GET /admin, /admin/profile
    // 🔐 Непублічний раут. Рендер кабінету юзера/адміна
    sharedRouter.get(["/", "/profile"],
        def(beforeProfileRender),
        profileController.userProfile
    )
    
    
    // @POST /user/validate-password
    // @POST /admin/validate-password
    // Публічний раут. Використовується щоб перевірити введений пароль правилам валідації паролів
    // відповідно до правил в validatorsController/passwordValidator
    sharedRouter.post("/validate-password",
        validatorsController.passwordValidator(),
        validatorsController.handleValidationErrors({ returnAlways: true })
    )


    // @POST /user/validate-email
    // @POST /admin/validate-email
    // Публічний раут. Використовується щоб перевірити введений email правилам валідації
    // відповідно до правил в validatorsController/emailValidator
    sharedRouter.post("/validate-email",
        validatorsController.emailValidator,
        validatorsController.handleValidationErrors({ returnAlways: true })
    )


    // @POST /user/validate-username
    // @POST /admin/validate-username
    // Публічний раут. Використовується при reset-password, щоб підтвердити відсилання коду
    sharedRouter.post("/validate-username", authController.checkoutUsername)

    
    
    // @POST user/check-password
    // @POST admin/check-password
    // 🔐 Непублічний раут. Використовується для перевірки введеного паролю з тим, що збережений в сесії,
    // наприклад з форми для зміни паролю (з профайлу юзера чи адміна)
    sharedRouter.post("/check-password", authController.checkoutPassword)


    // @POST /user/password-update
    // @POST /admin/password-update
    // 🔐 Непублічний раут. Оновлює пароль юзера/адміна
    sharedRouter.post('/password-update',
        validatorsController.passwordValidator("new_password"),
        validatorsController.handleValidationErrors({ returnIfAny: true }),
        authController.updateUserPassword
    )


    // @GET /user/must-change-password
    // @GET /admin/must-change-password
    // 🔐 Непублічний раут. Якщо mustChangePassword = true, користувач повинен змінити пароль
    // перед доступом до інших маршрутів. Контроль в roleController.js
    sharedRouter.get('/must-change-password', authController.mustChangePassword)



    // @POST /user/update-user
    // @POST /admin/update-user
    // 🔐 Непублічний раут. Оновлює дані юзера/адміна по id, який можна передавати
    // як в тілі, так і в параметрах запиту
    sharedRouter.post("/update-user", profileController.userUpdate)
    sharedRouter.post("/update-user/:id", profileController.userUpdate)


    // @* /user/logout
    // @* /admin/logout
    // 🔐 Непублічний раут. Видаляє сесію юзера/адміна
    sharedRouter.all('/logout', loginController.logOut)


    return sharedRouter

}