const mongoose = require('mongoose')


// Масив можливих ролей
const USER_TYPES = { USER: "🧑", ADMIN: "👨‍💼", SUPER: "😎" }
const USER_ROLES = Object.keys(USER_TYPES)

// Масив можливих статусів
const USER_STATUSES = [ "ACTIVE", "BLOCKED" ]

// Масив повноважень
const USER_AUTH = [ "READONLY", "READWRITE", "SUPERVISOR" ]


const userSchema = new mongoose.Schema({
    email: { type: String, lowercase: true, required: true, unique: true },
    username: { type: String, required: true },
    
    password: { type: String, required: true },
    mustChangePassword: Boolean,   //  автозгенерований пароль, потрібно змінити при 1му логіні

    firstName: String,
    lastName: String,
    company: String,

    phone: String,
    allowUsePhone: Boolean,

    status: {
        type: String,
        enum: USER_STATUSES,    //  ACTIVE, BLOCKED
        default: "ACTIVE",
        uppercase: true,
        required: true,
    },

    role: {
        type: String,
        enum: USER_ROLES,   //  USER, ADMIN, SUPER
        default: "USER",
        uppercase: true,
        required: true,
    },

    auth: {
        type: String,
        enum: USER_AUTH,   //  "READONLY", "READWRITE", "SUPERVISOR"
        default: "READWRITE",
        uppercase: true,
        required: true,
    },

    configs: {
        _id: false,
        PAGE_SIZE: {
            type: Number,
            default: 30,
        },
    },

    comment: String,
}, {
    timestamps: true,
    collection: 'USERS'
})



module.exports = { 
    User: mongoose.model("userSchema", userSchema),
    USER_TYPES,
    USER_ROLES,
    USER_STATUSES,
}