import { fetchWithHandler } from "/__errorHandler.js"


const registerForm = document.querySelector("main.register form")


if (registerForm) {

    const passwordInput = registerForm.querySelector("#password")
    const passwordErrors = registerForm.querySelector(".errors")
   
    registerForm.addEventListener('submit', function (e) {
        e.preventDefault()
    
        const form = e.target
        if (!form.checkValidity()) {
            form.reportValidity()   // покаже нативну валідацію
            return
        }
    
        grecaptcha.execute()    // все валідне — запускаємо reCAPTCHA
    })


    let debounceTimeout = null
    
    
    passwordInput.addEventListener('input', (e) => {
        try {
            passwordInput.dataset.ok = "checking"
    
            const password = passwordInput.value
            const isNotCompleted = password.length < 5
    
            if (isNotCompleted) return
        
            clearTimeout(debounceTimeout)
            debounceTimeout = setTimeout( async() => {

                const errors = await fetchWithHandler({
                    action: "/user/validate-password", method: "POST",
                    body: { password }
                }) || []
    
                passwordInput.dataset.ok = errors.length === 0
    
                if (passwordErrors) {
                    passwordErrors.dataset.hidden = passwordInput.dataset.ok
                    passwordErrors.innerHTML = errors.map(err => `<li>${ err.msg }</li>`).join("")
                }
        
            }, 1000)
    
        } catch(error) {
            console.log("❌ Password check error: ", error.message || error)
        }
    })

}