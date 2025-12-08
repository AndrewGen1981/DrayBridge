// const t18Endpoint = "https://t18.tideworks.com/fc-T18/default.do"


// Контролер для роботи з терміналами Seattle (t5, t18, t30 і т.д.)
// всі ці термінали вимагають єдиного підходу до логіну, перевірки активності сесії та використовують однакові http методи, endpoints


const fs = require("fs")
const cheerio = require("cheerio")

// тут це потрібно, бо використовую метод fromJSON даного класу
const { CookieJar } = require("tough-cookie")

const { setTimeout } = require("node:timers/promises")
const { AppError } = require("../Utils/AppError")



// --- Утиліти для роботи з сесією та логіном


const getBaseURL = (url) => {
    const _url = url.trim()
    return `${ _url }${ _url.endsWith("/") ? "" : "/" }`
}



// Завантажити cookie сесії з файлу
function loadCookies_ForSeattleTerminal(terminal) {
    const { cookieFile } = terminal || {}
    
    if (!cookieFile) throw new AppError("Wrong terminal setup", 500)
    if (!fs.existsSync(cookieFile)) return

    try {
        const data = fs.readFileSync(cookieFile, "utf8")
        terminal.jar = CookieJar.fromJSON(JSON.parse(data))
        console.log(`🔁 Cookies for ${ terminal.key } restored from file`)
    } catch (err) {
        console.warn(`⚠️ Failed to load cookies for ${ terminal.key }:`, err.message)
    }
}


// Зберегти cookie сесії у файл
function saveCookies(terminal) {
    if (!terminal?.cookieFile || !terminal?.jar) throw new AppError("Wrong terminal setup", 500)

    fs.writeFileSync(terminal.cookieFile, JSON.stringify(terminal.jar.toJSON(), null, 2), "utf8")
    console.log("💾 Cookies saved")
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

    console.log(`🔄 Logging in to ${ terminal.label }...`)

    const fetchURL = getBaseURL(url.trim())

    // GET стартової сторінки для ініціалізації cookie
    await fetchWithMyJar(`${ fetchURL }default.do`, {
        headers: { "User-Agent": "Mozilla/5.0" },
    })

    const params = new URLSearchParams({
        j_username: LOGIN,
        j_password: PASSWORD,
    })

    const resp = await fetchWithMyJar(`${ fetchURL }j_spring_security_check`, {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        redirect: "manual",
    })

    console.log("Login status:", resp.status, resp.headers.get("location"))

    if (resp.status === 302) saveCookies(terminal)
    else throw new AppError("❌ Login failed", 500)
}

// Перевірка активності сесії
async function isSessionAlive(terminal) {
    const { url, fetchWithMyJar } = terminal || {}

    
    if (!url?.trim()) throw new AppError("❌ Login failed: URL is required", 404)
    if (!fetchWithMyJar) throw new AppError("Wrong terminal setup", 500)
            
    const fetchURL = getBaseURL(url.trim())
    const resp = await fetchWithMyJar(`${ fetchURL }home/default.do`, { redirect: "manual" })

    return resp.status === 200
}


