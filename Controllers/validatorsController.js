const { body, validationResult } = require('express-validator')


const { User } = require("../Models/userModel")



// Validators
const emailValidator = body("email").trim()
    .isLength({ min: 1 }).withMessage("Email must be specified")
    .isEmail().withMessage("Email must be a valid email")
    .custom(async (email) => {
        const exists = await User.exists({ email })
        if (exists) throw new Error("Email already in use")
        return true
    })

exports.emailValidator = emailValidator


const passwordMin = 8
const passwordMax = 25

const passwordValidator = (fieldName = "password") => body(fieldName).trim()
    .notEmpty().withMessage(`${ fieldName } is required`)
    .isLength({
        min: passwordMin,
        max: passwordMax
    }).withMessage(`${ fieldName } must be between ${ passwordMin } and ${ passwordMax } characters`)
    .matches(/\d/).withMessage(`${ fieldName } must contain at least one number`)
    .matches(/[A-Z]/).withMessage(`${ fieldName } must contain at least one uppercase latin letter`)
    .matches(/[a-z]/).withMessage(`${ fieldName } must contain at least one lowercase latin letter`)
    // .matches(/[!@#$%^&*]/).withMessage(`${ fieldName } must contain at least one special character`)

exports.passwordValidator = passwordValidator


const usernameMin = 3
const usernameMax = 20

const usernameValidator = body("username").trim()
    // .toLowerCase()
    .notEmpty().withMessage("Username is required")
    .isLength({
        min: usernameMin,
        max: usernameMax
    }).withMessage(`Username must be between ${ usernameMin } and ${ usernameMax } characters`)
    .matches(/^[a-zA-Z0-9._]+$/).withMessage("Username can contain only Latin letters, numbers, dots, and underscores")


const phoneValidator = body("phone")
    .trim()

    // sanitize
    .customSanitizer(value => {
        value = value || ""     // safeguard
        const startsWithPlus = value.startsWith("+")
        const digits = value.replace(/\D/g, "")
        return (startsWithPlus ? "+" : "") + digits
    })

    // length validation
    .custom(phone => {
        if (phone.startsWith("+")) {
            if (phone.length < 12) {
                throw new Error("Please check the phone number, with '+' it must be at least 12 characters long")
            }
        } else {
            if (phone.length < 10) {
                throw new Error("Phone number must contain at least 10 digits")
            }
        }
        return true
    })

    // перевірка унікальності з урахуванням того, що юзер може оновлювати свій номер
    .custom(async (phone, { req }) => {
        const last10 = phone.slice(-10).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")  // нормалізований номер для пошуку
        const currentUserId = req.params?.id || req.session?._id    // залежно від маршруту

        const exists = await User.findOne({
            phone: { $regex: `${ last10 }$` }
        }).lean()

        // якщо не знайдено — все ок
        if (!exists) return true

        // якщо знайдено, але це той самий юзер — теж ок
        if (currentUserId && exists._id.toString() === currentUserId.toString()) {
            return true
        }

        throw new Error("Phone already in use")
    })


const firstNameValidator = body("firstName").trim()
    .notEmpty().withMessage("First name is required")
    .isLength({ min: 1, max: 25 }).withMessage("First name must be between 1 and 25 characters")


const lastNameValidator = body("lastName").trim()
    .notEmpty().withMessage("Last name is required")
    .isLength({ min: 1, max: 25 }).withMessage("Last name must be between 1 and 25 characters")


// const companyValidator = body("company").trim()
//     .notEmpty().withMessage("Company name is required")
//     .isLength({ min: 1, max: 30 }).withMessage("Company name must be between 1 and 30 characters")


// const mcValidator = body("MC").trim()
//     .customSanitizer(value => value.replace(/\D/g, '')) // 👉 очистили все, крім цифр
//     .notEmpty().withMessage("MC number is required")
//     .matches(/^\d{5,7}$/).withMessage("MC number must contain 5 to 7 digits");


const allowUsePhoneValidator = body("allowUsePhone").toBoolean() // ← автоматично перетворює 'on' → true, undefined → false



// Найбільш широкий набір правил валідації, використовується для
// перевірки даних з форми реєстрації
const registerValidationRules = [
    emailValidator,
    passwordValidator(),
    usernameValidator,
    phoneValidator,

    // firstNameValidator,
    // lastNameValidator,
    // companyValidator,
    // mcValidator,
    
    allowUsePhoneValidator
]

