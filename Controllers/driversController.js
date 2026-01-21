const { stateNames } = require("../Config/_states.js")
const { DRIVER_STATES } = require("../Config/drivers.js")


// ***  Cloudinary images storage
const {
    isImage, isPdf,
    processFileUpload,
    uploadPdfToCloudinary,
    deleteImagesFromCloudinary,
    checkAndUploadFilesToCloudinary,
} = require("./cloudinaryController.js")

const { fulfillPerSchema, cleanBodyCopy } = require("../Utils/mongoose_utils.js")



const { Driver } = require("../Models/driverModel.js")
const { AppError } = require("../Utils/AppError.js")



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



exports.getDriverByEmail = async (req, res, next) => {
    try {
        const { email, selected = "email" } = req.body
        if (!email) throw new AppError("Email is required", 400)

        const selectedFields = Array.isArray(selected) ? selected : [ selected ]

        const driver = await Driver
            .findOne({ email })
            .select(selectedFields.join(" "))
            .lean()

        res.json({ result: Boolean(driver), driver })

    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}



exports.addNewOrUpdateDriver = async (req, res, next) => {
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
        const uploadedDocs = await checkAndUploadFilesToCloudinary(req.files, "drivers")

        // Поле "status" не потрібно перевіряти, бо в схемі є default
        const requiredFields = [ "firstName", "lastName", "phone", "email", "password" ]

        const { driverId } = req.params

        if (driverId) {
            // перевіряю чи присутні обов*язкові поля
            const invalidFields = requiredFields.filter(f =>
                f in formBody && !formBody[f]?.trim()
            )
            if (invalidFields.length)
                throw new AppError(`Missing fields: ${ invalidFields.join(", ") }`, 400)

            const update = { $set: formBody }

            if (uploadedDocs.length) {
                // update.$push = { documents: { $each: uploadedDocs } }
                update.$push = {
                    documents: {
                        $each: uploadedDocs.map(d => ({
                            url: d.url,
                            type: d.type,
                            label: d.label || "",
                        }))
                    }
                }

                delete update.$set.documents
            }

            await Driver.findByIdAndUpdate(driverId, update)

            res.redirect(`/admin/drivers/${ driverId }`)
        } else {
            // перевіряю чи присутні обов*язкові поля
            const missingFields = requiredFields.filter(f => !formBody[f])
            if (missingFields.length)
                throw new AppError(`Missing fields: ${ missingFields.join(", ") }`, 400)

            // перевіряю чи водій з таким email вже існує
            const driver = await Driver
                .findOne({ email: formBody.email })
                .select("email")
                .lean()

            if (driver) throw new AppError(`Driver with email "${ formBody.email }" already exists`, 422)

            formBody.documents = uploadedDocs
            await Driver.create(formBody)

            res.redirect("/admin/drivers")
        }

    } catch(error) {
        console.error(error)
        next()
    }
}



exports.setDocLabel = async (req, res, next) => {
    try {
        const { url, driverId, label } = req.body
        if (!driverId) throw new AppError("Driver ID is required", 400)
        if (!url) throw new AppError("Document URL is required", 400)
        if (!label.trim()) throw new AppError("Document label is required", 400)

        const driver = await Driver
            .findById(driverId)
            .select("documents")
            // .lean()

        if (!driver) throw new AppError(`Driver ${ driverId } was not found`, 404)

        const index = driver.documents?.findIndex(d => d.url === url)
        if (index < 0) {
            const path = url.split("/")
            throw new AppError(`Document "<b>${ path[path.length - 1].toUpperCase() }</b>"<br> was not found among driver's docs.`, 404)
        }

        driver.documents[index].label = label
        await driver.save()
        
        res.json({ result: true })

    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}



exports.removeDriverDocument = async (req, res, next) => {
    try {
        const { driverId } = req.params
        if (!driverId) throw new AppError("Driver ID is required", 400)

        const { url } = req.body
        if (!url) throw new AppError("Document URL is required", 400)

        const driver = await Driver
            .findById(driverId)
            .select("documents")
            // .lean()

        if (!driver) throw new AppError(`Driver ${ driverId } was not found`, 404)

        const imagesUrls = Array.isArray(url) ? url : [ url ]
        const isExist = driver.documents?.some(d => imagesUrls.includes(d.url || d))
        if (!isExist) {
            const path = url.split("/")
            throw new AppError(`Document "<b>${ path[path.length - 1].toUpperCase() }</b>"<br> was not found among driver's docs.`, 404)
        }

        driver.documents = driver.documents.filter(d => !imagesUrls.includes(d.url || d))
        await driver.save()
        
        await deleteImagesFromCloudinary(imagesUrls)

        res.json({ result: true })

    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}