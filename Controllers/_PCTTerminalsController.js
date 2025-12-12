const { AppError } = require("../Utils/AppError")
const { getURL, TERMINALS } = require("../Config/terminalsCatalog")

const cheerio = require("cheerio")


// --- Утиліти для роботи з сесіями терміналів
const {
    saveCookies,
    connectTerminal,
} = require("./_terminalSessionsControlle")



async function loginPCT(terminal) {

    const { url, env_login, env_passowrd, fetchWithMyJar } = terminal || {}

    if (!url?.trim()) throw new AppError("❌ Login failed: URL is required", 404)
    if (!fetchWithMyJar) throw new AppError("Wrong terminal setup", 500)
            
    if (!env_login?.trim() || !env_passowrd?.trim()) 
        throw new AppError("❌ Login failed: credentials are required", 403)
    
    const LOGIN = process.env[env_login]
    const PASSWORD = process.env[env_passowrd]
    if (!LOGIN || !PASSWORD) throw new AppError("Credentials are required", 403)

    // Доступ до PCT специфічний

    // 1) завантажую сторінку та отримую з неї PI_VERIFY_KEY, це їх такий CSRF-токен, без 
    // цього ключа не можливо скласти основний запит на логін. Якщо ж ключ не вірний чи 
    // не вдасться залогінитися з першого разу, то сторінка вимагатиме графічний capcha код

    const loginPage = await fetchWithMyJar(getURL(terminal,"/"))
    const loginPageText = await loginPage.text()

    const CSRF = loginPageText.match(/&verifyKey=(\d{6})/)
    const PI_VERIFY_KEY = CSRF ? CSRF[1] : null     //  очікую 6-значне число

    const params = new URLSearchParams({
        "PI_LOGIN_ID": LOGIN,
        "PI_PASSWORD": PASSWORD,
        PI_VERIFY_KEY,
    })

    const resp = await fetchWithMyJar(getURL(terminal,"/login"), {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
    })

    // 2) наступна особливість: статус - не показник, в resp має опинитися строковий JSON з 
    // приблизно такий {"chkVerify":false,"success":true,"_sk":"9615337114"} і тут _sk - це
    // ключ сесії, яким в подальшому потрібно підписувати кожен запит, на рівні з куками 

    const loginResponse = await resp.text()
    const { success, _sk } = JSON.parse(loginResponse || "{}") || {}

    console.log(`🔄 Logging to ${ terminal.label }... Status: ${ resp.status }, response: ${ loginResponse }`)

    if (_sk) terminal._sk = _sk

    if (resp.status === 200 && success && _sk) saveCookies(terminal)
    else throw new AppError("❌ Login failed", 500)
}



// Підключення до PCT

const connectPCTTerminal = async (terminal, options = {}) => {

    // в connectTerminal є пеервірка сесії, але щоб не робити порожній запит спершу перевірю
    if (!terminal._sk) {
        // якщо ключ сесії (_sk) відсутній, то не важливо че існує кука і чи вона ще валідна,
        // потрібно перелогінитися і отримати новий ключ сесії (_sk)
        await loginPCT(terminal)
        return Boolean(terminal._sk)
    }

    return await connectTerminal(terminal, {
        ...options,
        sessPingPath: `/data/WIMPP003.queryByCnta.data.json?_sk=${ terminal._sk }`,
        loginCallback: loginPCT,
    })
}



// --- Списковий пошук контейнерів.

