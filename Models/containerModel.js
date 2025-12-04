const mongoose = require('mongoose')



// ***  Схема для контейнера


const containerSchema = new mongoose.Schema({
    number: {
        type: String,
        require: true,
        unique: true,
        index: true
    },

    description: String,
}, {
    timestamps: true,
    collection: "_CONTAINERS"
})



module.exports = { 
    Container: mongoose.model("containerModel", containerSchema),
}