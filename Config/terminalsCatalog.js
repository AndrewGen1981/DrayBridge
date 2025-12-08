// terminalsCatalog.js
// Перелік терміналів, з якими "вміє" працювати додаток

// додає дані сесії в fetch
const { CookieJar } = require("tough-cookie")

// ✅ v2 нативний fetch через node-fetch, новіші версії дають помилку з fetchCookie та CookieJar
const nodeFetch = require("node-fetch")
const fetchCookie = require("fetch-cookie").default


//  *** важливо - метод bulkAvailabilityCheck визначає як працювати з терміналом не на основі його ключа,
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

    // HUSKY TERMINAL & STEVEDORING
}


const TERMINALS_ENUM = Object.keys(TERMINALS)


// Кожен термінал працює зі своєю сесією. Додавати їх потрібно тут, не при оголошенні TERMINALS
for (const t of Object.values(TERMINALS)) {
    t.fetchWithMyJar = fetchCookie(nodeFetch, t.jar)
}


module.exports = {
    TERMINALS,
    TERMINALS_ENUM,
    TERMINALS_LABELS: Object.fromEntries(TERMINALS_ENUM.map(t => [t, TERMINALS[t]?.label] || "NA")),
}