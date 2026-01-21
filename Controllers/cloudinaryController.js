const fs = require("fs")
const path = require("path")



// ***  SHARP image tool
const sharp = require ("sharp")

// Важливо! Вимикаю кеш libvips (забороняю використання буферу), натомість всі операції з ресайзу, компресії і т.д. 
// виконуватимуться в тимчасових файлах на диску. В буфері, звичайно краще і швидше, але sharp працює на дуже базовому
// рівні (на рівні С++, тобто до Node.js + V8, де вже є автоматичний garbage collection), а тому не вичищає за собою
// пам*ять і вона акумулюється, викликаючи помилку mem-quota overload
sharp.cache(false)
sharp.concurrency(1)    // максимум 1 обробка одночасно



// ***  Cloudinary images storage
const { v2: cloudinary } = require("cloudinary")

// 🔑 Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})



// ***  Models
const { Driver } = require("../Models/driverModel.js")
const { AppError } = require("../Utils/AppError.js")



const isImage = file => file.mimetype.startsWith("image/")
const isPdf = file => file.mimetype === "application/pdf"



// 🔧 Обробка зображення SHARP (resize тільки якщо потрібно)
const processFileUpload = async (filePath, folder = "images") => {

    // Sharp теж працює через диск, а не через пам*ять. Виходить, що кожного файлу на диску створюється 2 примірники: 
    // один створює мультер для завантаження з форми, а інший - Sharp для роботи із зображенням (ресайз, компресія)
    const tempWebpFile = `${ path.basename(filePath, path.extname(filePath)) }_SHARP.webp`
    const tempOutput = path.join( path.dirname(filePath), tempWebpFile)

    const image = sharp(filePath)
    const metadata = await image.metadata()

    const pipeline = metadata.width > 1024 || metadata.height > 1024
        ? image.resize({ width: 1024, height: 1024, fit: "inside" }).toFormat("webp")
        : image.toFormat("webp")

    try {
        await pipeline.toFile(tempOutput)
    } catch (err) {
        console.error("❌ Sharp processing error:", err.message)
        throw err
    }

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: "image"
            },
            async (err, result) => {
                try {
                    // 🧹 Примусово знищуємо об'єкти sharp після завершення
                    pipeline.destroy?.()
                    image.destroy?.()

                    // 🔥 Видаляємо тимчасовий файл Sharp з папки
                    try {
                        fs.unlinkSync(tempOutput)
                    } catch (cleanupErr) {
                        console.warn("🧹 Temp cleanup error:", cleanupErr.message)
                    }

                    if (err) return reject(err)
                    resolve(result.secure_url)
                } catch (finalErr) {
                    reject(finalErr)
                }
            }
        )

        const readStream = fs.createReadStream(tempOutput)
        readStream.pipe(uploadStream).on("finish", () => readStream.destroy())
    })
}



// Завантажую PDF в Cloudinary
const uploadPdfToCloudinary = (filePath, folder = "documents") => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(
            filePath,
            {
                folder,
                // resource_type: "raw"
                resource_type: "image"
            },
            (err, result) => {
                try {
                    fs.unlinkSync(filePath)
                } catch {}

                if (err) return reject(err)
                resolve(result.secure_url)
            }
        )
    })
}



