// --- Утиліти для роботи з сесіями терміналів


const fs = require("fs")
const { fromJSON } = require("tough-cookie").CookieJar

const { getURL } = require("../Config/terminalsCatalog")
const { AppError } = require("../Utils/AppError")
const { Terminal } = require("../Models/terminalModel")



const STORAGE_TYPE = "MONGO"     // FILE | MONGO



// --- Завантажує cookie сесії

async function loadCookies(terminal) {
    const { cookieFile, key } = terminal || {}

    if (!key) throw new AppError("Wrong terminal setup", 500)

    try {
        let cookiesJSON = null

        if (STORAGE_TYPE === "MONGO") {
            const doc = await Terminal.findOne(
                { key },
                { "session.cookies": 1 }
            ).lean()
    
            cookiesJSON = doc?.session?.cookies
        } else {
            // "FILE"
            if (!cookieFile || !fs.existsSync(cookieFile)) return
            cookiesJSON = JSON.parse(fs.readFileSync(cookieFile, "utf8"))
        }

        if (!cookiesJSON) return
        terminal.jar = fromJSON(cookiesJSON)

    } catch (err) {
        console.warn(`⚠️ Failed to load cookies for ${ terminal?.key }:`, err.message)
    }
}



// --- Зберігає cookie сесії
async function saveCookies(terminal) {
    const { cookieFile, jar, key } = terminal || {}
    if (!jar) throw new AppError("Wrong terminal setup: no jar", 500)

    try {
        if (STORAGE_TYPE === "MONGO") {
            if (!key) throw new AppError("Wrong terminal setup: no key", 500)
            await Terminal.updateOne(
                { key },
                { $set: { "session.cookies": jar.toJSON() } },
                { upsert: true }
            )
        } else {
            if (!cookieFile) throw new AppError("Wrong terminal setup: no cookieFile", 500)
            fs.writeFileSync(cookieFile, JSON.stringify(jar.toJSON(), null, 2), "utf8")
        }
    } catch (err) {
        console.warn(`⚠️ Failed to save cookies to ${ STORAGE_TYPE } for ${ terminal.label || "NA"}:`, err.message)
    }
}



// Перевірка активності сесії
async function isSessionAlive(terminal, sessPingPath = "") {
    const { url, fetchWithMyJar, redirect = "manual", key } = terminal || {}
    
    if (!url?.trim()) throw new AppError("❌ Login failed: URL is required", 404)
    if (!fetchWithMyJar) throw new AppError("Wrong terminal setup", 500)
    
    const ping = getURL(terminal, sessPingPath)

    let alive = false

    try {
        const resp = await fetchWithMyJar(ping, {
            method: "GET",
            headers: { "User-Agent": "Mozilla/5.0" },
            redirect,
        })

        if (resp.status === 200) {
            const html = await resp.text()
            const extraCheck =
                /return loginCheck/i.test(html) ||
                /Session Timed Out/i.test(html) ||
                /You need to Login/i.test(html) ||
                /No session/i.test(html)

            alive = !extraCheck
        }
    } catch (err) {
        console.warn(`⚠️ Session ping failed for ${ terminal.label }:`, err.message)
        alive = false
    }

    // --- додаткова логіка для MONGO

    if (STORAGE_TYPE === "MONGO" && key) {
        try {
            await Terminal.updateOne(
                { key },
                {
                    $set: {
                        "session.isAlive": alive,
                        "session.lastCheckedAt": new Date()
                    }
                },
                { upsert: true }
            )
        } catch (err) {
            console.warn(`⚠️ Failed to update session in Mongo for ${ terminal.label }:`, err.message)
        }
    }

    return alive
}



// --- Виконує регламентні процедури при під*єднанні до терміналу:
// * якщо потрібно і не зроблено централізовано, то завантажує Cookies (для відповідного терміналу),
// тобто фактично "підтягує" куки до jar, щоб всі наступні запити відбувалися з відповідними куками
// * якщо сесія не активна або відсутня, то створює нову і записує у куки

const connectTerminal = async (terminal, {

    sessPingPath = "/",
    shouldloadCookies = false,
    loginCallback = async (terminal) => {
        console.log(`❗ Empty login callback for ${ terminal }`)
    },

} = {}) => {
    try {
        const { key } = terminal || {}
        if (!key) throw new AppError("Terminal key is required", 500)

        if (shouldloadCookies) await loadCookies(terminal)
        
        // перевіряю чи "жива" ще сесія, якщо ні, то наново під*єднуюся
        let isValid = await isSessionAlive(terminal, sessPingPath)
        console.info(`Connecting to "${ terminal.label || key }". Session is ${ isValid ? "valid" : "invalid" }`)

        if (!isValid) {
            isValid = await loginCallback(terminal)
            if (!isValid) throw new AppError("❌ Login failed", 500)

            await saveCookies(terminal)

            if (STORAGE_TYPE === "MONGO") {
                await Terminal.updateOne(
                    { key },
                    { 
                        $set: {
                            "session.lastLoginAt": new Date(),
                            "session.isAlive": true
                        }
                    },
                    { upsert: true }
                )
            }            
        }

        return true

    } catch (err) {
        console.error("Connecting issue: ", err.message)

        if (STORAGE_TYPE === "MONGO") {
            await Terminal.updateOne(
                { key },
                {
                    $set: {
                        "health.lastError": { message: err.message, at: new Date() }
                    }
                },
                { upsert: true }
            )
        }

        return false
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

        const _countries = Array.isArray(countries) ? countries : [ countries ]
    
        // може повертати або результат порівняння (якщо задати countries),
        // або просто країну реєстрації ip. VPN до уваги не береться
        return _countries?.length
            ? _countries.includes(geo.country)
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