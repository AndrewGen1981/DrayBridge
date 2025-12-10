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
    return connectTerminal(terminal, {
        ...options,
        pingPath: "/home/default.do",
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

// Утиліта для seattlePerItemtAvailabilityCheck
// Виніс в окрему функцію просто щоб можна було робити await "Promise.all" і отримувати одразу (паралельно) дані по equipment та osra
const seattlePerItemtAvailabilityFetch = async (fetchContainerURL, selector = "body") => {
    if (!fetchContainerURL?.trim()) return
    const content = await fetchWithJar(fetchContainerURL)
    const $ = cheerio.load(await content.text())
    return $(selector).html()?.trim() || null
}



// Стандартний механізм пошуку приналежності контенера до терміналу (по одному контейнеру за один запит)
// * основна інформація - через /import/default.do?method=container&eqptNbr=NWRU3635205 (приклад)
// * додаткова інформація - через /equipment/default.do?method=OSRAComplianceInformation&equipmentNumber=NWRU3635205 (приклад)
const seattlePerItemtAvailabilityCheck = async (terminal, containers, options) => {
    try {
        if (!terminal?.url) throw new AppError("Terminal is not defined.", 400)
        if (!containers?.length) throw new AppError("Empty containers set.", 422)

        const isConnected = await connectSeattleTerminal(terminal, options)
        if (!isConnected) throw new AppError("Cannot connect to the Terminal.", 500)            

        const {
            pause = 1000,   // пауза, щоб уникнути rate limit, можна змінити в опціях; "0/false" - відміняє паузу
            isMapResults = false    // результати можна повернути як Map, якщо далі необхідно проводити співсталення даних з базою
        } = options
        
        const results = isMapResults ? {} : []

        for (const container of [ ...new Set(containers) ]) {
            // шукаю базову інформацію про контейнер
            const equipmentRequestURL = getURL(terminal, `/import/default.do?method=container&eqptNbr=${ container }`)

            // шукаю OSRA Compliance Information
            const OSRAComplianceRequestURL = getURL(terminal, `/equipment/default.do?method=OSRAComplianceInformation&equipmentNumber=${ container }&soLineId=WSL`)
            
            const [ equipment, osra ] = await Promise.all([
                seattlePerItemtAvailabilityFetch(equipmentRequestURL, "body > div.container"),
                seattlePerItemtAvailabilityFetch(OSRAComplianceRequestURL, "body")
            ])

            // визначаю як зберігати результати
            if (isMapResults) {
                results[container] = {
                    equipment, osra,
                    terminal: terminal.key,
                }
            } else {
                results.push({
                    container, equipment, osra,
                    terminal: terminal.key,
                })
            }

            console.log(`[SeattleDefaultChecker] Done: ${ container }, terminal ${ terminal.label }`)

            if (pause) await setTimeout(pause)
        }

        return results
        
    } catch (error) {
        console.error(`Updating terminal containers issue: ${ error }`)
        const status = error.status || 500
        const message = error.message || String(error)
        throw new AppError(message, status)     //  прокидаю помилку далі
    }
}



// --- Метод #2. Списковий пошук (seattleBulkAvailabilityCheck).


// Перевіряє приналежність списку контейнерів до конкретного терміналу
async function seattleBulkAvailabilityCheck(terminal, containers) {

    const results = []
    const clean = v => (v || "").replace(/\s+/g, " ").trim()    //  утиліта

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

            const $ = cheerio.load(await res.text())

            for (const tr of $("#result table tbody tr")) {
                const tds = $(tr).find("td")

                // 1️⃣ Container
                
                const number = clean($(tds[0]).find("a").first().text())
                if (!number || number.toLowerCase() === "check nearby locations") continue

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