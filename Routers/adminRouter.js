const express = require("express")
const path = require("path")


const multer = require("multer")

// ⚡ Multer зберігає на диску в тичасових файлах (/tmp_uploads), це запобігає перевищенню квоти пам*яті на Heroku
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'tmp_uploads')),
    filename: (req, file, cb) => cb(null, `${ Date.now() }_${ file.originalname }`)
})
const upload = multer({ storage, limits: {
    fileSize: global.MAX_BYTES_PER_FILE,
    files: global.MAX_FILES_ALLOWED_TO_UPLOAD }
})




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

// adminRouter.post("/add-new-item",
//     // upload.array("images", global.MAX_FILES_ALLOWED_TO_UPLOAD),
//     containerController.addNewItemOrUpdate
// )

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