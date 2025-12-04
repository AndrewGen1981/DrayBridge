// ***  Логування в базу працює тільки в продуктиві
const mongoose = require("mongoose")


// Ініціалізація підключення до MongoDB
mongoose.set("strictQuery", false)
mongoose.connect(process.env.MONGO_URI_DATA, {
    // useNewUrlParser: true,
    // useUnifiedTopology: true
}).then(() => {
    if (global.isProduction) console.log("[Logger] Connected to MongoDB")
}).catch(err => {
    console.error("[Logger] MongoDB connection error:", err)
})



// Схема логів
const LogSchema = new mongoose.Schema({
    level: String,
    message: String,

    // TTL поле
    createdAt: {
        type: Date,
        default: Date.now,
        // expires: '30d'  // ⏱️ видаляється через 30 днів
        expires: '3d'
    }
}, {
    collection: "__Logs"
})


const LogModel = mongoose.model("Log", LogSchema)
module.exports = {
    LogModel
}


// Зберігаємо оригінальні методи
const originalLog = console.log
const originalWarn = console.warn
const originalError = console.error

// без async - не чекаю, передаю просто на збереження
function createLog({ level = "info", args }) {
    if (!args?.length || !global?.isProduction) return

    LogModel
    .create({ level, message: args.map(arg => stringify(arg)).join(" ")})
    .catch(err => originalError(`[Logger] Failed to save ${ level.toUpperCase() } log: `, err))
}


// Перевизначення console.log
console.log = function (...args) {
    originalLog.apply(console, args)
    createLog({ args })
}

// Перевизначення console.warn
console.warn = function (...args) {
    originalWarn.apply(console, args)
    createLog({ level: "warn", args })
}

// Перевизначення console.error
console.error = function (...args) {
    originalError.apply(console, args)
    createLog({ level: "error", args })
}


// Функція безпечної конверсії аргументів у строку
function stringify(arg) {
    if (typeof arg === "object") {
        try {
            return JSON.stringify(arg)
        } catch {
            return "[Unserializable Object]"
        }
    }
    return String(arg)
}