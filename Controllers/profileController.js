const { User } = require('../Models/userModel')


const { AppError } = require('../Utils/AppError')
const { validateFields } = require('./validatorsController')



// home: user profile data retrieving
exports.userProfile = async(req, res, next) => {
    try {
        const isGet = req.method === "GET"

        const { _id: id, role } = req.session || {}

        if (!id || !role) return isGet
            ? res.status(401).redirect("/login")
            : res.status(401).json(`❌ Please login`)

        const user = await User.findById(id).select('-__v -password -mustChangePassword').lean()
        if (!user) return isGet
            ? res.status(401).redirect("/login")
            : res.status(401).json(`❌ Please login`)

        isGet
            ? res.render(`../Views/${ user.role.toLowerCase() }_profile.ejs`, { user })
            : res.json(user)

    } catch(error) {
        next(error)
    }
}



// user data updating
// Форма у шаблоні робить запит на зміну даних, контролер змінює, віддає дані і помилки, якщо є
// тут можна відпрацьовавути відносно ролі (поки однаково), бо сюди є доступ також у адмінів
exports.userUpdate = async(req, res, next) => {
    try {
        const userId = req.body?.id || req.params?.id
        if (!userId) throw new AppError("User ID is required", 400)

        const { _id, role } = req.session || {}
        if (!_id || !role?.trim()) throw new AppError("Please log in", 401)

        // role "USER" не може змінювати інших юзерів, адмін - може
        if (role === "USER" && userId !== _id)
            throw new AppError("Users can udpate only their own data", 403)

        const { changes } = req.body || {}
        if (!changes?.length) throw new AppError("No changes detected", 400)
        
        // 1) формую з масиву [{ name: 'lastName', value: 'Andr' }] об*єкт lastName: 'Andr'
        const updates = {}

        changes.forEach(({ name, value }) => {
            if (role !== "USER" || name !== "email") {  // skip email for USER
                updates[name] = value
            }
        })

        // Якщо роль НЕ USER → адмін може оновлювати email → пропускається все.
        // Якщо роль USER → всі поля зберігаються крім email.
        // Якщо вхід містив тільки email → updates порожній → кидається помилка.

        if (!Object.keys(updates).length)
            throw new AppError("You cannot update your email directly. Please contact support.", 422)

        // 2) та передаю його на валідацію, якщо є помилки, повертаю в шаблон
        const err = await validateFields(req, updates)
        if (err.length)
            throw new AppError(
                `Validation errors found:\n\n${ err
                    .map((e) => `• ${ e.msg || "NA" }`)
                    .join("\n")}`,
                422
            )

        // Після валідації очищені дані знаходяться в body
        // початковий об*єкт changes теж там, необхідно видалити
        const { changes: noneed, ...updatedFields } = req.body

        // role "USER" не може змінити свою роль, prevent user role escalation
        // вказую тут, а не до валідації (in case sanitize repopulated something)
        if (role === "USER" && updatedFields.role) delete updatedFields.role
        
        const modified = await User.updateOne(
            { _id: userId },
            { $set: updatedFields }
        )

        if (!modified.modifiedCount) throw new AppError("No changes detected", 422)

        res.json({
            result: Boolean(modified.modifiedCount),
            updatedFields
        })

    } catch(error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}