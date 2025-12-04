// Відповідає за підключення телефонного сервісу Twilio та відсилку текстових повідомлень

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env
const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


const { smsPhone, canUsePhoneForVerification } = require("../Config/__config.json")


exports.getTextMessage = (messageType, value = "") => {
    if (messageType === "auto-generated-password") {
        return `Your PartStop first-time password is: ${ value }. Don't share it with anyone. We'll never ask for it to be disclosed.`
    } else {
        return `Undefined message type with value ${ value }`
    }
}


exports.sendTetxMessage = async ({ phone, textMessage }) => {
    try {

        if (!canUsePhoneForVerification) return {
            status: 403, message: "Phone verification is forbidden. Check configs."
        }
        if (!smsPhone) return {
            status: 403, message: "Phone number for verification is not set in configs"
        }
        if (!phone) return {
            status: 400, message: "Client phone number is absent or invalid"
        }
        if (!textMessage?.trim()) return {
            status: 400, message: "Message is empty"
        }

        return {
            status: 200,
            message: await twilio.messages.create({
                to: phone,
                from: smsPhone,
                body: textMessage
            })
        }

    } catch(message) {
        console.error(message)
        return { status: 500, message }
    }
}