const express = require("express")
const driversRouter = express.Router()
const driversController = require("../Controllers/driversController.js")


driversRouter.get("/", driversController.index)
driversRouter.post("/", driversController.addNew)


module.exports = driversRouter