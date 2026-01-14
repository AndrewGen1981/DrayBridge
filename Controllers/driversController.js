const { stateNames } = require("../Config/_states.js")
const { DRIVER_STATES } = require("../Config/drivers.js")


const { Driver } = require("../Models/driverModel.js")


exports.index = async (req, res, next) => {
    try {
        const drivers = await Driver.find().sort({ status: 1 }).lean()

        res.render("../Views/drivers/drivers.ejs", {
            drivers,
            DRIVER_STATES,
            stateNames
        })
    } catch(error) {
        console.error(`Drivers index: ${ error.message }`)
        next()
    }
}


exports.addNew = async (req, res, next) => {
    try {

       res.json(req.body)

    } catch(error) {
        console.error(`Drivers index: ${ error.message }`)
        next()
    }
}