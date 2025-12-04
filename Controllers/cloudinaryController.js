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
const { Item } = require("../Models/containerModel")



// 🔧 Обробка зображення SHARP (resize тільки якщо потрібно)
const processFileUpload = async (filePath) => {

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
            { folder: "items", resource_type: "image" },
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

        const dbImages = await Item.find({}, "images").lean();
        const flatDbImages = dbImages.flatMap(i => i.images);

        // Шукаю "розсинхрон"
        const cloudUrlsSet = new Set(allUrls)
        const extraInDb = flatDbImages.filter(url => !cloudUrlsSet.has(url))
        const extraInCloudinary = allUrls.filter(url => !flatDbImages.includes(url))

        for (let extraInDb_URL of extraInDb) {
            const id = dbImages.find(item => (item.images || []).some(imgurl => imgurl === extraInDb_URL))?._id || null
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
            dbItem: dbImages.find(item => (item.images || []).some(imgurl => imgurl === r.secure_url))?._id || null
        }));

        const topLatest = latest.resources.map(r => ({
            // public_id: r.public_id,
            secure_url: r.secure_url,
            bytes: `${ Math.round(r.bytes *10 / 1024) / 10 }Kb`,
            format: r.format.toUpperCase(),
            created_at: r.created_at,
            dbItem: dbImages.find(item => (item.images || []).some(imgurl => imgurl === r.secure_url))?._id || null
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
    processFileUpload,
    deleteImagesFromCloudinary,

    // Cloudinary Admin API
    cloudinaryMonitoring,
    deleteFromCloudinary
}