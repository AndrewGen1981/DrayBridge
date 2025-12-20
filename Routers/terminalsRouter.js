const express = require("express")
const terminalRouter = express.Router()


const terminalsController = require("../Controllers/_terminalsController")



terminalRouter.post("/toggle-activity", terminalsController.toggleActivity)



module.exports = terminalRouter