// Працює з вхідними вебхуками від CartonCloudW


// Модель
const { CartonCloudWebhook } = require("../Models/cartonCloudWebhook.js")
const { Item } = require("../Models/itemModel.js")
const { AppError } = require("../Utils/AppError.js")


const { getItemSuffix } = require("./containersController.js")



// Безпечний getter (щоб уникати undefined полів)
const g = (obj, path, def = null) =>
    path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : def), obj)



const saveCartonCloudWebhook = async (req, res) => {
    try {
        const body = req.body

        // Не дублюю items
        const items = Array.isArray(body.items)
            ? body.items.map(i => ({
                // itemId: i.id,
                productId: g(i, "details.product.id"),
                name: g(i, "details.product.name"),
                quantity: g(i, "measures.quantity")
            }))
            : []

        body.items = undefined

        // Створюю новий документ з необхідними полями
        const doc = new CartonCloudWebhook({
            webhookType: body.type || g(body, "owner.type"),
            status: body.status || null,

            orderId: body.id || g(body, "owner.id"),
            customerId: g(body, "customer.id"),
            warehouseId: g(body, "warehouse.id"),

            customerOrderNumber: g(body, "references.customer"),

            items,            

            eventTimestamps: {
                created: g(body, "timestamps.created.time"),
                modified: g(body, "timestamps.modified.time"),
                packed: g(body, "timestamps.packed.time"),
                dispatched: g(body, "timestamps.dispatched.time")
            },

            document: body.content
                ? {
                    documentId: body.id,
                    documentType: body.type,
                    name: g(body, "content.name")
                }
                : null,

            raw: body
        })

        await doc.save()

        // логи
        console.log("cartoncloud_webhook: ", {
            type: doc.webhookType,
            status: doc.status,
            items: (doc.items || []).length
        })

        res.json({ result: true, id: doc._id })

    } catch (error) {
        console.error("CartonCloud Webhook Save Error:", error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}



// Повертає всі вебхуки, залишаю req для пагінації
const showWebhooks = async (req, res, next) => {
    try {

        const contrAgents = {
            "673a7a33-3fb3-4aac-8460-2357c03553b5": "PartStop",
            "56613b2b-0758-11ef-a3fd-066c91bd21c5": "Long Road Warehouse"
        }

        const webhooks = await CartonCloudWebhook.find()
            .select("-raw -items.itemId")
            .sort({ _id: -1 })
            .limit(50)
            .lean()

        // --- Додаю Items
        
        // 1) Формую список унікальних item.productId = Item.warehouse_ref
        // const productIDs = new Set( webhooks.flatMap(w => (w.items || []).map(i => i.productId)) )
        const webhooksMap = {}
        const productIDs = new Set()

        for (const wh of webhooks) {
            (webhooksMap[wh.orderId] ??= []).push(wh)

            for (const item of (wh.items || [])) {
                if (!productIDs.has(item.productId)) productIDs.add(item.productId)
            }   
        }
        
        // 2) Отримую Items згідно списку productIDs
        const items = productIDs.size === 0 ? []
            : await Item.aggregate([
                { $match: { warehouse_ref: { $in: [...productIDs] } } },
                {
                    $project: {
                        part_num: 1, partSuffix: 1, OEM: 1,
                        warehouse_ref: 1,
                        // idStr: { $toString: "$_id" },
                        title_image: {
                            $ifNull: [
                                "$title_image",
                                { $ifNull: [{ $arrayElemAt: ["$images", 0] }, "/placeholder-img.webp"] }
                            ]
                        }
                    }
                }
            ])

        const itemsMap = new Map(items.map(i => {
            i.part_num += `.${ getItemSuffix(i.partSuffix) }`
            return [i.warehouse_ref, i]
        }))

        // console.log(webhooksMap["5b76e722-fb43-4eb9-8439-8eae2b5e83c5"])

        res.render("../Views/warehouse/webhooks.ejs", {
            webhooksMap,
            itemsMap, contrAgents
        })
        
    } catch (error) {
        console.error(error)
        next()
    }
}



const getWebhookById = async (req, res, next) => {
    try {
        const { id } = req?.params || {}
        if (!id) throw new AppError("ID is required to locate a Webhook", 400)

        const webhook = await CartonCloudWebhook
            .findById(id)
            .lean()
        
        res.json(webhook || { error: `Nothing is found via order ID ${ orderId }` })

    } catch (error) {
        console.error(error)
        next()
    }
}



module.exports = {
    saveCartonCloudWebhook,
    
    showWebhooks,
    getWebhookById,
}