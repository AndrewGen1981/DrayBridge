const mongoose = require('mongoose')


const { TERMINALS_ENUM } = require("../Config/terminalsCatalog.js")


// ***  Схема для терміналу


const terminalSchema = new mongoose.Schema({

    key: {
        type: String,
        enum: TERMINALS_ENUM,
        lowercase: true,
        require: true,
        unique: true,
        index: true,
    },

    active: { type: Boolean, default: true },

    session: {
        _id: false,
        cookies: {
            _id: false,
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        lastLoginAt: Date,
        lastCheckedAt: Date,
        isAlive: { type: Boolean, index: true },
    },

    stats: {
        _id: false,
        totalContainers: Number,
        statuses: {
            _id: false,
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        lastUpdatedAt: Date
    },

    health: {
        _id: false,
        lastError: {
            _id: false,
            message: String,
            at: Date
        },
        lastSuccessAt: Date
    }

}, {
    // timestamps: true,
    collection: "_TERMINALS"
})



module.exports = { 
    Terminal: mongoose.model("terminalModel", terminalSchema),
}