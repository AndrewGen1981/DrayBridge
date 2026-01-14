const mongoose = require('mongoose')


const { DRIVER_STATUSES, DEFAULT_STATUS } = require("../Config/drivers.js")


// ***  Схема для водія


const driverSchema = new mongoose.Schema({

    status: {
        type: String,
        enum: DRIVER_STATUSES,
        lowercase: true,
        require: true,
        index: true,
        default: DEFAULT_STATUS
    },

    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    
    email: {
        type: String,
        lowercase: true,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },

    dateOfBirth: String,
    dateOfHire: String,

    driverLicenseState: String,
    driverLicenseNumber: String,

    drivingTruck: String,
    drivingTrailer: String,

    documents: [ String ],

    notes: String,

}, {
    timestamps: true,
    collection: "_DRIVERS"
})



module.exports = { 
    Driver: mongoose.model("driverModel", driverSchema)
}