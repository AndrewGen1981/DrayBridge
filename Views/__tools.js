import { fetchWithHandler } from "/__errorHandler.js"


export const { defaultMoneySign, MAX_FILES_ALLOWED_TO_UPLOAD, MAX_BYTES_PER_FILE } = await fetchWithHandler({ action: "/__config.json" }) || {}


// Катаоги для скриптів шаблонів
export const categoriesCatalog = await fetchWithHandler({ action: "/categoriesCatalog.json" }) || {}
export const truckCatalog = await fetchWithHandler({ action: "/truckCatalog.json" }) || {}
export const qualityCatalog = await fetchWithHandler({ action: "/qualityCatalog.json" }) || {}
export const sideCatalog = await fetchWithHandler({ action: "/sideCatalog.json" }) || {}




export function splitOnUpperCase(str = "") {
    return str
        .replace(/([a-z])([A-Z]+)/g, (_, lower, upper) => `${lower} ${upper}`)
        .replace(/([A-Z]+)([A-Z][a-z])/g, (_, caps, next) => `${caps} ${next}`)
}


export const smartCapitalize = (str = '') =>
    String(str)
        .toLowerCase()
        .replace(/(?:^|[\s\-'])\p{L}/gu, (match) => match.toUpperCase())



export const capitalizeEachWord = (input) => {
    if (!input) return input

    if (Array.isArray(input)) return input.map(smartCapitalize)

    return input
        .trim()
        .split(/\s+/)
        .map(smartCapitalize)
        .join(' ')
}


export function splitAndCapitalize(str = "") {
    return smartCapitalize(splitOnUpperCase(str))
}


export const localeNumber = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})


export function money(value) {
    return `${ defaultMoneySign }${ localeNumber.format(value) }`
}


/**
 * Перетворює масив { name, value } у плоский об'єкт для тіла запиту
 * @param {Array<{ name: string, value: any }>} modified
 * @returns {Record<string, any>} 
 */
export function modifiedToBody(modified = []) {
    if (!Array.isArray(modified)) return {}

    return modified.reduce((acc, item) => {
        if (!item || typeof item.name !== 'string') return acc

        const { name, value } = item

        if (Object.hasOwn(acc, name)) {
            acc[name] = Array.isArray(acc[name])
                ? [...acc[name], value]
                : [acc[name], value]
        } else {
            acc[name] = value
        }

        return acc
    }, Object.create(null))
}



// Множина чи однина? для текстового виводу
export function plural(item) {
    const number = Array.isArray(item) ? item.length : item
    return number > 1 ? "s" : ""
}


// Утиліта для compareStrings. Пояснення:
// toLowerCase() — знімає регістр,
// \s+ — прибирає всі пробіли,
// [^\w] — прибирає знаки пунктуації (типу . або ,), залишаючи лише букви, цифри та _.
const normalize = str => str?.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '')


// Порівняння 2 строки по заданому %% схожості
export function compareStrings(a, b, ratio = 1) {
    const a_normalized = normalize(a)
    const b_normalized = normalize(b)

    const similarityRatio = similarity(a_normalized, b_normalized)
    // console.log(similarityRatio)

    return similarityRatio >= ratio
}


// Порівняння 2 строк, повертає %% схожості !!!
export function similarity(a, b) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const longerLength = longer.length;

    if (longerLength === 0) return 1.0;
    const editDistance = levenshtein(longer, shorter);  //  відстань Левенштейна
    return (longerLength - editDistance) / longerLength;
}


// Функція levenshtein(a, b) обчислює так звану відстань Левенштейна між двома рядками — це мінімальна кількість
// операцій (вставок, видалень або замін символів), які потрібно виконати, щоб перетворити один рядок у другий.
function levenshtein(a, b) {
    const m = a.length, n = b.length;

    // Створюємо двовимірну матрицю розміром (m+1)x(n+1), заповнену нулями
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    // Заповнюємо перший рядок і перший стовпець: 
    // скільки операцій треба, щоб перетворити на порожній рядок
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    // Проходимо по решті матриці
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
            // Якщо символи збігаються, нічого не змінюємо
            dp[i][j] = dp[i - 1][j - 1];
        } else {
            // Інакше — вибираємо мінімум з:
            // 1. видалення
            // 2. вставки
            // 3. заміни
            dp[i][j] = Math.min(
            dp[i - 1][j] + 1,     // видалення
            dp[i][j - 1] + 1,     // вставка
            dp[i - 1][j - 1] + 1  // заміна
            );
        }
        }
    }

    // Результат — останній елемент у правому нижньому куті
    return dp[m][n];
}