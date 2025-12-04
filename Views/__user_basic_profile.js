import { fetchWithHandler } from "/__errorHandler.js"


const role = document.querySelector('meta[name="user-role"]')?.content || 'user'
const action = document.querySelector('meta[name="action"]')?.content

const passwordUpdateForm = document.querySelector("form.password-update")

const currentPasswordInput = passwordUpdateForm.querySelector("#current_password")
const newPasswordInput = passwordUpdateForm.querySelector("#new_password")
const newPasswordErrors = passwordUpdateForm.querySelector(".errors")



let debounceTimeout = null



// Валідація поточного паролю користувача, виконується на стороні серверу
if (currentPasswordInput) currentPasswordInput.addEventListener('input', (e) => {
    try {
        currentPasswordInput.dataset.ok = "checking"

        const password = currentPasswordInput.value
        const isNotCompleted = password.length < 5
        // currentPasswordInput.classList.toggle("completed", !isNotCompleted)

        if (isNotCompleted) return
    
        clearTimeout(debounceTimeout)
        debounceTimeout = setTimeout( async() => {

            const result = await fetchWithHandler({
                action: `/${ role }/check-password`, method: "POST",
                body: { password },
                options: { allowAlerts: false }
            })
    
            currentPasswordInput.dataset.ok = result !== undefined && result !== null
    
        }, 1000)

    } catch(error) {
        console.log("❌ Password check error: ", error.message || error)
    }
})



// Валідація нового паролю, якщо заповнено в формі на зміну паролю
if (newPasswordInput) newPasswordInput.addEventListener('input', (e) => {
    try {
        newPasswordInput.dataset.ok = "checking"

        const password = newPasswordInput.value
        const isNotCompleted = password.length < 5
        if (isNotCompleted) return
    
        clearTimeout(debounceTimeout)
        debounceTimeout = setTimeout( async() => {
            // Тиха перевірка
            const errors = await fetchWithHandler({
                action: `/${ role }/validate-password`, method: "POST",
                body: { password }
            }) || []

            // така перевірка є на стороні серверу, тут дублюю, щоб не плодити редіректи
            if (currentPasswordInput?.value === newPasswordInput.value) errors.push({
                msg: "Your new password must be different from the current one"
            })

            newPasswordInput.dataset.ok = errors.length === 0

            if (newPasswordErrors) {
                newPasswordErrors.dataset.hidden = newPasswordInput.dataset.ok
                newPasswordErrors.innerHTML = errors.map(err => `<li>${ err.msg }</li>`).join("")
            }
    
        }, 1000)

    } catch(error) {
        console.log("❌ Password check error: ", error.message || error)
    }
})



// Сабміт форми на зміну пароля
if (passwordUpdateForm) {
    // кнопка, щоб блокувати її при сабміті
    const submitBtn = passwordUpdateForm.querySelector("button[type='submit']")
    
    // сам сабміт
    passwordUpdateForm.addEventListener("submit", async(e) => {
        e.preventDefault()
        try {    
            if (submitBtn) submitBtn.disabled = true
    
            const current_password = currentPasswordInput?.value
            const new_password = newPasswordInput?.value
        
            if (!current_password || !new_password) {
                await Swal.fire({ icon: "error", title: "Missing required information",
                    text: "Please provide both your current and new password" })
                return
            }

            const areBothPasswordsOk = currentPasswordInput.dataset.ok === "true"
            && newPasswordInput.dataset.ok === "true"

            const confirmUpdatePassword = areBothPasswordsOk
            ? await Swal.fire({
                icon: "question",
                title: "Update password?",
                text: "This will update your password, continue?",
                showCancelButton: true,
                confirmButtonText: "Yes, update it",
                cancelButtonText: "Cancel"
            })
            : await Swal.fire({
                icon: "warning",
                title: "Validation failed",
                text: "Preliminary checks have revealed inconsistencies, please check the password update form for details. Or you'd like to take a chance with entered data?",
                showCancelButton: true,
                confirmButtonText: "Yes, I'll take a chance",
                cancelButtonText: "Cancel"
            })
        
            if (!confirmUpdatePassword.isConfirmed) return
        
            const result = await fetchWithHandler({
                action: `/${ role }/password-update`, method: "POST",
                body: { current_password, new_password }
            })
    
            if (result !== null) {
                // Якщо це зміна паролю на вимогу, то одразу перевожу в профайл
                if (action === "must-update-password") {
                    const confetti = document.getElementById("confetti-btn")
                    if (confetti) confetti.click()
                    setTimeout(() => {
                        return location.replace(`/${ role }/profile`)
                    }, 5500)
                } else {
                    // Якщо це зміна паролю з профайлу, то повідомляю і очищаю поля
                    await Swal.fire({ icon: "success", title: "Successfully updated!",
                        text: "Your password has been updated successfully" })
    
                    currentPasswordInput.value = ""
                    currentPasswordInput.removeAttribute("data-ok")
                    
                    newPasswordInput.value = ""
                    newPasswordInput.removeAttribute("data-ok")
                }
            }
    
        } catch(error) {
            console.log("❌ Password update error: ", error.message || error)
            await Swal.fire({ icon: "error", title: "Request failed",
                text: error?.message || "An unexpected error occurred." })
        } finally {
            if (submitBtn) submitBtn.disabled = false
        }
    
    }, true)
}