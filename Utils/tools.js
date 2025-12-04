const { defaultCurrency = "USD", } = require("../Config/__config.json")
// const { isValidDate } = require("./localDateTime")


const currencyToLocale = {
    "USD": "en-US",     // United States
    "CAD": "en-CA",     // Canada
    "MXN": "es-MX",     // Mexico
    "BRL": "pt-BR",     // Brazil

    "GBP": "en-GB",     // United Kingdom
    "EUR": "de-DE",     // Germany
    "FRF": "fr-FR",     // France (старий FRF, рідко використовується)
    "ITL": "it-IT",     // Italy (старий ITL, рідко використовується)
    "EUR_FR": "fr-FR",  // France
    "EUR_IT": "it-IT",  // Italy
    "EUR_ES": "es-ES",  // Spain
    "EUR_NL": "nl-NL",  // Netherlands
    "EUR_SE": "sv-SE",  // Sweden
    "EUR_PL": "pl-PL",  // Poland

    "JPY": "ja-JP",     // Japan
    "CNY": "zh-CN",     // China (якщо буде використано)
    "INR": "hi-IN",     // India
    "AUD": "en-AU",     // Australia
    "SGD": "en-SG"      // Singapore (менш популярний, але є в API)
}


function getCurrencyLocale({ value, Amount, currency: _currency, CurrencyCode}) {
    const currency = _currency || CurrencyCode || defaultCurrency
    const locale = currencyToLocale[currency]
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value || Amount || 0)
}

function money(value, currency = defaultCurrency) {
    return getCurrencyLocale({ value: Number(value || 0), currency })
}

function valueWithUnit({ value, unit, Amount, CurrencyCode, CurrencyAmount, separator = " " }, options) {
    const { toNumber, isShowEmpty } = options || {}

    let v = value || Amount || CurrencyAmount || ( isShowEmpty ? toNumber ? 0 : "-" : "")
    if (toNumber) v = localeNumber.format(v)

    const u = unit || CurrencyCode || ""

    return u ? `${ v }${ separator }${ u }` : v
}

function splitOnUpperCase(str = "") {
    return str
        .replace(/([a-z])([A-Z]+)/g, (_, lower, upper) => `${lower} ${upper}`)
        .replace(/([A-Z]+)([A-Z][a-z])/g, (_, caps, next) => `${caps} ${next}`)
}


/*
    smartCapitalize("o'connor");        // "O'Connor"
    smartCapitalize("mcDonald");        // "McDonald"
*/
const smartCapitalize = (str = '') =>
    String(str)
        .toLowerCase()
        .replace(/(?:^|[\s\-'])\p{L}/gu, (match) => match.toUpperCase())



const capitalizeEachWord = (input) => {
    if (!input) return input

    if (Array.isArray(input)) return input.map(smartCapitalize)

    return input
        .trim()
        .split(/\s+/)
        .map(smartCapitalize)
        .join(' ')
}


const localeNumber = new Intl.NumberFormat(
    currencyToLocale[defaultCurrency], {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }
)


// Щоб привести булеві поля, які можуть бути або типу boolean (true/false),
// або рядками "true"/"false", до строго булевого формату (true або false)
function toStrictBoolean(value) {
    return value === true || value === "true"
}


// Перетворює об*єкт ShippingAddress = { StateOrRegion: "CA", PostalCode: "", City: "Los Angeles", CountryCode: "US" }
// так як він представлений в ордерах на строку "CA, Los Angeles, US"
// прибирає навіть " " або "\n" як і "порожні значення"
function stringifyObjectValues(obj = {}, separator = ", ") {
    return Object.values(obj)
    .filter(v => v != null && v !== "null" && v !== "undefined")
    .map(v => String(v).trim())
    .filter(Boolean)
    .join(separator)
}


// ✅ Безпечно ділить a на b, повертає округлене або "—"
function getDivisionRatio(a, b, appr = 1) {
  const numA = Number(a)
  const numB = Number(b)

  if (!isFinite(numA) || !isFinite(numB) || numB === 0) return "—"

  return (numA / numB).toFixed(appr)
}



const valType = (v) => `data-type="${ v > 0 ? 'positive' : v < 0 ? 'negative' : 'zero' }"`




// ***  Для роботи з логами

// Для відображення логів в адмін панелі
const adminLogIcons = {
    info: {
        icon: "ℹ️", color: "#a0c4ff", // pastel blue
        desc: "General information or neutral message"        
    },
    success: {
        icon: "✅", color: "#caffbf", // pastel green
        desc: "Operation completed successfully"        
    },
    warning: {
        icon: "⚠️", color: "#ffd6a5", // pastel yellow-orange
        desc: "Something might go wrong or needs attention"        
    },
    error: {
        icon: "❌", color: "#ffadad", // pastel red
        desc: "An error occurred, but the app can continue"        
    },
    fatal: {
        icon: "💥", color: "#ffafcc", // pastel pink
        desc: "Critical failure, the application may crash"        
    },
    debug: {
        icon: "🐞", color: "#d0f4de", // pastel mint
        desc: "Developer-level debug output"        
    },
    trace: {
        icon: "🔍", color: "#bdb2ff", // pastel violet
        desc: "Step-by-step code execution details"        
    },
    notice: {
        icon: "📢", color: "#fdffb6", // pastel lemon
        desc: "System-wide announcement or attention message"        
    },
    audit: {
        icon: "🧾", color: "#e0fbfc", // pastel light cyan
        desc: "Log of changes or important tracked events"        
    },
    verbose: {
        icon: "📄", color: "#f1f0ff", // pastel grey-blue
        desc: "Very detailed internal logging"        
    },
    idk: {
        icon: "❓", color: "coral", // pastel grey-blue
        desc: "Unknown level" 
    }
}


function getAdminLogInfo(level = "idk") {
    return adminLogIcons[level] || adminLogIcons.idk
}



module.exports = {
    money, valType,
    getCurrencyLocale,
    valueWithUnit,
    splitOnUpperCase,

    smartCapitalize,
    capitalizeEachWord,

    localeNumber,
    toStrictBoolean,

    stringifyObjectValues,
    getDivisionRatio,

    getAdminLogInfo,    
}