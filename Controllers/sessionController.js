// Handles both user and admin sessions routines
const session = require('express-session')
const MongoStore = require('connect-mongo')     //  express-session will use mongo vs MemoryStore for datause, prevent memory leaks


// Models
const { SessUsers } = require("../Models/sessionModel")


// *** 💡 Check qty of certain user sessions and deletes all previouse

async function allowOnlyOneActiveSession(sessCollection, id) {
    // шукаємо всі сесії, де у рядку session зустрічається "userId":"<id>"
    const prevSessions = await sessCollection.find({
        session: { $regex: `"_id":"${ id }"` }
    }).select("_id").lean()

    if (prevSessions.length) {
        console.warn(`💡 Cutting off extra sessions: ${ prevSessions.length } found`)
        await sessCollection.deleteMany({
            _id: { $in: prevSessions.map(s => s._id) }
        })
    }
}



async function allowOnlyOne_USER_ActiveSession (id) {
    await allowOnlyOneActiveSession(SessUsers, id)
}


/*
    🔍 Як працюють разом
    resave	rolling	Поведінка
    false	false	Сесія зберігається лише якщо змінена. Cookie не оновлюється.
    false	true	Cookie оновлюється на кожен запит. Сесія зберігається лише якщо змінена. ✅ Часте комбо.
    true	false	Сесія завжди зберігається, але cookie не оновлюється. Не рекомендовано.
    true	true	Сесія завжди зберігається і cookie завжди оновлюється. ❗ Найбільш затратний варіант.
*/


const userSession = () => {
    return session ({
        store: MongoStore.create({ mongoUrl: process.env.MONGO_URI_DATA }),    // USER session
        secret: process.env.SESSION_SECRET,
        name: process.env.SESSION_NAME,
        saveUninitialized: false,

        resave: false,
        rolling: true,
        
        cookie: {
            maxAge: Number(process.env.SESSION_LIFETIME) || (1000 * 60 * 60),      //  тривалість сесії по замовчуванню 1 година, якщо інше не вказано у параметрах
            secure: process.env.NODE_ENV === "production",
            sameSite: true,
        }
    })
}


module.exports = {
    allowOnlyOne_USER_ActiveSession,
    userSession,
}