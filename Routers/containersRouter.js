const express = require("express")
const containerRouter = express.Router()



// const { Container } = require("../Models/containerModel.js")

const containerController = require("../Controllers/containerController.js")



containerRouter.get("/", containerController.index)


containerRouter.post("/validate-numbers", containerController.validateNumbers)
containerRouter.post("/add-containers", containerController.addContainers)



module.exports = containerRouter