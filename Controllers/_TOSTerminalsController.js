const { AppError } = require("../Utils/AppError")
const { getURL } = require("../Config/terminalsCatalog")

const cheerio = require("cheerio")


// --- Утиліти для роботи з сесіями терміналів
const {
    saveCookies,
    connectTerminal,
    getIPLocation,
} = require("./_terminalSessionsControlle")



async function loginTOS(terminal) {

    const { url, env_login, env_passowrd, fetchWithMyJar } = terminal || {}

    if (!url?.trim()) throw new AppError("❌ Login failed: URL is required", 404)
    if (!fetchWithMyJar) throw new AppError("Wrong terminal setup", 500)
            
    if (!env_login?.trim() || !env_passowrd?.trim()) 
        throw new AppError("❌ Login failed: credentials are required", 403)
    
    const LOGIN = process.env[env_login]
    const PASSWORD = process.env[env_passowrd]
    if (!LOGIN || !PASSWORD) throw new AppError("Credentials are required", 403)

    const params = new URLSearchParams({
        "UserName": LOGIN,
        "Password": PASSWORD
    })

    const resp = await fetchWithMyJar(getURL(terminal,"/logon?_=639009682112015408"), {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        // redirect: "manual",     //  !! для TOS потрібно redirect: "follow"
    })

    console.log(`🔄 Logging to ${ terminal.label }... Status: ${ resp.status }`)

    if (resp.status === 200) saveCookies(terminal)
    else throw new AppError("❌ Login failed", 500)
}



// Підключення до TOS

const connectTOSTerminal = async (terminal, options = {}) => {

    if (global.isProduction) {
        // TOS працює тільки з US ip
        const isUSIP = await getIPLocation(["US"])
        if (!isUSIP) throw new AppError("US IPs allowed only", 403)
    }

    return await connectTerminal(terminal, {
        ...options,
        pingPath: "/account/Account/SelectApplication",
        loginCallback: loginTOS,
    })
}



// --- Списковий пошук контейнерів.

async function tosBulkAvailabilityCheck(terminal, containers) {

    const results = []
    
    try {

        const { url, fetchWithMyJar, env_login } = terminal || {}

        if (!url?.trim() || !fetchWithMyJar || !env_login) {
            console.warn("No terminal/url provided")
            return results
        }

        // захищаю оригінальний вхідний масив контейнерів
        let nums = Array.isArray(containers) ? [...new Set(containers)] : []
        if (!nums.length) return results

        const bulkSearchURL = getURL(terminal, "/Report/ImportContainer/ImporterContainerReport?pageSize=50&page=1&sortKey=Default&sortOrder=Ascending&_ch=1")        
        // const bulkSearchURL = getURL(terminal, "/Report/ImportContainer/InquireMultipleByContainer")

        // iterate chunks of 50 (обмеження Tideworks по 50шт per request)
        for (let i = 0; i < nums.length; i += 50) {

            const chunk = nums.slice(i, i + 50)
            if (!chunk.length) continue

            const res = await fetchWithMyJar(bulkSearchURL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    // MainMenu: "Report",
                    IsMultiInquiry: "True",
                    ContainerNumbers: chunk.join("\n"),
                }),
            })

            if (res.status >= 400) {
                // помилка запиту
                throw new AppError(`Error fetching ${ bulkSearchURL }. ${ res.statusText }`, res.status)
            }

            const html = await res.text()
            const $ = cheerio.load(html)

            for (const tr of $("table.appointment tbody tr")) {

                const cols = $(tr).find("td").map(td => $(td).text().trim()).get()
                const number = cols[1] || null

                if (!number || number.includes("Currently there are no active notifications that satisfy your criteria.")) continue

                results.push({

                    // 1️⃣ Container
                    number,
                    terminal: terminal.key,

                    status: cols[2] || null,
                    statusDesc: cols[3] || cols[4] ? `Location: ${ cols[3] }${ cols[4] ? `. Discharge Date: ${ cols[4] }` : "" }` : null,

                    containerTypeSize: cols[19] || null,
                    containerTypeSizeLabel: cols[20] || null,
                    
                    lastFreeDate: cols[12] || null,
                    appointmentDate: cols[13] || null,  //  paidThroughDate

                    // 2️⃣ Customs
                    customStatus: cols[8] || null,
                    // customTimestamp

                    // 3️⃣ Customer/Carrier/Line
                    SSCO: cols[18] || null,
                    customerStatus: cols[9] || null,
                    customerHoldReason: cols[21] ? `Genset Authorized: ${ cols[21] }` : null,
                    lineReleaseStatus: cols[16] || null,
                    lineFirstFree: cols[17] || null,

                    // 4️⃣ Terminal
                    dwellAmount: (Number(cols[11]) || 0) + (Number(cols[15]) || 0),     // demurrageDue + nonDemurrageAmount
                    damageFeeOutstanding: cols[14] || 0,   // nonDemurrageDue
                    terminalHold: cols[10] || null,
                    terminalHoldReason: cols[17] ? `LSRF LFD Date: ${ cols[17] }` : null, 

                    origin: $(tr).text()
                        .replace(/\s+/g, " ")
                        .trim()
                })
            }
        }

        return results

    } catch (error) {
        console.error(`Updating terminal "${ terminal.label }" containers issue: ${ error }`)
        return results  //  якщо виникне помилка, то повернеться вже прочитана кількість
    }
}



module.exports = {
    connectTOSTerminal,
    tosBulkAvailabilityCheck
}