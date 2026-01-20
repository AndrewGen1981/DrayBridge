const express = require("express")


// Контролери
const roleController = require('../Controllers/roleController')
const logsController = require("../Controllers/logsController")

const containerController = require("../Controllers/containerController.js")
const terminalsController = require("../Controllers/_terminalsController.js")


const { cloudinaryMonitoring, deleteFromCloudinary } = require("../Controllers/cloudinaryController.js")


// Маршрутизатори
const sharedUserAdminRoutes = require('./sharedUserAdminRoutes')




const adminRouter = express.Router()
.use(roleController.checkRole("ADMIN")) // перевіряє роль



// Специфічні раути для Адміна, в т.ч. Інжекти
adminRouter.post("/test-container-number", containerController.testContainerExists)
adminRouter.post("/get-container-by-id", containerController.getContainerById)

adminRouter.post("/delete-container-by-id", containerController.deleteContainerById)

adminRouter.post("/find-by-criteria", containerController.findContainerByCriteria)
adminRouter.post("/update-max-on-page", containerController.updateMaxOnPage)



// відображає логи
adminRouter.get("/logs", logsController.viewLogs)


// моніторинг cloudinary
// adminRouter.get("/cloud", cloudinaryMonitoring)
// adminRouter.post("/cloud", deleteFromCloudinary)


// робота з контейнерами
adminRouter.use("/containers", require("./containersRouter.js"))

// робота з терміналами
adminRouter.use("/terminals", require("./terminalsRouter.js"))

// робота з водіями
adminRouter.use("/drivers", require("./driversRouter.js"))


// Інжект - перед рендером профайлу
const beforeProfileRender = async (req, res, next) => {
    try {
        // Передаю в профайл параметри командної строки
        res.locals.query = req.query || {}

        Object.assign(res.locals, await terminalsController.index(req))

        next()
    } catch (error) {
        next(error)
    }
}


// Спільні раути для адміна та юзера
adminRouter.use(sharedUserAdminRoutes({
    beforeProfileRender     //  інжект мідлвару, виконається перед рендером профайлу
}))



module.exports = adminRouter