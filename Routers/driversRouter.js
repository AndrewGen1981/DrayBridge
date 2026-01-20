const express = require("express")
const driversRouter = express.Router()


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


const driversController = require("../Controllers/driversController.js")


driversRouter.get("/", driversController.index)

driversRouter.post("/",
    upload.array("documents", global.MAX_FILES_ALLOWED_TO_UPLOAD),
    driversController.addNew
)


// Should be at the bottom
driversRouter.get("/:driverId", driversController.getDriver)


module.exports = driversRouter