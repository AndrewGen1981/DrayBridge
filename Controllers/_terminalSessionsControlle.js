// --- Утиліти для роботи з сесіями терміналів


const fs = require("fs")
const { fromJSON } = require("tough-cookie").CookieJar

const { getURL } = require("../Config/terminalsCatalog")
const { AppError } = require("../Utils/AppError")



// Завантажити cookie сесії з файлу
function loadCookies(terminal) {
    const { cookieFile } = terminal || {}
    
    if (!cookieFile) throw new AppError("Wrong terminal setup", 500)
    if (!fs.existsSync(cookieFile)) return

    try {
        const data = fs.readFileSync(cookieFile, "utf8")
        terminal.jar = fromJSON(JSON.parse(data))
        console.log(`🔁 Cookies for ${ terminal.key } restored from file`)
    } catch (err) {
        console.warn(`⚠️ Failed to load cookies for ${ terminal.key }:`, err.message)
    }
}



// Зберегти cookie сесії у файл
function saveCookies(terminal) {
    const { cookieFile, jar } = terminal || {}
    if (!cookieFile || !jar) throw new AppError("Wrong terminal setup", 500)

    fs.writeFileSync(cookieFile, JSON.stringify(jar.toJSON(), null, 2), "utf8")
    console.log("💾 Cookies saved")
}



// Перевірка активності сесії
async function isSessionAlive(terminal, pingPath = "", agent) {
    const { url, fetchWithMyJar } = terminal || {}
    
    if (!url?.trim()) throw new AppError("❌ Login failed: URL is required", 404)
    if (!fetchWithMyJar) throw new AppError("Wrong terminal setup", 500)
    
    const ping = getURL(terminal, pingPath)
    
    const request = { redirect: "manual" }
    if (agent) request.agent = agent

    const resp = await fetchWithMyJar(ping, request)

    if (resp.status !== 200) return false

    // Додаткова перевірка дяя WUT
    const html = await resp.text()
    if (html.includes("Session Timed Out")) {
        // You need to Login to access this module
        return false
    }

    return true
}



// --- Виконує регламентні процедури при під*єднанні до терміналу:
// * якщо потрібно і не зроблено централізовано, то завантажує Cookies (з відповідного файлу терміналу),
// тобто фактично "підтягує" куки до jar, щоб всі наступні запити відбувалися з відповідними куками
// * якщо сесія не активна або відсутня, то створює нову і записує у кукі-файл терміналу

const connectTerminal = async (terminal, {

    pingPath = "/",
    shouldloadCookies = false,
    loginCallback = async (terminal) => {
        console.log(`❗ Empty login callback for ${ terminal }`)
    },
    agent = undefined,

} = {}) => {
    try {
        if (shouldloadCookies) loadCookies(terminal)
        
        // #1 перевіряю чи "жива" ще сесія (читаю з файлу COOKIE_FILE)
        const alive = await isSessionAlive(terminal, pingPath, agent)
        
        // #2 якщо ні, то наново під*єднуюся і записую сесію в файл COOKIE_FILE
        if (alive) {
            console.log("✅ Using existing session")
        } else {
            await loginCallback(terminal)
            console.log("New session was created")
        }

        return true

    } catch (error) {
        console.error(`Connecting to "${ terminal.label || 'NA' }" issue: ${ error }`)
    }
}



const getIP = async () => {
    try {
        return await fetch("https://api.ipify.org?format=json")
            .then(r => r.json())
            .then(d => d.ip)
    } catch (error) {
        console.warn(`Get IP issue: ${ error }`)
        return null
    }
}



const getIPLocation = async (countries = []) => {
    try {
        const ip = await getIP() || null
        if (!ip) return
    
        const geo = await fetch(`https://ipinfo.io/${ ip }/json`)
            .then(r => r.ok && r.json())
            
        if (!geo?.country) return
    
        // може повертати або результат порівняння (якщо задати countries),
        // або просто країну реєстрації ip. VPN до уваги не береться
        return countries?.length
            ? countries.includes(geo.country)
            : geo.country

    } catch (error) {
        console.warn(`Get IP location issue: ${ error }`)
        return false
    }
}



module.exports = {
    loadCookies,
    saveCookies,
    isSessionAlive,

    connectTerminal,

    getIP,
    getIPLocation,
}