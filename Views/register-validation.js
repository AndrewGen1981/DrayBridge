// Модуль для роботи з помилками валідації (серверні помилки)
import { trackFormElements } from "/__formTracker.js"


// Позначення розділів для виводу помилок
const labels = {
    email: "Email",
    password: "Password",
    phone: "Phone number",
    username: "User name",
}


// Об*єкт з помилками передаю в тілі документу
const validationErrors = document.getElementById("validation-errors")?.innerText || ""


async function showValidationErrors() {
    if (!validationErrors?.trim()) return

    try {
        const errors = JSON.parse(validationErrors)
        if (!Array.isArray(errors) || !errors.length) return
        
        const grouped = errors.reduce((acc, err) => {
            const key = err.path
            if (!acc[key]) acc[key] = []
            acc[key].push(err.msg)
            return acc
        }, {})

        let html = ""

        for (const key of Object.keys(grouped)) {
            const title = labels[key] || key
            const messages = grouped[key]

            // позначаю поля для __formTracker
            const input = document.getElementById(key)
            if (input) input.dataset.invalid = true

            html += `
                <div style="margin-bottom:12px">
                    <b style="font-size:15px">${ title }</b>
                    <ul style="margin:6px 0 0 18px; padding:0;">
                        ${ messages.map(m => `<li>${ m[0].toUpperCase() }${ m.slice(1) }</li>`).join("") }
                    </ul>
                </div>
            `
        }

        // Модальне повідомлення, яке поводиться як toast, можна переміщати, можна закрити,
        // не перекриває форму та дозволяє вправити поля з помилками
        Swal.fire({
            icon: "error",
            title: "Please fix the following:", html,
            
            backdrop: false,
            draggable: true,
            showConfirmButton: false,
            showCloseButton: true,
            allowOutsideClick: true,
            allowEscapeKey: true,

            width: "min(39rem, 100%)",
            position: "center-start"
        })


        // Якщо поля повернулися з помилками з серверу (попередній сабміт), то відслідковую їх стан
        trackFormElements({ formSelectorOrForm: '[name="registerForm"]' })

        
    } catch (error) {
        console.warn("Received validation errors, but couldn't parse response", error)
        alert(validationErrors)
    }
}


await showValidationErrors()