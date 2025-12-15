// *** Додаткові інструменти для роботи з Моделями мангуста


// Технічні поля схеми, які не включаються при автозаповненнях, генерації об*єктів по схемах і т.д.
const STANDART_SCHEMA_FIELDS_TO_EXCLUDE = ['_id', '__v', 'createdAt', 'updatedAt']


// 🔥 Повертає масив ключів Моделі по схемі schema
function extractSchemaFields(schemaOrModel, exclude = STANDART_SCHEMA_FIELDS_TO_EXCLUDE) {
  const schema = schemaOrModel?.schema || schemaOrModel     // Можна передавати Модель або Схему
  const tree = schema?.tree

  if (!tree || typeof tree !== 'object') return []

  return Object.keys(tree).filter(key => !exclude.includes(key))
}


// Повертає об*єкт готовий до збереження в базу, відкидає зайві поля
function fulfillPerSchema(obj = {}, modelOrSchema) {
    if (typeof obj !== 'object' || obj === null) return {}

    const schemaFields = extractSchemaFields(modelOrSchema)

    return Object.entries(obj).reduce((acc, [k, v]) => {
        if (schemaFields.includes(k) && v != null) {
            acc[k] = v
        }
        return acc
    }, {})
}


// Повертає копію body (🧠 body не мутує) очищену від FIELDS_TO_EXCLUDE полів та порожніх строк
// порожні строки, нулі і т.д. можна прибирати опційно, але для цього потрібно створити options
function cleanBodyCopy(body = {}, FIELDS_TO_EXCLUDE = []) {
    return Object.entries(body).reduce((acc, [key, value]) => {
        if (FIELDS_TO_EXCLUDE.includes(key)) return acc
        if (typeof value === "string" && value.trim() === "") return acc

        acc[key] = value
        return acc
    }, {})
}


// Варіант попередньої функції, повертає тільки відповідно полям схеми (🧠 body не мутує)
function cleanBodyCopyWithModel(body = {}, schemaOrModel, CUSTOM_FIELDS_TO_EXCLUDE = []) {
    const okFields = extractSchemaFields(schemaOrModel, [ ...STANDART_SCHEMA_FIELDS_TO_EXCLUDE, ...CUSTOM_FIELDS_TO_EXCLUDE ])
    const notOkFields = Object.keys(body).filter(key => !okFields.includes(key))
    return cleanBodyCopy(body, notOkFields)
}


// Створюю аналог fulfillPerSchema для bulk операцій. Максимально швидкий

const { Container } = require("../Models/containerModel")

const allowed = new Set(Object.keys(Container.schema.paths))

const fulfillPerContainer = (obj) => {
    const result = {}
    for (const k of Object.keys(obj)) {
        if (allowed.has(k) && obj[k] != null) {
            result[k] = obj[k]
        }
    }
    return result
}


module.exports = {
    extractSchemaFields,
    fulfillPerSchema,
    
    fulfillPerContainer,

    cleanBodyCopy,
    cleanBodyCopyWithModel,
}