async function pctBulkAvailabilityCheck(terminal, containers) {

    const results = []
    
    try {

        const { url, fetchWithMyJar, _sk } = terminal || {}

        if (!url?.trim() || !fetchWithMyJar || !_sk) {
            console.warn("No 'terminal/url/_sk' provided")
            return results
        }

        // захищаю оригінальний вхідний масив контейнерів
        let nums = Array.isArray(containers) ? [...new Set(containers)] : []
        if (!nums.length) return results

        const bulkSearchURL = getURL(terminal, "/data/WIMPP003.queryByCnta.data.json?_dc=1765536001982")

        // iterate chunks of 50 (обмеження Tideworks по 50шт per request)
        for (let i = 0; i < nums.length; i += 50) {

            const chunk = nums.slice(i, i + 50)
            if (!chunk.length) continue

            const res = await fetchWithMyJar(bulkSearchURL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    PI_BUS_ID: "?cma_bus_id",
                    PI_TMNL_ID: "?cma_env_loc",
                    PI_CTRY_CODE: "?cma_env_ctry",
                    PI_STATE_CODE: "?cma_env_state",
                    PI_CNTR_NO: chunk.join("\n"),
                    page: "1",
                    start: "0",
                    limit: "-1",
                    _sk,    //  <= тут номер сесії
                }),
            })

            if (res.status !== 200) {
                // помилка запиту
                throw new AppError(`Error fetching ${ bulkSearchURL }. ${ res.statusText }`, res.status)
            }

            // читаю текст відповіді
            let contRespText
            try {
                contRespText = await res.text()
            } catch (err) {
                throw new AppError(`Failed to read response text: ${ err }`, 500)
            }

            // перетворюю текст відповіді в об*єкт
            let contRespObj
            try {
                contRespObj = JSON.parse(contRespText || "{}")
            } catch (err) {
                throw new AppError(`Failed to parse JSON: ${ err }`, 500)
            }

            // перевіряю коректність отриманих результатів
            if (!contRespObj || contRespObj.success !== true || !Array.isArray(contRespObj.data) || !Array.isArray(contRespObj.cols)) {
                console.warn("Response is not successful or missing data/cols")
                return results
            }

            // заголовки
            const colsNames = contRespObj.cols.map(c => c.name)

            // дані
            for (let row of (contRespObj.data || [])) {
                const obj = {}

                colsNames.forEach((colName, idx) => {
                    obj[colName] = idx < row.length ? row[idx] : null
                })

                if (
                    !obj.PO_TERMINAL_ID ||
                    !obj.PO_TERMINAL_NAME ||
                    /not found/i.test(obj.PO_TERMINAL_NAME)
                ) continue

                results.push({
                    number: obj.PO_CNTR_NO || null,
                    terminal: terminal.key,
                    subTerminal: obj.PO_TERMINAL_ID?.toLowerCase() || null,
                    
                    status: obj.PO_AVAILABLE_IND || null,
                    statusDesc: obj.PO_USA_STATUS || obj.PO_FR_STATUS || obj.PO_CARRIER_STATUS || null,
                    
                    containerTypeSize: [
                        obj.PO_CNTR_TYPE_S,
                        obj.PO_CNTR_TYPE_H,
                    ].filter(Boolean).join(" "),
                    containerTypeSizeLabel: [
                        obj.PO_CNTR_TYPE,
                        obj.PO_CNTR_TYPE_T
                    ].filter(Boolean).join(" "),

                    lastFreeDate: obj.PO_DM_LAST_FREE_DATE || obj.PO_ORI_LAST_FREE_DATE || null,
                    appointmentDate: obj.PO_APPOINTMENT_TIME || null,
                    
                    customStatus: obj.PO_CUSTOMS_REMARK || obj.PO_DM_STATUS || null,
                    customTimestamp: obj.PO_DM_LAST_FREE_DATE || null,
                    
                    SSCO: obj.PO_CARRIER || obj.PO_CARRIER_SCAC_CODE || null,
                    terminalHold: obj.PO_TMNL_HOLD_IND || null,
                    terminalHoldReason: obj.PO_TMF_STATUS || obj.PO_DM_STATUS || null,
                    damageFeeOutstanding: obj.PO_DM_AMT_DUE || null,

                    origin: JSON.stringify(obj),
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
    connectPCTTerminal,
    pctBulkAvailabilityCheck
}



// async function test () {

//     const terminal = TERMINALS["pct"]
//     const { url, env_login, env_passowrd, fetchWithMyJar } = terminal || {}
//     const LOGIN = process.env[env_login]
//     const PASSWORD = process.env[env_passowrd]



    


//     const resp1 = await fetchWithMyJar(getURL(terminal,"/"))
//     const loginPage = await resp1.text()

//     const m = loginPage.match(/&verifyKey=(\d{6})/);
//     const PI_VERIFY_KEY = m ? m[1] : null;

//     console.log(PI_VERIFY_KEY)
//     // тут має повернути 6-значне число

//     const params = new URLSearchParams({
//         "PI_LOGIN_ID": LOGIN,
//         "PI_PASSWORD": PASSWORD,
//         PI_VERIFY_KEY,
//     })


//     const resp = await fetchWithMyJar(getURL(terminal,"/login"), {
//         method: "POST",
//         headers: {
//             "User-Agent": "Mozilla/5.0",
//             "Content-Type": "application/x-www-form-urlencoded",
//         },
//         body: params.toString(),
//         // redirect: "follow",
//         // redirect: "manual",
//     })

//     console.log(resp.status)

//     const loginResponse = await resp.text()

//     console.log(loginResponse)
//     // тут має повернути щось типу {"chkVerify":false,"success":true,"_sk":"9615337114"}

//     const { success, _sk } = JSON.parse(loginResponse || "{}")
//     console.log(success, _sk)



//     // перевіряю сесію


//     // const resp5 = await fetchWithMyJar(
//     //     getURL(terminal, "/data/WIMPP003.queryByCnta.data.json?_sk=" + _sk),
//     //     { method: "POST" }
//     // );
//     const resp5 = await fetchWithMyJar(
//         getURL(terminal, `/data/WIMPP003.queryByCnta.data.json?_sk=${ _sk }`),
//         { method: "GET" }
//     );

//     console.log(resp5.status)
//     console.log(await resp5.text())

//     //     200
//     // {"success":false,"msg":"No data found."



//     // отримую контейнери

//     const params1 = new URLSearchParams({
//         PI_BUS_ID: "?cma_bus_id",
//         PI_TMNL_ID: "?cma_env_loc",
//         PI_CTRY_CODE: "?cma_env_ctry",
//         PI_STATE_CODE: "?cma_env_state",
//         PI_CNTR_NO: "DRYU9878330\nEMCU8949670\nCBHU9524510",
//         page: "1",
//         start: "0",
//         limit: "-1",
//         _sk,    //  <= тут номер сесії
//     });

//     // https://www.etslink.com/data/WIMPP003.queryByCnta.data.json?_dc=1765536001982

//     const resp2 = await fetchWithMyJar(getURL(terminal,"/data/WIMPP003.queryByCnta.data.json?_dc=1765536001982"), {
//         method: "POST",
//         headers: {
//             "User-Agent": "Mozilla/5.0",
//             "Content-Type": "application/x-www-form-urlencoded",
//         },
//         body: params1.toString(),
//         // redirect: "follow",
//         // redirect: "manual",
//     })


//     console.log(resp2.status)

//     if (resp2.status !== 200) {
//         console.error(`Unexpected status code: ${resp2.status}`);
//         return [];
//     }

//     let contRespText;
//     try {
//         contRespText = await resp2.text();
//         // console.log(contRespText)
//     } catch (err) {
//         console.error("Failed to read response text:", err);
//         return [];
//     }

//     let contRespObj;
//     try {
//         contRespObj = JSON.parse(contRespText || "{}");
//     } catch (err) {
//         console.error("Failed to parse JSON:", err);
//         return [];
//     }

//     if (!contRespObj || contRespObj.success !== true || !Array.isArray(contRespObj.data) || !Array.isArray(contRespObj.cols)) {
//         console.warn("Response is not successful or missing data/cols");
//         return [];
//     }

//     // заголовки
//     const colsNames = contRespObj.cols.map(c => c.name)

//     const results = []

//     // дані
//     for (let row of (contRespObj.data || [])) {
//         const obj = {};
        
//         colsNames.forEach((colName, idx) => {
//             obj[colName] = idx < row.length ? row[idx] : null;
//         });

//         if (
//             !obj.PO_TERMINAL_ID ||
//             !obj.PO_TERMINAL_NAME ||
//             obj.PO_TERMINAL_NAME.includes("not found")
//         ) continue
        
//         results.push(obj)
//     }

//     console.log(results)

// }

// test()