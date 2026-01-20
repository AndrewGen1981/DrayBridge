const { stateNames } = require("../Config/_states.js")
const { DRIVER_STATES } = require("../Config/drivers.js")


// ***  Cloudinary images storage
const {
    isImage, isPdf,
    processFileUpload,
    uploadPdfToCloudinary,
    deleteImagesFromCloudinary
} = require("./cloudinaryController.js")

const { fulfillPerSchema, cleanBodyCopy } = require("../Utils/mongoose_utils.js")



const { Driver } = require("../Models/driverModel.js")


// Fields for CRUD operations
const driverSchema = {
    "firstName": { label: "First name", type: "text", required: true },
    "lastName": { label: "Last name", type: "text", required: true },

    "phone": { label: "Phone", required: true },
    "email": { label: "Email", required: true },
    "password": { label: "Password", required: true },

    "dateOfBirth": { label: "Date of birth", type: "date" },
    "dateOfHire": { label: "Date of hire", type: "date" },

    "drivingTruck": { label: "Driving truck" },
    "drivingTrailer": { label: "Driving trailer" },
}



exports.index = async (req, res, next) => {
    try {
        const drivers = await Driver.find()
            .sort({ status: 1 })
            .select("-notes")
            .lean()

        res.render("../Views/drivers/drivers.ejs", {
            drivers,
            driverSchema,
            DRIVER_STATES,
            stateNames,
        })
    } catch(error) {
        console.error(`Drivers index: ${ error.message }`)
        next()
    }
}



exports.getDriver = async (req, res, next) => {
    try {
        const { driverId } = req.params
        if (!driverId) throw new AppError("Driver ID is required", 400)

        const driver = await Driver
            .findById(driverId)
            .lean()

        if (!driver) throw new AppError(`Driver ${ driverId } was not found`, 404)

        res.render("../Views/drivers/driver_edit.ejs", {
            driver,
            driverSchema,
            DRIVER_STATES,
            stateNames,
        })

    } catch (error) {
        console.error(`Driver edit: ${ error.message }`)
        next()
    }
}



exports.addNew = async (req, res, next) => {
    try {
        const { modified } = req.body || {}
        const newDriver = modified?.trim()
            ? Object.fromEntries(
                modified
                    .split(",")
                    .map(f => [ [f], req.body[f] ])
            )
            : req.body

        const formBody = fulfillPerSchema(cleanBodyCopy(newDriver), Driver)

        // За один раз можна завантажити не більше, ніж MAX_FILES_ALLOWED_TO_UPLOAD файлів
        if (req.files.length > global.MAX_FILES_ALLOWED_TO_UPLOAD)
            throw new AppError( `Upload limit exceeded — maximum ${ global.MAX_FILES_ALLOWED_TO_UPLOAD } files allowed.`, 422)

        // 🔥 Обробка зображень
        const newDocs = []
        
        // Якщо є нові файли, то обробляємо через sharp + cloudinary
        if (Array.isArray(req.files) && req.files.length > 0) {

            // ***  Гібридний варіант, нарізаю по 3шт і запускаю паралельну обробку всіх 3х
            const chunkSize = 3
            const chunks = []

            for (let i = 0; i < req.files.length; i += chunkSize) {
                chunks.push(req.files.slice(i, i + chunkSize))
            }

            // 🔁 Обробляємо батчі послідовно (щоб не перевантажити RAM)
            for (const chunk of chunks) {
                // 🧩 Але кожен батч виконується паралельно (до 3 файлів)
                await Promise.all(
                    chunk.map(async(file) => {
                        try {
                            const url = 
                                isImage(file) ? await processFileUpload(file.path, "drivers") :
                                isPdf(file) ? await uploadPdfToCloudinary(file.path, "drivers") :
                                null

                            if (url) newDocs.push(url)
                        } catch (err) {
                            console.error(`Upload failed for ${ file.originalname }:`, err.message)
                        } finally {
                            try {
                                fs.unlinkSync(file.path)
                            } catch (e) {
                                console.warn(`Failed to delete temp file ${ file.path }:`, e.message)
                            }
                        }
                    })
                )
            }

        }

        // Check heap usage - 1,048,576 bytes = 1 Mb (1024*1024)
        const usedHeap = Math.ceil(process.memoryUsage().heapUsed / 1048576)
        console.log(`🧩 Heap usage (${ new Date().toISOString() }): ${ usedHeap }`)

        if (usedHeap > 85 && global.isProduction) {
            console.log('♻️ Restarting due to high memory load...')
            process.exit(0)
        }

        formBody.documents = newDocs
        await Driver.create(formBody)

        console.log(formBody)

        res.redirect("/admin/drivers")

    } catch(error) {
        console.error(error)
        next()
    }
}