async function checkAndUploadFilesToCloudinary(files, folder = "") {
    // За один раз можна завантажити не більше, ніж MAX_FILES_ALLOWED_TO_UPLOAD файлів
    if (files.length > global.MAX_FILES_ALLOWED_TO_UPLOAD)
        throw new AppError( `Upload limit exceeded — maximum ${ global.MAX_FILES_ALLOWED_TO_UPLOAD } files allowed.`, 422)

    // 🔥 Обробка зображень
    const newDocs = []
    
    // Якщо є нові файли, то обробляємо через sharp + cloudinary
    if (Array.isArray(files) && files.length > 0) {

        // ***  Гібридний варіант, нарізаю по 3шт і запускаю паралельну обробку всіх 3х
        const chunkSize = 3
        const chunks = []

        for (let i = 0; i < files.length; i += chunkSize) {
            chunks.push(files.slice(i, i + chunkSize))
        }

        // 🔁 Обробляємо батчі послідовно (щоб не перевантажити RAM)
        for (const chunk of chunks) {
            // 🧩 Але кожен батч виконується паралельно (до 3 файлів)
            await Promise.all(
                chunk.map(async(file) => {
                    try {
                        const type = isImage(file)
                            ? "image"
                            : isPdf(file)
                                ? "pdf"
                                : null

                        if (!type) return

                        const url = type === "image"
                            ? await processFileUpload(file.path, folder)
                            : await uploadPdfToCloudinary(file.path, folder)

                        if (url) {
                            const { name: label } = path.parse(file.originalname)
                            newDocs.push({ url, type, label })
                        }
                    } catch (err) {
                        console.error(`Upload failed for ${ file.originalname }:`, err.message)
                    } finally {
                        try {
                            if (fs.existsSync(file.path))
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

    return newDocs
}



function extractCloudinaryPublicId(url) {
    //  враховує зміну папки в cloudinary
    const match = url.match(/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/)
    return match ? match[1] : null
}

async function deleteImagesFromCloudinary(imagesUrls = []) {
    for (const url of imagesUrls) {
        const publicId = extractCloudinaryPublicId(url)
        if (publicId) await cloudinary.uploader.destroy(publicId)
    }
}




/*

🔧 Ідеї для твого майбутнього "Cloudinary Dashboard"
Функціонал	Опис
Storage usage monitor	Показує скільки зайнято / доступно місця.
Sync checker	Звіряє базу MongoDB з Cloudinary (як ми говорили).
Broken links detector	Перевіряє, чи всі URL з бази реально існують у Cloudinary.
Unused files cleanup	Пропонує видалити ті, що не використовуються.
Folder & tag browser	Показує структуру папок і тегів.
Recent uploads list	Перелік останніх 50–100 зображень з Cloudinary.
Stats widget	Кількість зображень, середній розмір, найчастіше використовувані теги тощо.

*/


const cloudinaryMonitoring = async (req, res, next) => {
    try {

        const usage = await cloudinary.api.usage()


        let nextCursor = null;
        let allResources = [];

        do {
            const res = await cloudinary.api.resources({
                type: "upload",
                max_results: 500,
                next_cursor: nextCursor,
            });

            allResources.push(...res.resources);
            nextCursor = res.next_cursor;
        } while (nextCursor);

        const allUrls = allResources.map(r => r.secure_url);

        const dbImages = await Driver.find({}, "documents").lean();
        const flatDbImages = dbImages.flatMap(i => i.documents);

        // Шукаю "розсинхрон"
        const cloudUrlsSet = new Set(allUrls)
        const extraInDb = flatDbImages.filter(url => !cloudUrlsSet.has(url))
        const extraInCloudinary = allUrls.filter(url => !flatDbImages.includes(url))

        for (let extraInDb_URL of extraInDb) {
            const id = dbImages.find(item => (item.documents || []).some(imgurl => imgurl === extraInDb_URL))?._id || null
            if (id) console.warn(`Лишній малюнок ${ extraInDb_URL } виявнеий в базі, елемент ${ id }`)
        }


        // 🔹 Отримує 5 найбільших файлів і 10 останніх завантажених.
        const [largest, latest] = await Promise.all([
        cloudinary.search
            .expression("resource_type:image")      // тільки картинки
            .sort_by("bytes", "desc")               // сортування за розміром
            .max_results(10)
            .execute(),

        cloudinary.search
            .expression("resource_type:image")
            .sort_by("created_at", "desc")          // сортування за часом створення
            .max_results(10)
            .execute()
        ]);

        const topLargest = largest.resources.map(r => ({
            // public_id: r.public_id,
            secure_url: r.secure_url,
            bytes: `${ Math.round(r.bytes * 10 / 1024) / 10 }Kb`,
            format: r.format.toUpperCase(),
            created_at: r.created_at,
            dbItem: dbImages.find(item => (item.documents || []).some(imgurl => imgurl === r.secure_url))?._id || null
        }));

        const topLatest = latest.resources.map(r => ({
            // public_id: r.public_id,
            secure_url: r.secure_url,
            bytes: `${ Math.round(r.bytes *10 / 1024) / 10 }Kb`,
            format: r.format.toUpperCase(),
            created_at: r.created_at,
            dbItem: dbImages.find(item => (item.documents || []).some(imgurl => imgurl === r.secure_url))?._id || null
        }));


        const cloudMonitoring = {
            usage,
            
            topLargest,
            topLatest,
            
            extraInDb,
            extraInCloudinary,

            countDB: flatDbImages.length,
            countCloudinary: cloudUrlsSet.size,

            link: "https://console.cloudinary.com",
        }


        res.render("../Views/cloud/cloud.ejs", { cloudMonitoring })
        
    } catch (error) {
        console.error(error)
        next()
    }
}




const deleteFromCloudinary = async(req, res, next) => {
    try {
        const { images } = req.body || {}
        if (!images?.length) throw new AppError("Images to delete are required", 400)

        await deleteImagesFromCloudinary(images)

        res.json({ result: true, message: `${ images.length } image(s) deleted` })

    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}




module.exports = {
    isImage, isPdf,

    processFileUpload,
    uploadPdfToCloudinary,
    deleteImagesFromCloudinary,
    checkAndUploadFilesToCloudinary,

    // Cloudinary Admin API
    cloudinaryMonitoring,
    deleteFromCloudinary
}