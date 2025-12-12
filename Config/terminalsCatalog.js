// terminalsCatalog.js
// Перелік терміналів, з якими "вміє" працювати додаток

const https = require("https")
const httpsAgent = new https.Agent({
    rejectUnauthorized: false       // виключно для TOS, ⚠️ це вимикає TLS-перевірку, в TOS сертифікат не має підпису
})

// додає дані сесії в fetch
const { CookieJar } = require("tough-cookie")

// ✅ v2 нативний fetch через node-fetch, новіші версії дають помилку з fetchCookie та CookieJar
const nodeFetch = require("node-fetch")
const fetchCookie = require("fetch-cookie").default

const { fetchSmart } = require("../Utils/fetchSmart")


//  *** ВАЖЛИВО - метод bulkAvailabilityCheck визначає як працювати з терміналом не на основі його ключа,
// а на основі ГРУПИ; тобто використовуючи групи можна застосовувати однакові механізми аутентифікації,
// пошуку контейнерів і т.д. для всієї групи


const TERMINALS = {

    // група терміналів Seattle, платформа TIDEWORKS
    
    "t5": {
        key: "t5",
        group: "Seattle",
        label: "Terminal 5",
        url: "https://t5s.tideworks.com/fc-T5S/",
        env_login: "TIDEWORKS_LOGIN",
        env_passowrd: "TIDEWORKS_PASSWORD",
        cookieFile: "Cookies/cookies.t5.json",
        jar: new CookieJar()
    },
    "t18": {
        key: "t18",
        group: "Seattle",
        label: "Terminal 18",
        url: "https://t18.tideworks.com/fc-T18/",
        env_login: "TIDEWORKS_LOGIN",
        env_passowrd: "TIDEWORKS_PASSWORD",
        cookieFile: "Cookies/cookies.t18.json",
        jar: new CookieJar()
    },

    // WUT - WASHINGTON UNITED TERMINAL MARINE

    "wut": {
        key: "wut",
        group: "USWUT",
        label: "Washington United Terminals",
        url: "http://tns.uswut.com/",
        env_login: "WUT_LOGIN",
        env_passowrd: "WUT_PASSWORD",
        cookieFile: "Cookies/cookies.uswut.json",
        jar: new CookieJar()
    },
    
    // TOS: HUSKY TERMINAL

    "husky": {
        key: "husky",
        group: "TOS",
        label: "TOS: Husky Terminal",
        url: "https://tosportal.portsamerica.com/",
        env_login: "TOS_LOGIN",
        env_passowrd: "TOS_PASSWORD",
        cookieFile: "Cookies/cookies.tos.json",
        agent: httpsAgent,  //  опція для "битих сертифікатів"
        redirect: "follow",     //  опція виключно для TOS
        jar: new CookieJar()
    },

    // PCT - EVERPORT: Los Angeles, Oakland, Tacoma

    "pct": {
        key: "pct",
        group: "PCT",
        label: "PCT: Everport",
        url: "https://www.etslink.com/",
        env_login: "PCT_LOGIN",
        env_passowrd: "PCT_PASSWORD",
        cookieFile: "Cookies/cookies.pct.json",
        agent: httpsAgent,  //  опція для "битих сертифікатів"
        jar: new CookieJar(),
        _sk: null,  // специфічне поле для PCT - це номер сесії, який повертається після успішного логіну і ним порібно підписувати (+кука) кожен запит в рамках цієї сесії
    },
}


const TERMINALS_ENUM = Object.keys(TERMINALS)



// 🟢 Init: кожен термінал працює зі своєю сесією.
// Додавати їх потрібно тут, не при оголошенні TERMINALS

for (const t of Object.values(TERMINALS)) {
    // для кожного терміналу створюю власну fetch-функцію, яка використовує його сесію (cookie)
    const fetchFunc = fetchCookie(nodeFetch, t.jar)

    // 🟣 Інтеграція: підсилюю fetch-функцію кожного терміналу можливостями fetchSmart (див. Utils/fetchSmart.js)
    // * стандартно "чекатиме" 8с і розриватиме з*єднання
    // * робитиме 3 спроби з*днатися з подовженим часом очікування кожна (пауза між)
    
    const { agent } = t

    t.fetchWithMyJar = (url, options = {}, cfg = {}) => {
        if (agent) options.agent = agent
        return fetchSmart(url, options, { fetchFunc, ...cfg })
    }

    // Варіанти використання:
    // * await t.fetchWithMyJar(url, opts, { retries: 5 })
    // * await t.fetchWithMyJar(url, opts, { timeout: 12000 })
}


// Утиліта: повертає path, використовуючи terminal.url
const getURL = (terminal, path = "") => {
    const base = (terminal?.url || "").trim().replace(/\/+$/, "")  // прибираємо лише слеші в кінці
    const tail = path.trim().replace(/^\/+/, "")                   // прибираємо слеші на початку

    return tail
        ? `${ base }/${ tail }`
        : base
}


module.exports = {
    TERMINALS,
    TERMINALS_ENUM,
    TERMINALS_LABELS: Object.fromEntries(
        TERMINALS_ENUM.map(t => [t, TERMINALS[t]?.label] || "NA")
    ),

    // утиліти
    getURL,
}