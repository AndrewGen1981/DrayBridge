const { gzipSync, gunzipSync } = require("zlib")

// ❗ Якщо в Mongo поле має тип Buffer, то розмір приблизно на 25% менший, ніж якщо String


// 😊 Коментарі написані у форматі JSDoc:
// * підказки в VS Code;
// * типізація без TypeScript;
// * можна згенерувати HTML-документацію на основі таких коментарів (через JSDoc CLI


/**
 * Стиснення даних
 * @param {any} input — Дані для стиснення (об'єкт, рядок тощо)
 * @param {"buffer" | "base64"} outputType — Тип поля зберігання в базі
 * @returns {Buffer | string}
 */

function gZIPBuffer(input, outputType = "buffer") {
    let prepared

    if (Buffer.isBuffer(input)) {
        prepared = input
    } else if (typeof input === "object") {
        prepared = Buffer.from(JSON.stringify(input), "utf-8")
    } else if (typeof input === "string") {
        prepared = Buffer.from(input, "utf-8")
    } else {
        throw new TypeError("Unsupported data type for gZIPBuffer()")
    }

    const compressed = gzipSync(prepared)

    return outputType === "base64"
        ? compressed.toString("base64")
        : compressed
}


/**
 * Розпакування даних
 * @param {Buffer | string} input — Те, що зберігається в базі
 * @param {boolean} parseJson — Чи потрібно одразу парсити результат
 * @returns {string | object}
 */

function gunZIPBuffer(input, parseJson = false) {
    let buffer;

    if (!input) {
        throw new TypeError("gunZIPBuffer() received empty input");
    }

    if (Buffer.isBuffer(input)) {
        // Already a Buffer
        buffer = input;
    } else if (typeof input === "string") {
        // Base64 string
        buffer = Buffer.from(input, "base64");
    } else if (input._bsontype === "Binary") {
        // MongoDB Binary type
        buffer = input.read(0, input.length());
    } else {
        throw new TypeError("Unsupported data type for gunZIPBuffer()");
    }

    const decompressed = gunzipSync(buffer).toString("utf-8");
    return parseJson ? JSON.parse(decompressed) : decompressed;
}


function defaultWrite(input) {
    return JSON.stringify(input)
    // Якщо вирішу перейти на gZIPBuffer, то просто розкоментувати
    // return gZIPBuffer(input)
}


function defaultRead(input) {
    return JSON.parse(input)
    // Якщо вирішу перейти на gZIPBuffer, то просто розкоментувати
    // return gZIPBuffer(gunZIPBuffer, true)
}

module.exports = {
    gZIPBuffer, gunZIPBuffer,
    defaultWrite, defaultRead
}