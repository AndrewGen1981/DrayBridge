const mongoose = require('mongoose')


const { TERMINALS_ENUM } = require("../Config/terminalsCatalog.js")


// ***  Схема для контейнера


const containerSchema = new mongoose.Schema({
    number: {
        type: String,
        require: true,
        unique: true,
        index: true
    },

    terminal: {
        type: String,
        enum: TERMINALS_ENUM,
        lowercase: true,
    },

    status: String,

    type: String,
    typeLabel: String,

    customStatus: String,
    customTimestamp: String,

    lineReleaseStatus: String,
    lineReleaseTimestamp: String,

    holds: String,
    totalFees: String,
    satisfiedThru: String,

    location: String,
    vesselVoy: String,
    line: String,
    trucker: String,
    requiredAccessory: String,
}, {
    timestamps: true,
    collection: "_CONTAINERS"
})



module.exports = { 
    Container: mongoose.model("containerModel", containerSchema),
}