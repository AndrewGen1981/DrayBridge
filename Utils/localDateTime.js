const { timeZone = "America/Los_Angeles" } = require("../Config/__config.json")


const { formatInTimeZone, fromZonedTime } = require("date-fns-tz")
const { isValid, formatDistance, parseISO } = require("date-fns")


function isValidDate(value, tz = timeZone) {
    if (!value) return false

    if (typeof value === "string") {
        // Якщо формат схожий на "2025-07-24T10:35"
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
            // Доповнюємо до повного ISO + перетворюємо як локальний час
            // 🟢 fromZonedTime сприймає передану дату як локальний час у вказаній зоні, і повертає еквівалент у UTC
            const date = fromZonedTime(`${ value }:00`, tz)
            return isValid(date) ? date : false
        }

        // Якщо це повний ISO — використовуємо стандартний парсинг
        const date = parseISO(value)
        return isValid(date) ? date : false
    }

    // Якщо вже Date
    const date = value instanceof Date ? value : new Date(value)
    return isValid(date) ? date : false
}


// Повертає дата-атрибут для формату "html-deadline" функції localDateTime
function getDeadlineStatus(date) {
    const now = new Date()
    const today = new Date(now.setHours(0, 0, 0, 0))
    const target = new Date(date.setHours(0, 0, 0, 0))

    const diff = target - today

    if (diff < 0) return "overdue"
    if (diff === 0) return "today"
    if (diff === 86400000) return "tomorrow"
    return null // не позначаємо нічим
}


/**
 * Локалізує дату/час у потрібному форматі
 * @param {string|Date} value - дата або рядок ISO
 * @param {"ISO"|"html"|true|false} isTime - формат часу
 * @param {string} [separator=", "] - роздільник між датою та часом
 * @returns {string|undefined} - відформатований рядок або undefined
 */
function localDateTime(value, isTime, separator = ", ") {
    const date = isValidDate(value)
    if (!date) return

    const isDeadline = isTime === "html-deadline" || isTime === "⏰"
    
    if (isTime === "html" || isDeadline || isTime === "ISO") {
        const iso = formatInTimeZone(date, timeZone, "yyyy-MM-dd'T'HH:mm")
        const day = iso.slice(0, 10)   // yyyy-MM-dd
        const time = iso.slice(11, 16) // HH:mm

        const deadlineStatus = isDeadline ? getDeadlineStatus(new Date(date)) : null
        const deadlineAttr = deadlineStatus ? ` data-deadline="${ deadlineStatus }"` : ""

        return isTime === "ISO"
        ? `${ day }T${ time }`
        : `<time datetime="${ day }"${ deadlineAttr }>${ day }</time>${ separator }<time class="diminished" datetime="${ time }">${ time }</time>`
    }

    // Формати "з часом" або без
    const  formatStr = isTime ? `yyyy-MM-dd'${ separator }'HH:mm` : "yyyy-MM-dd"

    // Форматуємо з timeZone
    return formatInTimeZone(date, timeZone, formatStr)
}



// ✅ Форматує дату date, але так, ніби вона відбувається у вказаній часовій зоні (timeZone)
function _formatInTimeZone (date, format = "yyyy-MM-dd HH:mm", tz = timeZone) {
    return formatInTimeZone(date, tz, format)
}


// Нормалізує дати, коли потрібно повернути значення періоду
const normalizeDatesRange = ({ start_date, end_date }, options) => {

    const { maxAllowedDaysPeriod } = options || {}
    const DAY_MS = 864e5

    const baseStart = new Date(Date.now() - 14 * DAY_MS)  // 14 днів тому
    const baseEnd = new Date(Date.now() - 3e5)  // 5 хвилин тому

    const parsedStart = new Date(start_date)
    const parsedEnd = new Date(`${ end_date }T23:59:59Z`)

    const dStart = isValidDate(parsedStart) ? parsedStart : baseStart
    const dEnd = isValidDate(parsedEnd) ? parsedEnd : baseEnd

    // Завжди startDate <= endDate, але не пізніше baseEnd
    const [ startDateRaw, endDateRaw ] = dStart <= dEnd ? [ dStart, dEnd ] : [ dEnd, dStart ]
    const endDate = endDateRaw > baseEnd ? baseEnd : endDateRaw

    let startDate = startDateRaw
    if (maxAllowedDaysPeriod !== undefined) {
        const maxStart = new Date(endDate.getTime() - maxAllowedDaysPeriod * DAY_MS)
        if (startDateRaw < maxStart) startDate = maxStart
    }

    return { startDate, endDate }
}


module.exports = {
    isValidDate,

    localDateTime,
    formatDistance,
    
    _formatInTimeZone,
    normalizeDatesRange
}



/*

Пояснення: для формату html є 2 підходи/варіанти реалізації

а)  const date = new Date(value)
    const format_date = formatDateFns(date, 'yyyy-MM-dd')       //  const { formatDateFns } = require("date-fns")
    const format_time = formatDateFns(date, 'HH:mm')
    return `<time datetime="${ format_date }">${ format_date }</time>${separator}<time class="diminished" datetime="${ format_time }">${ format_time }</time>`

б)  const date = new Date(value).toISOString()
    const day = date.toISOString().slice(0, 10)   // yyyy-MM-dd
    const time = date.toISOString().slice(11, 16) // HH:mm
    return `<time datetime="${day}">${day}</time>${separator}<time class="diminished" datetime="${time}">${time}</time>`


| Порівняння          | `formatDateFns`        | `toISOString().slice(...)`       |
| ------------------- | ---------------------  | ------------------------------   |
| Швидкість           | ❌ повільніше          | ✅ набагато швидше (\~3–4x)     |
| Гнучкість           | ✅ формат, локаль, tz  | ❌ строго ISO                   |
| Сумісність          | ✅ з будь-якими датами | ⚠️ лише з валідними ISO-датами  |
| Безпека від помилок | ✅ вбудовані перевірки | ❌ треба перевіряти вручну      |


тобто, варіант "б" - найшвидший, але стандартний шаблон виводу

*/