// Експорт масиву валідаторів. Повний їх набір використовується тільки(!) при реєстрації
exports.registerValidationRules = registerValidationRules


// 🧠 Розширюваність: використати мапу валідаторів
// Мапа валідаторів: "поле" - "валідатор". Відмінність від registerValidationRules в тому, що
// можна використовувати окремі валідатори або їх набір, а не всі одразу. Наприклад, при зміні
// полів юзера(User), може змінитися лише окреме поле чи їх група, не обов*язково всі, а якщо щось
// відсутнє, то registerValidationRules поверне помилку

const validatorsMap = {
    email: emailValidator,
    password: passwordValidator,
    username: usernameValidator,
    phone: phoneValidator,
    firstName: firstNameValidator,
    lastName: lastNameValidator,
    // company: companyValidator,
    // MC: mcValidator,
}


// Валідує групу полів за відповідними (!) валідаторами
exports.validateFields = async(req, fieldsToValidate = {}) => {
    // fieldsToValidate повинно бути об*єктом: "назва поля" - "значення"
    if (!fieldsToValidate || typeof fieldsToValidate !== "object" || Array.isArray(fieldsToValidate)) return

    // поля повинні бути в тілі запиту
    req.body = { ...req.body, ...fieldsToValidate }

    const validators = Object.keys(fieldsToValidate)
        .map(field => validatorsMap[field]?.run(req))
        .filter(Boolean)

    // Можна запускати валідатори окремо, з await - це Послідовний варіант, але Паралельна версія
    // (await Promise.all) в 2-3 рази швидша. Чим більше полів, тим швидша паралельна версія
    await Promise.all(validators)

    return collectValidationErrors (req)
}


// Утиліта, не експортується. Залишає в масиві помилок тільки "нечутливі поля"
// по замовчуванню, в якості помилки в шаблон передаються паролі, токени і т.д.
const filterErrorMessages = (validationErrors = []) => {
    return validationErrors.map(({ msg, path, type }) => ({ msg, path, type }))
}


// Використовується для перевірки за окремим валідатором
function collectValidationErrors (req) {
    const validationErrors = validationResult(req)
    // Фільтрую, бо в якості помилки в шаблон передаються паролі, токени і т.д.
    return filterErrorMessages(validationErrors.array())
}

exports.collectValidationErrors = collectValidationErrors


// Обробляє виявлені помилки - повертає в шаблон, генерує помилку чи пропускає далі
exports.handleValidationErrors = (options = {}) => (req, res, next) => {

    const {
        returnAlways = false,
        returnIfAny = false,
        errStatus = 400,
        template,     //  шлях куди перевести
    } = options

    const errors = collectValidationErrors(req)

    if (returnAlways) return template
        ? res.status(errStatus).render(template, { errors, body: req.body || {} })
        : res.json(errors)

    if (returnIfAny && errors.length) return template
        ? res.status(errStatus).render(template, { errors, body: req.body || {} })
        : res.status(errStatus).json(errors)

    next()
}


// 💡 Попередні інструменти валідації полів для реєстрації юзера зроблені для використання в якості мідлварів,
// якщо десь в коді потрібно використати валідацію у вигляді функції, то необхідно використовувати validateNewUserRegistration
exports.validateNewUserRegistration = async (req) => {
    try {
        for (const validator of registerValidationRules) {
            await validator.run(req)
        }

        const errors = collectValidationErrors(req)
        
        return {
            validationErrors: errors,
            validationStatus: errors.length ? 400 : 200,
            validationMessage: errors.length && `Validation error${ errors.length > 1 ? "s" : "" }: ${ errors.map(({ msg }) => msg).join("; ") }`
        }
    } catch(error) {
        return {
            validationStatus: 500,
            validationMessage: error
        }
    }
}


// *** Автогенерація паролю. Пароль відповідає правилам валідації
const shuffle = (str) => [...str].sort(() => Math.random() - 0.5).join('')
const randomChar = (chars) => chars[Math.floor(Math.random() * chars.length)]

// 👉 Одна велика буква
// 👉 Одна маленька буква, 🤔 зробимо тут 2
const lowRegLetters = 2
// 👉 Решта - цифри
const digitsLenght = passwordMin - 1 - lowRegLetters

exports.generateValidPassword = () => shuffle(
    randomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ') +
    Array.from({ length: lowRegLetters }, () => randomChar('abcdefghijklmnopqrstuvwxyz')).join('') +
    Array.from({ length: digitsLenght }, () => randomChar('0123456789')).join('')
)