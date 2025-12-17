// const t18Endpoint = "https://t18.tideworks.com/fc-T18/default.do"


// Контролер для роботи з терміналами Seattle (t5, t18, t30 і т.д.)
// всі ці термінали вимагають єдиного підходу до логіну, перевірки активності сесії та використовують однакові http методи, endpoints


const { setTimeout } = require("node:timers/promises")


const cheerio = require("cheerio")


const { AppError } = require("../Utils/AppError")
const { getURL } = require("../Config/terminalsCatalog")


// --- Утиліти для роботи з сесіями терміналів
const {
    saveCookies,
    connectTerminal
} = require("./_terminalSessionsControlle")



// Утиліта для безпечного парсингу HTML
const clean = v => {
    const s = (v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim()

    return s || null
}



// Логін на латформу терміналу, у Tideworks (фізичний логін, на рівні http)
async function loginTideworks(terminal) {
    const { url, env_login, env_passowrd, fetchWithMyJar } = terminal || {}

    if (!url?.trim()) throw new AppError("❌ Login failed: URL is required", 404)
    if (!fetchWithMyJar) throw new AppError("Wrong terminal setup", 500)
            
    if (!env_login?.trim() || !env_passowrd?.trim()) 
        throw new AppError("❌ Login failed: credentials are required", 403)
    
    const LOGIN = process.env[env_login]
    const PASSWORD = process.env[env_passowrd]
    if (!LOGIN || !PASSWORD) throw new AppError("Credentials are required", 403)

    // GET стартової сторінки для ініціалізації cookie
    await fetchWithMyJar(getURL(terminal, "/default.do"),{
        headers: { "User-Agent": "Mozilla/5.0" }
    })

    const params = new URLSearchParams({
        j_username: LOGIN,
        j_password: PASSWORD,
    })

    const resp = await fetchWithMyJar(getURL(terminal, "/j_spring_security_check"), {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        redirect: "manual",
    })

    console.log(`🔄 Logging to ${ terminal.label }... Status: ${ resp.status }`)

    if (resp.status === 302) saveCookies(terminal)
    else throw new AppError("❌ Login failed", 500)
}



// Підключення до конкретного терміналу Сіетлу
const connectSeattleTerminal = async (terminal, options = {}) => {
    return await connectTerminal(terminal, {
        ...options,
        sessPingPath: "/home/default.do",
        loginCallback: loginTideworks
    })
}


// --- Утиліти для отримання даних по списку контейнерів (перевірка приналежності).
// існує 2 варіанта отримання даних:

// 1) можна отримувати інформацію по одному контейнеру за 1 запит (seattlePerItemtAvailabilityCheck),
// повертаються дещо розширені дані по конкретному контейнеру + OSRA. Метод використовується для інтервального оновлення даних по контейнеру.

// 2) інформацію також можна отримувати списково, по масиву контейнерів (але не більше 50шт за раз) - seattleBulkAvailabilityCheck.
// Дані не містять OSRA блоку, але натомість можна перевіряти списком, що добре для INIT перевірок, наприклад при addContainers.


// --- Метод #1. Поштучний пошук (seattlePerItemtAvailabilityCheck).


// Стандартний механізм пошуку приналежності контенера до терміналу (по одному контейнеру за один запит)
// * основна інформація - через /import/default.do?method=container&eqptNbr=NWRU3635205 (приклад)
// * додаткова інформація - через /equipment/default.do?method=OSRAComplianceInformation&equipmentNumber=NWRU3635205 (приклад)

const seattlePerItemtAvailabilityCheck = async (terminal, _containers, { pause = 250 } = {}) => {

    const results = []

    try {
        const { url, fetchWithMyJar } = terminal || {}

        if (!url?.trim() || !fetchWithMyJar) {
            console.warn("No terminal/url provided")
            return results
        }

        // захищаю оригінальний вхідний масив контейнерів
        let containers = Array.isArray(_containers) ? [...new Set(_containers)] : []
        if (!containers.length) return results

        const seen = new Set()
        
        for (const container of containers) {

            if (seen.has(container)) continue
            seen.add(container)

            // шукаю базову інформацію про контейнер
            const containerPromise = terminal
                .fetchWithMyJar(getURL(terminal, `/import/default.do?method=container&eqptNbr=${ container }`))
                .then(r => r.text())
            
            // запасний url, попередній повертає більш розширену інформацію, але не повертає нічого
            // по експортних операціях та контейнерах в статусі "Empty"
            const containerBackupPromise = terminal
                .fetchWithMyJar(getURL(terminal, `/equipment/default.do?method=equipmentSubmit&equipClass=CTR&number=${ container }`))
                .then(r => r.text())

            // шукаю OSRA Compliance Information
            const osraPromise = terminal
                .fetchWithMyJar(getURL(terminal, `/equipment/default.do?method=OSRAComplianceInformation&equipmentNumber=${ container }&soLineId=WSL`))
                .then(r => r.text())

            const [cntrHTML, backHTML, osraHTML] = await Promise.all([containerPromise, containerBackupPromise, osraPromise])

            const obj = {
                number: container,
                terminal: terminal.key,
            }

            const mapStrong = {}
            const mapSpan = {}

            if ((cntrHTML?.trim() && !/have an issue/i.test(cntrHTML)) ||
                (backHTML?.trim() && !/No records found matching your search criteria/i.test(backHTML))) {

                const isCNTR = cntrHTML?.trim() && !/have an issue/i.test(cntrHTML)

                const $ = cheerio.load(isCNTR ? cntrHTML : backHTML)
                
                let root
                if (isCNTR) {
                    root = $("h2:contains('Container')").first().closest(".container")
                } else {
                    root = $("#result")
                }

                root.find("div").each((_, el) => {
                    const label = clean($(el).contents().first().text())
                    const strong = clean($(el).find("strong").first().text())
                    const span = clean($(el).find("span").first().text())
                    if (label) {
                        if (strong) mapStrong[label] = strong
                        if (span) mapSpan[label] = span
                    }
                })

                obj.status = [mapStrong["Available for pickup:"], mapStrong["Category:"], mapStrong["Status:"]].filter(Boolean).join(", ")

                obj.containerTypeSize = [mapStrong["Size/Type:"], mapStrong["Weight:"], mapStrong["Gross Weight:"]].filter(Boolean).join(", ")
                obj.containerTypeSizeLabel = mapSpan["Size/Type:"]

                obj.SSCO = [mapStrong["Line:"], mapStrong["Vessel/Voyage:"]].filter(Boolean).join(", ")
                obj.customerStatus = [mapStrong["Location:"], mapStrong["Unload Date:"]].filter(Boolean).join(", ")

                obj.terminalHold = mapStrong["Holds:"]
                obj.terminalHoldReason = mapStrong["Add'l Holds Info:"]

                // ===== Fees / Dwell =====
                obj.dwellAmount = clean(root.find("div:contains('Total Fees') strong").last().text())

                obj.customStatus = mapStrong["Customs Release Status:"]
                obj.customTimestamp = clean(root.find("#cust-rel-date").text())

                obj.lineReleaseStatus = mapStrong["Line Release Status:"]
                obj.customerStatus ??= clean(root.find("#line-rel-date").text())

                obj.appointmentDate = mapStrong["Satisfied Thru:"]
            }


            const mapOSRA = {}

            if (osraHTML?.trim() && new RegExp(container, "i").test(osraHTML)) {
                const $ = cheerio.load(osraHTML)
                const root = $(".pad-20").first()

                root.find("div").each((_, el) => {
                    const label = clean($(el).contents().first().text())
                    const strong = clean($(el).find("strong").first().text())
                    if (label) mapOSRA[label] = strong || null
                })

                const statusDesc = mapOSRA["Container Available:"]
                if (statusDesc) obj.statusDesc = `Container Available: ${ statusDesc }`

                // ===== Line Free Days =====
                obj.lineFirstFree = mapOSRA["Line First Free Day:"]
                obj.lastFreeDate = mapOSRA["Line Last Free Day:"]
            
                // ===== Port Free Days =====
                obj.portFirstFreeDay = mapOSRA["Port First Free Day:"]
                obj.portLastFreeDay = mapOSRA["Port Last Free Day:"]
            
                // Це сума "Total Fees" по контейнеру та усіх fee по OSRA, перезаписую поле dwellAmount
                obj.dwellAmount = clean(root.find("div:contains('Grand Total') strong").last().text())
            }

            const origin = { ...mapStrong, ...mapSpan, ...mapOSRA }
            if (Object.keys(origin).length) {
                obj.origin = JSON.stringify(origin)
                results.push(obj)
            }            

            if (pause) await setTimeout(pause)
        }

        return results
        
    } catch (error) {
        console.error(`Updating terminal "${ terminal.label }" containers issue: ${ error }`)
        return results  //  якщо виникне помилка, то повернеться вже прочитана кількість
    }
}



// --- Метод #2. Списковий пошук (seattleBulkAvailabilityCheck).


// Перевіряє приналежність списку контейнерів до конкретного терміналу
async function seattleBulkAvailabilityCheck(terminal, containers) {

    const results = []

    try {
        const { url, fetchWithMyJar } = terminal || {}

        if (!url?.trim() || !fetchWithMyJar) {
            console.warn("No terminal/url provided")
            return results
        }

        // захищаю оригінальний вхідний масив контейнерів
        let nums = Array.isArray(containers) ? [...new Set(containers)] : []
        if (!nums.length) return results

        const bulkSearchURL = getURL(terminal, "/import/default.do?method=defaultSearch")

        // iterate chunks of 50 (обмеження Tideworks по 50шт per request)
        for (let i = 0; i < nums.length; i += 50) {

            const chunk = nums.slice(i, i + 50)
            if (!chunk.length) continue

            const res = await fetchWithMyJar(bulkSearchURL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    scac: "",
                    searchBy: "CTR",
                    numbers: chunk.join("\n"),
                })
            })

            if (res.status >= 400) {
                // помилка запиту
                throw new AppError(`Error fetching ${ bulkSearchURL }. ${ res.statusText }`, res.status)
            }

            const seen = new Set()

            const $ = cheerio.load(await res.text())

            for (const tr of $("#result table tbody tr")) {
                const tds = $(tr).find("td")

                // 1️⃣ Container
                
                const number = clean($(tds[0]).find("a").first().text())
                if (!number || number.toLowerCase() === "check nearby locations") continue

                // дублікати викликатимуть помилки
                if (seen.has(number)) continue
                seen.add(number)

                const cData = { number, terminal: terminal.key }

                cData.status = clean($(tds[1]).find("div").text())
                // statusDesc - відсутній, пізніше читається з OSRA як "Container Available"

                cData.containerTypeSize = clean($(tds[2]).find("strong").first().text())
                cData.containerTypeSizeLabel = clean($(tds[2]).find("small").first().text())

                const detailsTd = $(tds[3])
                const locTd = $(tds[4])
                
                // lastFreeDate - тут відсутній, читається потім як "OSRA. Line Last Free Day"
                cData.appointmentDate = clean(detailsTd.find("div:contains('Satisfied Thru') strong").text())

                // 2️⃣ Customs

                const customsEl = detailsTd.find("span:contains('Customs')").next()
                cData.customStatus = clean(customsEl.text())
                cData.customTimestamp = customsEl.attr("title")

                // 3️⃣ Customer/Carrier/Line

                cData.SSCO = clean(locTd.find("div:contains('Line:') strong").text())
                
                const lineReleaseEl = detailsTd.find("span:contains('Line Release Status')").next()
                cData.customerStatus = lineReleaseEl.attr("title")
                // customerHoldReason - тут відсутній, Seattle не надає даних

                cData.lineReleaseStatus = clean(lineReleaseEl.text())
                // lineFirstFree тут немає, читається пізжніше як OSRA. Line First Free Day

                // 4️⃣ Terminal

                cData.dwellAmount = clean(detailsTd.find("div:contains('Total Fees') strong").text())
                // damageFeeOutstanding тут немає
                cData.terminalHold = clean(detailsTd.find("div:contains('Holds')").text())
                // terminalHoldReason тут немає
                
                cData.origin = $(tr).text()
                    .replace(/\s+/g, " ")
                    .replace("Email me when container availability status changes More", "")
                    .trim()

                results.push(cData)
            }
        }

        return results

    } catch (error) {
        console.error(`Updating terminal "${ terminal.label }" containers issue: ${ error }`)
        return results  //  якщо виникне помилка, то повернеться вже прочитана кількість
    }
}




module.exports = {
    connectSeattleTerminal,
    seattlePerItemtAvailabilityCheck,
    seattleBulkAvailabilityCheck
}