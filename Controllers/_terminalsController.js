// Контролер для роботи з терміналами різних портів:
// ✅ 1) термінали порту Сіетлу (t5, t18, t30...)
// 2) WUT - WASHINGTON UNITED TERMINAL MARINE
// 3) TOS - HUSKY TERMINAL & STEVEDORING

const { TERMINALS } = require("../Config/terminalsCatalog")


const { Container } = require("../Models/containerModel.js")
const { Terminal } = require("../Models/terminalModel.js")

const { AppError } = require("../Utils/AppError.js")


const { fulfillPerContainer } = require("../Utils/mongoose_utils.js")


const { 
    connectSeattleTerminal,
    seattleBulkAvailabilityCheck,
    seattlePerItemtAvailabilityCheck,
} = require("./_seattleTerminalsController.js")

const { 
    connectWUTTerminal,
    uswutBulkAvailabilityCheck
} = require("./_WUTTerminalsController.js")

const { 
    connectTOSTerminal,
    tosBulkAvailabilityCheck
} = require("./_TOSTerminalsController.js")

const { 
    connectPCTTerminal,
    pctBulkAvailabilityCheck
} = require("./_PCTTerminalsController.js")



// async 
async function terminalConnectAndCheckMany(terminal, containers = [], opt = {}) {

    if (!terminal || !containers?.length) return []

    // якщо в opt передати _seattleCheckBulk = false, то кожег контейнер терміналу Сіетлу буде
    // перевірятися окремо, плюс додається блок OSRA. По замовчуванню _seattleCheckBulk = true
    const { _seattleCheckBulk = true, ...restOfOptions } = opt
    const options = { shouldloadCookies: true, ...restOfOptions }

    // Seattle group (t5, t18, t30...)
    if (terminal.group === "Seattle") {
        if (await connectSeattleTerminal(terminal, options)) {
            return _seattleCheckBulk
                ? await seattleBulkAvailabilityCheck(terminal, containers)
                : await seattlePerItemtAvailabilityCheck(terminal, containers)
        }
    }

    // WUT
    if (terminal.group === "USWUT") {
        if (await connectWUTTerminal(terminal, { shouldloadCookies: true })) {
            return await uswutBulkAvailabilityCheck(terminal, containers)
        }
    }

    // TOS
    if (terminal.group === "TOS" && global.isProduction) {  //  only via VPN or at PRODUCTION
        if (await connectTOSTerminal(terminal, { shouldloadCookies: true })) {
            return await tosBulkAvailabilityCheck(terminal, containers)
        }
    }

    // PCT
    if (terminal.group === "PCT") {
        if (await connectPCTTerminal(terminal, { shouldloadCookies: true })) {
            return await pctBulkAvailabilityCheck(terminal, containers)
        }
    }


    // TODO: інші термінали тут


    return []
}



// Логіка для введення контейнерів в систему списково (bulk).
// Фактично використовується для ініту контейнерів і створення їх в манго.

const bulkAvailabilityCheck = async (containerNumbers, terminalsChoice) => {
    const emptyResult = { found: [], missing: [] }

    try {
        // базові перевірки
        if (!containerNumbers || !terminalsChoice) return emptyResult

        let containers = Array.isArray(containerNumbers)
            ? containerNumbers.slice()  //  щоб створити новий, ане мутувати containerNumbers
            : [ containerNumbers ]

        // не передано список контейнерів
        if (!containers.length) return emptyResult

        const choises = Array.isArray(terminalsChoice)
            ? terminalsChoice
            : [ terminalsChoice ]

        // не передано список терміналів
        if (!choises.length) return emptyResult

        let terminals = { ...TERMINALS }
        if (!choises.includes("auto")) {
            for (let t of Object.keys(terminals)) {
                if (!choises.includes(t)) delete terminals[t]
            }
        }

        // перетворюю в ітерабельний вигляд
        terminals = Object.values(terminals)

        // список терміналів порожній
        if (!terminals.length) return emptyResult

        const results = []
        
        for (const terminal of terminals) {
            
            if (!containers.length) break

            console.log(`Checking "${ terminal.label }" | ${ terminal.key }:`)
            const foundContainers = await terminalConnectAndCheckMany(terminal, containers)
            
            if (foundContainers?.length) {
                // якщо щось знайшов, то відсіваю знайдені із першочергового списку контейнерів,
                // найшвидший спосіб - перетворити в множину і видалити знайдені
                const theRestOfContainers = new Set(containers)
                for (const c of foundContainers) {
                    theRestOfContainers.delete(c.number)
                }
                // повертаю в масив і зберігаю знайдені результати
                containers = [...theRestOfContainers]
                results.push(...foundContainers)
            }

            if (containers.length) {
                console.log(`${ terminal.key } — containers not found: `, containers)
            }

        }

        return {
            found: results,
            missing: containers.map(c => ({ number: c, status: "missing" }))
        }

    } catch (error) {
        console.error(error)
        return emptyResult
    }
}




