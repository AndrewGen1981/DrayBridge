// Перелік терміналів, з якими "вміє" працювати додаток

//  *** важливо - метод bulkAvailabilityCheck визначає як працювати з терміналом не на основі його ключа, а на основі ГРУПИ;
// тобто використовуючи групи можна застосовувати однакові механізми аутентифікації, пошуку контейнерів і т.д.


const TERMINALS = {

    // група терміналів Seattle, платформа TIDEWORKS
    
    "t5": {
        key: "t5",
        group: "Seattle",
        label: "Terminal 5",
        url: "https://t5s.tideworks.com/fc-T5S/",
        env_login: "TIDEWORKS_LOGIN",
        env_passowrd: "TIDEWORKS_PASSWORD",
    },
    "t18": {
        key: "t18",
        group: "Seattle",
        label: "Terminal 18",
        url: "https://t18.tideworks.com/fc-T18/",
        env_login: "TIDEWORKS_LOGIN",
        env_passowrd: "TIDEWORKS_PASSWORD",
    },

    // WUT - WASHINGTON UNITED TERMINAL MARINE

    // HUSKY TERMINAL & STEVEDORING
}


const TERMINALS_ENUM = Object.keys(TERMINALS)


module.exports = {
    TERMINALS,
    TERMINALS_ENUM,
    TERMINALS_LABELS: Object.fromEntries(TERMINALS_ENUM.map(t => [t, TERMINALS[t]?.label] || "NA")),
}