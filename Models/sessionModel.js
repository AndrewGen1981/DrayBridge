const mongoose = require("mongoose")


// @ General model for session
const sessionSchema = new mongoose.Schema({
    _id: String,    // should be here, otherwise not reads "_id" when .find()
    expires: { type: Date, required: true },
    session: String,
}, {
    timestamps: true,
    collection: "sessions"
})


module.exports = {
    SessUsers: mongoose.model("sessionSchema", sessionSchema)
}