// Автоматичне оновлення статусу контейнерів.
// Використовується для corn.schedule авто-оновлення

async function syncContainersData() {
    try {
        const allContainers = await Container.find()
            .sort({ terminal: 1 })
            .select("number terminal status")
            .lean()

        if (!allContainers?.length)
            throw new AppError("[AUTO-CHECK] Scheduled containers status check. Empty containers array.", 422)

        console.log(`[AUTO-CHECK] Scheduled containers status check (${ allContainers.length } pcs).`)

        // об*єкт для сортування контейнерів за терміналами
        const containerGroupsByTerminal = {}

        // тут важливе питання що робити з групою контейнерів зі статусом "pending". Це такі контейнери, які були
        // знайдені і підтверджені під конкретним терміналом, але під час останньої регулярної перевірки термінал не
        // підтверджує наявність такого контейнера. Може підтвердити при наступній перевірці, АЛЕ могло статися так, що
        // контейнер перемістився під інший термінал (дуже рідко, але буває). Теоретично, їх можна вибирати окремо і
        // зараховувати до missingContainers і тоді інші термінали зможуть їх також перевірити

        for (const c of allContainers) {

            // всі status: "pending" до missingContainers
            const terminal = c.status === "pending" ? "NA"
                : c.terminal || "NA"

            if (!containerGroupsByTerminal[terminal]) 
                containerGroupsByTerminal[terminal] = []

            containerGroupsByTerminal[terminal].push(c.number)
        }

        let missingContainers = new Set(containerGroupsByTerminal.NA || [])

        for (const terminal of Object.values(TERMINALS)) {

            // буду оновлювати в манго чанками - в розрізі терміналів
            const operations = []

            if (!containerGroupsByTerminal[terminal.key]?.length) {
                console.log(`[AUTO-CHECK] Terminal: ${ terminal.label } | No containers assigned | Pending NA: ${ missingContainers.size }`)
                continue
            }

            const containers = containerGroupsByTerminal[terminal.key]

            const foundContainers = await terminalConnectAndCheckMany(terminal, [
                ...containers,
                ...Array.from(missingContainers)
            ], { _seattleCheckBulk: false })    //  перевіряю контейнери Сієтлу кожен окремо + OSRA

            // - якщо нічого не знайшов, то просто переходжу до наступного терміналу; це також може бути свідченням того,
            // що просто не вдалося під*єднатися до терміналу, не потрібно змінювати статуси контейнерів
            if (!foundContainers?.length ) continue;
            
            // - якщо знайшов, то спочатку додам статус "pending", а потім рахую статистику

            // Додаткова логіка для випадку коли знайдено менше, ніж очікував, змінюю статуси незнайдених;
            // "незнайдені" - ці ті, які є в containers (Манго), але відсутні в foundContainers (знайдені)
            if (foundContainers.length < containers.length) {
                const fcSet = new Set(foundContainers.map(fc => fc.number))
                for (const c of containers) {
                    if (fcSet.has(c)) continue;
                    foundContainers.push({
                        number: c, status: "pending",
                        statusDesc: "Awaiting terminal confirmation"
                    })
                }
            }

            // статус "pending" перевірено/додано, обновлюю статистику
            const stats = {
                totalContainers: foundContainers.length,
                statuses: {},
                lastUpdatedAt: new Date()
            }

            const foundMoreThanExpected = foundContainers.length > containers.length

            // збираємо кількість по кожному статусу
            for (const c of foundContainers) {
                const status = c.status || "unknown"
                stats.statuses[status] = (stats.statuses[status] || 0) + 1
                
                // якщо знайдено більше, як очікував, значить знайдено щось із missingContainers
                if (foundMoreThanExpected && c.number)
                    missingContainers.delete(c.number)
            }

            // оновлюємо документ терміналу в Mongo
            if (terminal.key) {
                await Terminal.updateOne(
                    { key: terminal.key },
                    { $set: { stats } },
                    { upsert: true }
                )
            }

            // -- Build upsert operations
            for (const c of foundContainers) {

                // важливо прибрати попередній статус, бо він може бути в документі манго
                // "Awaiting terminal confirmation" з попереднього разу
                c.statusDesc ??= null

                const { number, ...update } = fulfillPerContainer(c)
                operations.push({
                    updateOne: {
                        filter: {
                            number: c.number,
                            $or: Object.entries(update).map(([key, value]) => ({
                                [key]: { $ne: value }
                            }))
                        },
                        update: { $set: update },
                        // upsert: true     // !!! створює дублікати
                    }
                })
            }

            if (operations.length > 0) {
                console.log(`[AUTO-CHECK] ${ terminal.label } | Found: ${ foundContainers.length } | Pending NA: ${ missingContainers.size }`)
                await Container.bulkWrite(operations, { ordered: false })
            } else {
                console.log(`[AUTO-CHECK] ${terminal.label} | No changes detected`)
            }
        }

    } catch (error) {
        console.error(`[AUTO-CHECK][ERROR] ${error.code || ""} ${error.message}`)
    }
}



