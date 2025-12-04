// --- Socket.io конструктор
const { Server: IOServer } = require("socket.io")


// --- Моделі, за якими спостерігаю
const { SessUsers } = require("../Models/sessionModel")


// --- Глобальні об’єкти
let io = null


// Щоб не зареєструвати декілька вочерів, потрібно перевіряти чи вже такий існує
const watchersMap = {}
function registerNewWatcher(watcher, watcher_name) {
    if (watchersMap[watcher_name]) watchersMap[watcher_name].close()
    watchersMap[watcher_name] = watcher()
}



function startSocketIOWatcher(server, options = {}) {
    if (io) return console.warn("⚠️ SocketIO already initialized")
    if (!server) return console.warn("⚠️ SocketIO not started: no server instance")
        
    try {
        io = new IOServer(server, options)
            // .on("connection", socket => {
            //     console.log(`🟢 Socket connected: ${ socket.id }`)
            //     socket.on("disconnect", reason => {
            //         console.log(`🔴 Socket disconnected: ${ socket.id } (${ reason })`)
            //     })
            // })

        registerNewWatcher(watchForDestroyedSessions, "session-destroy")
        // --- тут можна додати інші вочери, або можна створити новий екземпляр io
        
    } catch (error) {
        console.error(`Fail to start SocketIO-Watcher: ${ error }`)
    }
}



function watchForDestroyedSessions() {
    if (!io) return

    //  --- Варіант .watch() без параметрів працює довше, якщо фільтрувати одразу події, то швидше
    // SessUsers.watch().on("change", data => {
    //     const { operationType, documentKey = {} } = data || {}
    //     const { _id } = documentKey

    //     if (operationType === "delete") {
    //         io.emit("session-destroyed", _id)
    //         console.log(`🟠 WATCH Session deleted: ${ _id }`)
    //     }
    // })


    // --- Session expiration watcher (ловить саме знищення)
    return SessUsers.watch([{ $match: { operationType: "delete" } }])
        .on("change", data => {
            const { _id } = data?.documentKey || {}
            if (!_id) return

            io.emit("session-destroyed", _id)
            // console.log(`🟠 WATCH Session deleted: ${ _id }`)
        })
        .on("error", err => {
            console.error("❌ Session watcher error:", err.message)
        })
}


module.exports = {
    io,
    startSocketIOWatcher,
}