const bcrypt = require('bcrypt')

const { User } =require("../Models/userModel")

// Контролери
// const { sendTetxMessage, getTextMessage } = require("./twilioController.js")
const { generateValidPassword } = require("./validatorsController.js")



// Використовується для перевірки введеного паролю з тим, що збережений в сесії,
// наприклад з форми для зміни паролю (з профайлу юзера чи адміна)
exports.checkoutPassword = async (req, res, next) => {
    try {
        const { password } = req.body || {}
        const { _id: id, role } = req.session || {}

        if(!id || !role) return res.status(401).json("You are not logged in. Please sign in and try again")
        
        const user = await User.findById(id).select("role password")
        if(!user) return res.status(401).json("We couldn't find your session. Please log in again")
        
        if (role !== user.role) return res.status(403).json(`Access denied. This route is only available to users with the "${ user.role }" role`)
        
        const isCurrentPasswordOk = await bcrypt.compare(password, user.password)
        return isCurrentPasswordOk
            ? res.status(200).json()
            : res.status(403).json()

    } catch(e) {
        console.error(e)
        res.status(500).json({ issue: e.message })
    }
}


// POST from user account to update password
exports.updateUserPassword = async (req, res, next) => {
    try {
        const { current_password, new_password } = req.body || {}
        const { _id: id, role } = req.session || {}

        // Це практично не можливо, бо на вході працюють валідатори та checkRole, але перевіримо
        if (!new_password || !current_password) return res.status(400).json("Both current and new passwords are required")
        if (!id || !role) return res.status(401).json("You are not logged in. Please sign in and try again")

        if (current_password === new_password) return res.status(422).json("Your new password must be different from the current one")

        const user = await User.findById(id).select("password role mustChangePassword")
        if (!user) return res.status(401).json("We couldn't find your session. Please log in again")

        if (role !== user.role) return res.status(403).json(`Access denied. This route is only available to users with the "${ user.role }" role`)

        const isCurrentPasswordOk = await bcrypt.compare(current_password, user.password)
        if (!isCurrentPasswordOk) return res.status(403).json("The current password you entered is incorrect")

        // В будь-якому разі перезаписую поле mustChangePassword, неважливо чи це не зміна one-time temporary password чи ні
        const hashedPassword = await bcrypt.hash(new_password, 10)
        await User.findByIdAndUpdate(id, { password: hashedPassword, mustChangePassword: false })
        delete req.session.mustChangePassword

        // res.status(204) //   204 - не повертає тіло
        res.json()

    } catch(error) {
        next(error)
    }
}



// POST from user account to update password
exports.mustChangePassword = async (req, res, next) => {
    try {
        const { _id } = req.session || {}

        const user = await User.findById(_id).select('-__v -password').lean()
        res.render("../Views/must_update_password.ejs", { user })
        
    } catch(error) {
        next(error)
    }
}



// POST from user account to update password
exports.prepareResetPasswordForm = async (req, res, next) => {
    try {

        res.render("../Views/reset_password.ejs")
        
    } catch(error) {
        next(error)
    }
}



// Використовується для перевірки email/username при reset-password,
exports.checkoutUsername = async (req, res, next) => {
    try {
        const { usernameEmail } = req.body || {}

        // Тут usernameEmail може бути username або email, також вимикаю регістр
        const user = await User.findOne({
            $or: [
                { username: new RegExp(`^${ usernameEmail }$`, 'i') },
                { email: new RegExp(`^${ usernameEmail }$`, 'i') }
            ]
        })
        .select("phone")
        .lean()

        if(!user) return res.status(404).json(`User with username/email "${ usernameEmail }" was not found`)
        if(!user.phone) return res.status(404).json(`User "${ usernameEmail }" has no phone number`)

        // показую лише частину номеру (останні 4 цифри)
        user.phone = `••••${ user.phone.slice(-4) }`
        
        return res.json({ user })

    } catch(error) {
        console.error(error)
        res.status(500).json(error)
    }
}



// Використовується для reset-password,
exports.resetUserPassword = async (req, res, next) => {
    try {
        const { userId, phone, usernameEmail } = req.body || {}

        // Ще раз все перевіряю. Тут теж usernameEmail може бути username або email
        const user = await User.findOne({
            $or: [
                { username: new RegExp(`^${ usernameEmail }$`, 'i') },
                { email: new RegExp(`^${ usernameEmail }$`, 'i') }
            ]
        })
        .select("phone")

        if(!user) return res.status(404).json("User not found")
        
        const { _id: ID, phone: PHONE } = user

        const isIDsOK = userId == ID   //  тут не строга відповідність
        const isPhonesOK = phone && PHONE && PHONE.slice(-4) === phone.slice(-4)

        if (!isIDsOK || !isPhonesOK) return res.status(403).json("Inconsistency of basic data")

        // генерую новий пароль
        const new_password = generateValidPassword()

        // Скидаю пароль та оновлюю поля
        user.password  = await bcrypt.hash(new_password, 10)
        user.mustChangePassword = true
        await user.save()

        // повідомлення про автозгенерований пароль
        const { status: twilioStatus, message: twilioMessage } = await sendTetxMessage({
            phone: user.phone,
            textMessage: getTextMessage("auto-generated-password", new_password)
        })

        if (twilioStatus !== 200) return res.status(twilioStatus).json(twilioMessage)

        return res.json()

    } catch(error) {
        console.error(error)
        res.status(500).json(error)
    }
}