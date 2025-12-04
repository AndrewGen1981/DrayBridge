const { LogModel } = require("../Models/_consoleInterceptor")
const { SessUsers } = require("../Models/sessionModel")


const roleWeight = { SUPER: 3, ADMIN: 2, USER: 1 }


exports.viewLogs = async (req, res, next) => {
    try {

        const logs = await LogModel.find()
        .sort({ createdAt: -1 })
        .lean()

        // читаю всі персоніфіковані сесії. Можуть бути без "_id", не враховую
        const sessions = (await SessUsers.find({ session: /"_id"/ }).lean())
        .map(({ session, ...rest }) => {
            const parsed = JSON.parse(session)
            const {
                // "чутливі поля" деструктуризую, але не використовую
                session: _ignoredSession,
                cookie: _ignoredCookie,
                // решта деструктуризую через ... оператор і лише їх використовую
                ...usefulData
            } = parsed

            return { ...rest, ...usefulData }
        })
        // сортування - спочатку супери, адміни, потім юрези, якщо ролі однакові
        // (різниця = 0), то сортую по даті від нових до старих
        .sort((a, b) =>
            (roleWeight[b.role] - roleWeight[a.role]) ||
            (b.expires - a.expires)
        )

        res.render("../Views/logs/logs_show.ejs", { logs, sessions })

    } catch (error) {
        next(error)
    }
}