// Підключення CookieJar до конкретного терміналу
const connectSeattleTerminal = async (terminal, { shouldloadCookies = false } = {}) => {
    try {
        // --- Під*єднуюся до терміналу
        if (shouldloadCookies) loadCookies_ForSeattleTerminal(terminal)    // не завжди потрібно, наприклад, якщо це спискове оновлення, то достатньо раз обновити для всіх терміналів
        
        // #1 перевіряю чи "жива" ще сесія (читаю з файлу COOKIE_FILE)
        const alive = await isSessionAlive(terminal)
        
        // #2 якщо ні, то наново під*єднуюся і записую сесію в файл COOKIE_FILE
        if (alive) {
            console.log("✅ Using existing session")
        } else {
            await loginTideworks(terminal)
            console.log("New session was created")
        }

        return true

    } catch (error) {
        console.error(`Connect to Seattle terminal "${ terminal.label || 'NA' }" issue: ${ error }`)
    }
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
        
        const baseURL = getBaseURL(terminal.url.trim())
        const results = isMapResults ? {} : []

        for (const container of [ ...new Set(containers) ]) {
            // шукаю базову інформацію про контейнер
            const equipmentRequestURL = `${ baseURL }import/default.do?method=container&eqptNbr=${ container }`
            // шукаю OSRA Compliance Information
            const OSRAComplianceRequestURL = `${ baseURL }equipment/default.do?method=OSRAComplianceInformation&equipmentNumber=${ container }&soLineId=WSL`
            
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
    try {
        const { url, fetchWithMyJar } = terminal || {}
        const URL = url?.trim()

        if (!URL || !fetchWithMyJar) {
            console.warn("No terminal/url provided")
            return []
        }

        // захищаю оригінальний вхідний масив контейнерів
        let nums = Array.isArray(containers) ? [...new Set(containers)] : []
        if (!nums.length) return []

        const baseURL = `${ getBaseURL(URL) }import/default.do?method=defaultSearch`

        const clean = v => (v || "").replace(/\s+/g, " ").trim()

        const results = []

        // iterate chunks of 50 (обмеження Tideworks по 50шт per request)
        for (let i = 0; i < nums.length; i += 50) {

            const chunk = nums.slice(i, i + 50)
            if (!chunk.length) continue

            // availabilityCheckFunc should accept (baseURL, chunk)
            const res = await fetchWithMyJar(
                baseURL,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        scac: "",
                        searchBy: "CTR",
                        numbers: chunk.join("\n"),
                    })
                }
            )

            const $ = cheerio.load(await res.text())
            const chunkResults = []

            for (const tr of $("#result table tbody tr")) {
                const tds = $(tr).find("td")

                // 1 — номер контейнера
                const number = clean($(tds[0]).find("a").first().text())
                if (!number || number.toLowerCase() === "check nearby locations") continue

                const cData = { number, terminal: terminal.key }

                // 2 — статус
                cData.status = clean($(tds[1]).find("div").text())

                // 3 — тип контейнера (20DR, 40HC...)
                cData.type = clean($(tds[2]).find("strong").first().text())
                cData.typeLabel = clean($(tds[2]).find("small").first().text())

                // 4 — деталi (Customs, Line, Holds...)
                const detailsTd = $(tds[3])

                const customsEl = detailsTd.find("span:contains('Customs')").next()
                cData.customStatus = clean(customsEl.text())
                cData.customTimestamp = customsEl.attr("title")

                const lineReleaseEl = detailsTd.find("span:contains('Line Release Status')").next()
                cData.lineReleaseStatus = clean(lineReleaseEl.text())
                cData.lineReleaseTimestamp = lineReleaseEl.attr("title")

                cData.holds = clean(detailsTd.find("div:contains('Holds')").text())
                cData.totalFees = clean(detailsTd.find("div:contains('Total Fees') strong").text())
                cData.satisfiedThru = clean(detailsTd.find("div:contains('Satisfied Thru') strong").text())

                // 5 — блок Location / Vessel etc.
                const locTd = $(tds[4])

                cData.location = clean(locTd.find("span:contains('Location')").parent().find("strong").first().text())
                cData.vesselVoy = clean(locTd.find("div:contains('Ves/Voy') strong").text())
                cData.line = clean(locTd.find("div:contains('Line:') strong").text())
                cData.trucker = clean(locTd.find("div:contains('Trucker') strong").text())
                cData.requiredAccessory = clean(locTd.find("div:contains('Required Accessory') strong").text())

                chunkResults.push(cData)
            }

            results.push(...chunkResults)
        }

        return results

    } catch (error) {
        console.error(`Updating terminal "${ terminal.label }" containers issue: ${ error }`)
        return []
    }
}




module.exports = {
    loadCookies_ForSeattleTerminal,
    connectSeattleTerminal,

    seattlePerItemtAvailabilityCheck,
    seattleBulkAvailabilityCheck
}