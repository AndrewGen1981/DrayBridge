const mongoose = require('mongoose')


const { TERMINALS_ENUM } = require("../Config/terminalsCatalog.js")


// ***  Схема для контейнера


const containerSchema = new mongoose.Schema({

    // 1️⃣ Container (основна ідентифікація та статус)
    // стандартна інформація про контейнер, приналежність і т.д.

    number: {
        type: String,       //  WUT "cntrNo"
        require: true,
        unique: true,
        index: true
    },

    terminal: {
        type: String,
        enum: TERMINALS_ENUM,
        lowercase: true,
    },

    subTerminal: String,    // деколи ресурс дає доступ до декількох терміналів, наприклад PCT дає доступ до : Los Angeles, Oakland, Tacoma

    // уніфіковані поля для відображення доступності контейнера
    status: String,     // WUT "avlbFlg"
    statusDesc: String,     // WUT "avlbDesc", Seattle "OSRA. Container Available"

    // характеристики, тип та розмір контейнера
    containerTypeSize: String,      // WUT "tmlPrivCntrTpszCdNm"
    containerTypeSizeLabel: String,     //  Seattle only

    lastFreeDate: String,   // WUT "lstFreeDt", Seattle "OSRA. Line Last Free Day"
    appointmentDate: String,    // WUT "exstApntDt", Seattle "satisfiedThru"

    // 2️⃣ Customs
    // митниці можуть накладати холди на контейнер/товар, холди найвищого пріоритету

    // Customs hold & hold status
    customStatus: String,   // WUT "cusmHold"
    customTimestamp: String,    //  Seattle only

    // 3️⃣ Customer/Carrier/Line
    // власник або його агент може також накласти холд, холди середнього пріоритету

    SSCO: String,   // WUT "oprCd", Seattle "line" — оператор, який контролює контейнер
    customerStatus: String,     // WUT "custHold", Seattle "lineReleaseTimestamp"
    customerHoldReason: String,     // WUT "custHldRsn"
    lineReleaseStatus: String,  // Seattle only
    lineFirstFree: String,  // Seattle only - OSRA. Line First Free Day


    // 4️⃣ Terminal
    // термінали можуть накладати холди за demurrage, damage, OOG (“Out of Gauge”), простій
    
    dwellAmount: String,    // WUT "dwllAmt", Seattle "totalFees"
    damageFeeOutstanding: String,   // WUT "dmgDueFlg", flag неоплачених зборів терміналу
    terminalHold: String,   // WUT "tmnlHold" холд терміналу, Seattle "holds"
    terminalHoldReason: String,     // WUT "tmnlHoldRsn"

    portFirstFreeDay: String,   // OSRA
    portLastFreeDay: String,    // OSRA

    origin: String,

}, {
    timestamps: true,
    collection: "_CONTAINERS"
})



containerSchema.index({ terminal: 1 })
containerSchema.index({ status: 1 })
containerSchema.index({ updatedAt: -1 })


module.exports = { 
    Container: mongoose.model("containerModel", containerSchema),
}