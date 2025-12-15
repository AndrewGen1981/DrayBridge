const { AppError } = require("../Utils/AppError")
const { getURL } = require("../Config/terminalsCatalog")


// --- Утиліти для роботи з сесіями терміналів
const {
    saveCookies,
    connectTerminal
} = require("./_terminalSessionsControlle")




async function loginWUT(terminal) {

    const { url, env_login, env_passowrd, fetchWithMyJar } = terminal || {}

    if (!url?.trim()) throw new AppError("❌ Login failed: URL is required", 404)
    if (!fetchWithMyJar) throw new AppError("Wrong terminal setup", 500)
            
    if (!env_login?.trim() || !env_passowrd?.trim()) 
        throw new AppError("❌ Login failed: credentials are required", 403)
    
    const LOGIN = process.env[env_login]
    const PASSWORD = process.env[env_passowrd]
    if (!LOGIN || !PASSWORD) throw new AppError("Credentials are required", 403)

    const params = new URLSearchParams({
        "usrId": "",
        "pTmlCd": "USTIW",
        "pUsrId": LOGIN,
        "pUsrPwd": PASSWORD
    })

    const resp = await fetchWithMyJar(getURL(terminal,"/appAuthAction/login.do"), {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        redirect: "manual",
    })

    console.log(`🔄 Logging to ${ terminal.label }... Status: ${ resp.status }`)

    if (resp.status === 200) saveCookies(terminal)
    else throw new AppError("❌ Login failed", 500)
}



// Підключення до WUT

const connectWUTTerminal = async (terminal, options = {}) => {
    return await connectTerminal(terminal, {
        ...options,
        sessPingPath: "/main/main.do",
        loginCallback: loginWUT
    })
}



// --- Списковий пошук контейнерів.

async function uswutBulkAvailabilityCheck(terminal, containers) {

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

        const bulkSearchURL = getURL(terminal, "/uiArp02Action/searchContainerInformationListByCntrNo.do")

        // iterate chunks of 50 (обмеження Tideworks по 50шт per request)
        for (let i = 0; i < nums.length; i += 50) {

            const chunk = nums.slice(i, i + 50)
            if (!chunk.length) continue

            const res = await fetchWithMyJar(bulkSearchURL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    blFlg: "N", //  (шукаю не по BOL)
                    srchTpCd: "C",    // (тип пошуку — контейнер)
                    tmlCd: "USTIW",   // (код терміналу)
                    checkLogin: "true",
                    usrId: process.env[env_login],
                    cntrNo: chunk.join(","),
                })
            })

            if (res.status >= 400) {
                // помилка запиту
                throw new AppError(`Error fetching ${ bulkSearchURL }. ${ res.statusText }`, res.status)
            }

            const html = await res.text()
            const match = html.match(/var result\s*=\s*(\[.*?\]);/s)

            if (!match) {
                // тут все вірно, бо якщо результатів не буде, то буде "var result = []"; і якщо 
                // з переліку щось не знайдеться, то його просто не буде в "var result = []", але 
                // сам ключ "var result" повинен бути, викликаю помилку, якщо його немає і показую перші 250 символів відповіді
                throw new AppError(`Cannot find result in ${ (html || "NO HTML").replace(/\s+/g, " ").slice(0, 250) }`, 500)
            }

            const seen = new Set()

            const chunkResults = JSON.parse(match[1])

            for (const obj of chunkResults) {

                const number = obj.cntrNo

                // дублікати викликатимуть помилки
                if (!number || seen.has(number)) continue
                seen.add(number)

                results.push({

                    // 1️⃣ Container
                    number,
                    terminal: terminal.key,
                    
                    status: obj.avlbFlg,
                    statusDesc: obj.avlbDesc,
                    containerTypeSize: obj.tmlPrivCntrTpszCdNm,
                    // containerTypeSizeLabel - Seattle only
                    lastFreeDate: obj.lstFreeDt,
                    appointmentDate: obj.exstApntDt,
                    
                    // 2️⃣ Customs
                    customStatus: obj.cusmHold,
                    // customTimestamp - Seattle only

                    // 3️⃣ Customer/Carrier/Line
                    SSCO: obj.oprCd,
                    customerStatus: obj.custHold,
                    customerHoldReason: obj.custHldRsn,
                    // lineReleaseStatus - Seattle only
                    // lineFirstFree - Seattle only

                    // 4️⃣ Terminal
                    dwellAmount: obj.dwllAmt,
                    damageFeeOutstanding: obj.dmgDueFlg,
                    terminalHold: obj.tmnlHold,
                    terminalHoldReason: obj.tmnlHoldRsn,

                    origin: JSON.stringify(obj)
                        .replace(/\"/g, "")
                        .replace(/\s+/g, ""),
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
    connectWUTTerminal,
    uswutBulkAvailabilityCheck
}