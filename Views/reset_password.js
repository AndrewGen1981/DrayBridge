import { fetchWithHandler } from "/__errorHandler.js"


const usernameEmail = document.getElementById("usernameEmail")
const userId = document.getElementById("userId")


// Строка результату пошуку юзера
const result = document.getElementById("result")

// Форми
const validateUsernameForm = document.getElementById("validate-username")
const resetPasswordForm = document.getElementById("reset-password")



// Обробляє надсилання форми перевірки username/email перед скиданням паролю.
// – Перевіряє, чи введено email/username
// – Не дає повторно шукати той самий запит
// – Якщо все добре — показує форму скидання паролю

if (validateUsernameForm) validateUsernameForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    if (usernameEmail.dataset.old === usernameEmail.value) {
        await Swal.fire({ icon: "info", title: "Already searched",
            text: `You've already looked for "${ usernameEmail.dataset.old }".` })
        return
    }

    usernameEmail.dataset.old = usernameEmail.value

    const submitBtn = validateUsernameForm.querySelector("button[type='submit']")
    if (submitBtn) submitBtn.disabled = true

    try {
        if (user) {
            userId.value = user._id

            if (resetPasswordForm) resetPasswordForm.hidden = false
            if (result) result.innerText = `Send a code to phone ending in ${ user.phone }`
        } else {
            if (result) result.innerText = ""
            if (submitBtn) submitBtn.disabled = false
        }

    } catch (error) {
        console.error(error)
        await Swal.fire({ icon: "error", title: "Something went wrong",
            text: error?.message || "An unexpected error occurred. Please try again." })
        if (submitBtn) submitBtn.disabled = false
    }
}, true)



// Обробляє форму скидання паролю.
// – Перевіряє, чи задано userId і номер телефону
// – Питає підтвердження через SweetAlert2 перед запитом
// – Надсилає запит, і при успіху перекидає на сторінку входу
// – Показує повідомлення через SweetAlert2, а не alert()
// – Блокує кнопку під час запиту, розблоковує при помилці

if (resetPasswordForm) resetPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    if (!userId?.value?.length)
        return await Swal.fire({ icon: "warning", title: "Missing data", text: "User ID is required." })

    if (!result?.innerText?.length)
        return await Swal.fire({ icon: "warning", title: "Phone not found", text: "Phone number is not defined." })

    const submitBtn = resetPasswordForm.querySelector("button[type='submit']")
    if (submitBtn) submitBtn.disabled = true;

    const confirmReset = await Swal.fire({
        icon: "question",
        title: "Reset your password?",
        showCancelButton: true,
        confirmButtonText: "Yes, reset it",
        cancelButtonText: "Cancel"
    })

    if (!confirmReset.isConfirmed) return submitBtn.disabled = false

    try {
        const response = await fetchWithHandler({
            action: resetPasswordForm.action,
            method: resetPasswordForm.method,
            body: {
                userId: userId.value,
                phone: result.innerText,
                usernameEmail: usernameEmail.value
            },
            options: { allowClipboard: false }
        })

        if (response !== null) {
            await Swal.fire({ icon: "success", title: "Check your phone",
                text: "Please log in with the code we sent to you." })
            location.replace("/login")
        } else {
            if (submitBtn) submitBtn.disabled = false
        }

    } catch (error) {
        console.error(error)
        await Swal.fire({ icon: "error", title: "Request failed",
            text: error?.message || "An unexpected error occurred." })
        if (submitBtn) submitBtn.disabled = false
    }
}, true)