const fs = require("fs")


// ***  Cloudinary images storage
const {
    processFileUpload,
    deleteImagesFromCloudinary
} = require("./cloudinaryController.js")



// ***  OPEN.AI listings
const { getListing } = require("../Config/openaiRequest.js")



// ***  Models
const { Container } = require("../Models/containerModel.js")
const { User } = require("../Models/userModel.js")


const { AppError } = require("../Utils/AppError.js")

const {
    cleanBodyCopy,
    fulfillPerSchema
} = require("../Utils/mongoose_utils.js");



// ***  Configs and Catalogs
const { appDomain } = require("../Config/__config.json")



// Допоміжна функція: приймає рядок або масив → повертає масив рядків
const normalizeArray = val => {
    if (!val) return []
    if (Array.isArray(val)) return val.map(v => v.trim()).filter(Boolean)
    return val.split(",").map(v => v.trim()).filter(Boolean)
}


const buildFilter = (obj = {}, useAnd = false) => {

    const frontendFilters = {}  //  для шаблону, щоб швидко відмічати чекбокси в полі фільтрів
    const filters = {}  //  для запиту через мангуст
    const group1 = []
    const group2 = []

    //  id-шки
    const idArray = obj.id ? Array.isArray(obj.id) ? obj.id : obj.id.split(',') : []
    const ids = idArray.filter(Boolean)
    if (ids.length) filters._id = { $in: ids }
    
    // --- LOGIC: OR groups + AND between them ---
    if (useAnd) {
        // повна AND логіка між усіма умовами
        const andConditions = [...group1, ...group2]
        if (andConditions.length) Object.assign(filters, { $and: andConditions })
    } else {
        // поточна поведінка: OR всередині груп, AND між групами
        if (group1.length && group2.length) {
            Object.assign(filters, { $and: [ { $or: group1 }, { $or: group2 } ] })
        } else if (group1.length) {
            Object.assign(filters, { $or: group1 })
        } else if (group2.length) {
            Object.assign(filters, { $or: group2 })
        }
    }

    // --- Пошук по NUMBER має бути саме тут, бо він не перезаписує $and, а додається в нього і має вирішальне значення
    if (obj.number) {
        const { query } = parse_search_string(obj.number)

        const group3 = query.$or ? { $or: query.$or } : query;
        (filters.$and ??= []).push(group3)
        
        frontendFilters.fContainerNumber = obj.number
    }

    // console.log(JSON.stringify(filters))

    return { filters, frontendFilters }
}


// Експортний варіант функції
exports.buildFilter = buildFilter