// ***  test
// syncContainersData()
// ***



// Terminals dashboard info

const index = async (req) => {
    try {
        const terminals = await Terminal.find()
            .select("-session.cookies -health")
            .lean()

        const UPDATE_WINDOW = new Set()

        for (t of terminals) {
            const TERMINAL = TERMINALS[t?.key || "NA"]
            t.label = TERMINAL?.label || "NA"
            t.group = TERMINAL?.group || "NA"

            if (t.stats?.statuses) {
                t.stats.statuses = Object.fromEntries(
                    Object.entries(t.stats.statuses)
                        .sort(([a], [b]) => a.localeCompare(b))
                )
            }

            if (t.stats?.lastUpdatedAt) {
                UPDATE_WINDOW.add(+t.stats.lastUpdatedAt)     //  1766066511441 з дати
            }
        }


        if (!UPDATE_WINDOW.size) return { terminals }


        // Останні оновлені контейнери
        const WINDOW_MS = 5 * 60 * 1000
        
        const minDate = new Date(Math.min(...UPDATE_WINDOW))
        const maxDate = new Date(Math.max(...UPDATE_WINDOW))
        
        const from = new Date(minDate.getTime() - WINDOW_MS)
        const to = new Date(maxDate.getTime() + WINDOW_MS)

        const lastUpdatedContainers = await Container
            .find({ updatedAt: {
                $gte: from,
                $lte: to }
            })
            .sort({ terminal: 1 })
            .select("number terminal status")
            .lean()

        for (c of lastUpdatedContainers) {
            c.terminalLabel = TERMINALS[c.terminal || "NA"]?.label
                || c.terminal
        }

        return {
            // TERMINALS_LABELS,
            terminals,
            lastUpdatedContainers
        }

    } catch (error) {
        console.error(error)
        return {}
    }
}




const cron = require("node-cron")
const { timeZone } = require("../Config/__config.json")



// Створюю розклад оновлення стоку
function createTerminalsSyncSchedule() {
    // запускаю одразу без await
    syncContainersData()

    cron.schedule('0 */3 * * *', () => {
        console.log('🔁 Sync every 3 hours')
        syncContainersData()
    }, {
        timezone: timeZone
    })
}



module.exports = {
    bulkAvailabilityCheck,
    createTerminalsSyncSchedule,

    // Middlewares
    index,
}