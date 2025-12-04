// Захист від ботів


// throttling (rate limiting) на окремі раути
const rateLimit = require('express-rate-limit')



// --- Налаштування rate limiter ---
exports.limiter = rateLimit({
    windowMs: 60 * 1000,    // 60 сек
    max: 25,    // з одного IP можна зробити максимум N запитів за час "windowMs", N+1 i HTTP 429
    
    standardHeaders: true,
    legacyHeaders: false,
    
    // Пропускаємо експортні запити, їх може бути значна кількість за 1 хв
    skip: (req) => req.path.startsWith("/admin/export"),

    // Якщо ліміт спрацьовує — блокуємо без логування
    handler: (req, res) => res.status(429).send("Too many requests")
})




// --- Список "червоних" шляхів і user-agent патернів ---

const botPathPatterns = [
    /^\/wp-?admin/i,
    /^\/wp-?includes/i,
    /wlwmanifest\.xml$/i,
    /xmlrpc\.php$/i,
    /^\/\.git/i,
    /^\/phpmyadmin/i,
]

const botUAparts = [
    /bot/i,
    /crawl/i,
    /spider/i,
    /nikto/i,
    /scanner/i,
    /checker/i,
    /curl/i,
    /wget/i,
    /wordpress/i, // часто сканери для WP
    /semrush/i,
    /ahrefs/i,
    /majestic/i,
    /python-requests/i,
    /^$/ // пустий UA
]


// allowlist для "хороших ботів"
const allowlistUA = [
    /googlebot/i,
    /google-InspectionTool/i,
    /adsbot-google/i,
    /apis-google/i,
    /google-site-verification/i,
    /bingbot/i,
    /duckduckbot/i,
    /yandexbot/i,
    /facebookexternalhit/i, // соцмережеві прелюки
    /linkedinbot/i,
    /slackbot/i,
    /telegrambot/i,
    /whatsapp/i,
    /twitterbot/i,
]


const suspiciousIP = [
    // матчує всі IP від 34.192.x.x до 34.255.x.x - Amazon Technologies Inc. (AT-88-Z)
    /^34\.(?:19[2-9]|2[0-4]\d|25[0-5])\./,
    
    /^43\.130\./,   // діапазон 43.130.*
    /^43\.157\./,
    /^111\.113\./,
    /^162\.55\./,   // Hetzner Online GmbH
]



// --- Middleware детектор ---

exports.botDetector = (req, res, next) => {
    const path = req.path || ""
    const ua = String(req.get("user-agent") || "")
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || "").split(",")[0].trim()

    // 1) Пропускаємо системні запити /.well-known/
    if (path.startsWith("/.well-known/")) return res.sendStatus(204)

    // 2) Якщо UA у білому списку (Googlebot, Bingbot, etc.) — пропускаємо відразу
    for (const re of allowlistUA) {
        if (re.test(ua)) return next()
    }

    // 3) Перевірка по IP після allowlist — блокуємо відомі діапазони ботів/датацентрів
    if (suspiciousIP.some(re => re.test(ip))) return res.sendStatus(403)

    // 4) Чисті блоки по шляху
    for (const p of botPathPatterns) {
        if (p.test(path)) return res.sendStatus(403)
    }

    // 5) Пустий або підозрілий UA
    if (!ua || /^-$/i.test(ua)) return res.sendStatus(403)

    // 6) UA match → блокувати
    for (const re of botUAparts) {
        if (re.test(ua)) return res.sendStatus(403)
    }

    // 7) Heuristic: підозрілі заголовки
    const accept = req.get("accept") || ""
    const referer = req.get("referer") || ""
    if (referer === "" && accept.includes("image/*")) return res.sendStatus(403)

    next()
}