function buildPaginationData({ baseUrl = '/admin/profile', params = {}, pagination = {} }) {
    const { totalPages = 1, currentPage = 1 } = pagination;

    // 🧹 Формуємо query string
    const queryString = Object.entries(params)
        .flatMap(([k, v]) => {
            if (k === 'page' || !v) return [];

            if (Array.isArray(v)) {
                return v
                    .map(val => val?.trim?.())
                    .filter(Boolean)
                    .map(val => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
            }

            const val = v?.trim?.();
            return val ? [`${encodeURIComponent(k)}=${encodeURIComponent(val.replace(/\s+/g, '+'))}`] : [];
        })
        .join('&');

    const makeHref = (pageNum) => {
        const prefix = queryString ? `?${ queryString }&page=${ pageNum }` : `?page=${ pageNum }`
        return `${ baseUrl }${ prefix }`
    }

    const prevPage = Math.max(currentPage - 1, 1)
    const currPage = Math.max(Math.min(currentPage, totalPages), 1)
    const nextPage = Math.min(currentPage + 1, totalPages)

    // 🧭 Формуємо об'єкт для шаблону
    return {
        first: {
            page: 1,
            href: makeHref(1),
            isActive: currentPage > 1
        },
        prev: {
            page: prevPage,
            href: makeHref(prevPage),
            isActive: currentPage > 1
        },
        curr: makeHref(currPage),
        currPage,
        next: {
            page: nextPage,
            href: makeHref(nextPage),
            isActive: currentPage < totalPages
        },
        last: {
            page: totalPages,
            href: makeHref(totalPages),
            isActive: currentPage < totalPages
        },
        queryParams: `${ baseUrl }?${ queryString }`,
        queryString,
        baseUrl
    }
}



const MAX_PAGE_SIZE = 30



exports.getContainers = async (req, options = {}) => {

    const {
        // якщо потрібно, можна деякі поля виключити одразу
        // Якщо в projection поставити 1, поле включається. Якщо 0 — виключається.
        projection = {},
        sort = { _id: -1 }, // 👈 Сортування у зворотному порядку по замовчуванню
        // якщо це прямий запит, то перезаписую req.session.params. Дана функція експортується,
        // тому може використовуватися в інших раутах, тоді перезаписувати не потрібно
        saveParams = req.headers.referer?.includes('/admin/profile'),
        // можна переключити логіку побудови фітрів OR/AND (по-замовчуванню OR)
        useAndFilters = false,
    } = options

    let query = req.query || {}

    if (saveParams) {
        // Набір фільтрів збергаю в сесії
        if (Object.keys(req.query).length) {
            // якщо прийшов запит з ?reset, то скидаю фільтри
            const _query = req.query["reset"] ? {} : req.query
            req.session.params = _query
            query = _query
        } else {
            // якщо ж не було застосовано жодних фільтрів, то використовую збережені
            query = req.session?.params || {}
        }
    }

    // тут зливати query і req.body не можна, бо тоді фільтри не можливо буде знімати
    const params = query || {}
    const page = Number(params.page || req?.body?.page) || 1

    const { filters, frontendFilters } = buildFilter({ ...query, ...req.body }, useAndFilters)

    // Максимальна кількість позицій на сторінці зберігається в налаштуваннях кожного юзера (userSchema)
    const { PAGE_SIZE = MAX_PAGE_SIZE } = req.session?.configs || {}

    const totalDocs = await Container.countDocuments(filters)
    const totalPages = Math.ceil(totalDocs / PAGE_SIZE)

    let currentPage = +page || 1
    if (currentPage < 1) currentPage = 1
    if (currentPage > totalPages) currentPage = totalPages

    const containers = await Container.find(filters, projection)
        .sort(sort)
        .skip(((currentPage || 1) - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean()

    // *** Оптимізую поля, щоб не робити в шаблоні
    for (let container of containers) {
        container._id = String(container._id)
        // ... ще операції
    }

    const pagination = { totalDocs, totalPages, currentPage }

    return {
        containers,
        pagination,
        paginationData: buildPaginationData({
            baseUrl: req._parsedOriginalUrl?.pathname,
            params, pagination
        }),
        filters: { query, ...frontendFilters },
    }
}



// --- Middleware


exports.testContainerNumber = async (req, res, next) => {
    try {

        const { number } = req.body || {}
        if (!number) throw new AppError("Container number is required", 400)

        const count = await Container.countDocuments({
            number: { $regex: `^${ number.trim() }$`, $options: "i" }
        })

        res.json({ result: true, count })
        
    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}



exports.getContainerById = async (req, res, next) => {
    try {
        const { id } = req.body || {}
        if (!id) throw new AppError("Container ID is required", 400)

        const container = await Container.findById(id).lean()
        if (!container) throw new AppError(`There is no Container with ID${ id }`, 404)

        res.json({ result: true, item })
        
    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}



exports.deleteContainerById = async(req, res, next) => {
    try {
        const { id } = req.body || {}
        if (!id) throw new AppError("Container ID is required", 400)

        const deleted = await Container.findByIdAndDelete(id)
        if (!deleted) throw new AppError(`Container #${ id } not found`, 404)

        console.log(`Container ${ id } was deleted`)

        res.json({ result: true, images })

    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}




// *** Утиліти для пошуку


// * для видалення з регулярного виразу шкідливих символів
const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")


// * визначає по чому саме шукають і формує об*єкт для запиту
function parse_search_string(filter) {
    // Якщо шукають за OEM, part_num або cross_refs (частковий пошук), або description
    const regex = new RegExp(escapeRegex(filter), "i")
    return {
        query: {
            $or: [
                { number: regex },
                { description: regex }
            ]
        },
        sortBy: { number: 1 },
        regex
    }
}



// Filters
exports.findContainerByCriteria = async (req, res, next) => {
    try {
        const {
            filter: _filter,
            fields = []
        } = req.body || {}

        const filter = _filter?.trim()
        if (!filter) throw new AppError("Filter string is required", 400)

        const {
            query = {}, regex = null,
            sortBy = { OEM: 1 }
        } = parse_search_string(filter)

        const extraFields = Array.isArray(fields) ? fields : fields.split(" ")
        const selection = [ "number", ...extraFields ]

        const containers = await Container.find(query)
            .sort(sortBy)
            .select([...new Set(selection)].join(" "))
            .lean()

        // Готую дані для шаблону
        // for (let i=0; i < containers.length; i++) {
        // }

        res.json({ result: true, containers })
        
    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}




// Змінює особлисті налаштування юзера: к-ть позицій на листі
exports.updateMaxOnPage = async (req, res, next) => {
    try {
        const { _id, username = "admin" } = req.session || {}
        if (!_id) throw new AppError("Invalid session, please login", 401)

        const { PAGE_SIZE } = req.body || {}
        if (!PAGE_SIZE) throw new AppError("PAGE_SIZE is required", 400)

        const _PAGE_SIZE = +PAGE_SIZE
        if (isNaN(_PAGE_SIZE)) throw new AppError("PAGE_SIZE should be a Number", 422)

        const user = await User.findByIdAndUpdate(
            _id,
            { $set: { 'configs.PAGE_SIZE': _PAGE_SIZE } },
            { new: true, upsert: false }
        )
        .select("configs")
        .lean()

        if (!user) throw new AppError("Cannot update your configs", 404)

        req.session.configs = user.configs

        res.json({ result: true, message: `Hey ${ username }, your personal configs were updated.` })
        
    } catch (error) {
        console.error(error)
        const status = error.status || 500
        const message = error.message || String(error)
        res.status(status).json({ result: false, issue: message })
    }
}