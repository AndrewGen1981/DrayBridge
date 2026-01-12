const express = require("express")
const containerRouter = express.Router()



// const { Container } = require("../Models/containerModel.js")

const containerController = require("../Controllers/containerController.js")



containerRouter.get("/", containerController.index)


containerRouter.post("/validate-numbers", containerController.validateNumbers)
containerRouter.post("/add-containers", containerController.addContainers)


containerRouter.post("/get-containers", async(req, res) => {

    // console.log(req.body)
    // return res.json()

    const result = await containerController.getContainers(req, {
        splitOnUpperCase: true,
        revealTerminals: true,
        projection: {
            createdAt: 0,
            origin: 0,
            __v: 0,
        },
        sort: {
            status: 1,
        },
    })

    // додаю Labels для полів схеми Container, для виводу в UI
    result.schemaLabels = containerController.containerSchemaLabels(true)

    res.json(result)
})


containerRouter.post("/restore", containerController.restoreContainers)
containerRouter.delete("/", containerController.removeContainers)


module.exports = containerRouter