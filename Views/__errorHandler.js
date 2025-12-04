export async function fetchWithHandler({
    action, method: _method = "GET", body = {},
    contentType = "application/json",
    options = {}
}) {
    const method = _method.toUpperCase()

    const {
        allowAlerts = true,
        allowPostLogs = true,
        allowClipboard = false,
        throwOnError = false
    } = options

    try {
        if (!action) throw new Error("Action/endpoint should be defined")

        const fetchOptions = { method, headers: { 'Content-Type': contentType } }

        const hasBody = [ "POST", "PUT", "PATCH", "DELETE" ].includes(method)
        if (hasBody) fetchOptions.body = JSON.stringify(body)

        const response = await fetch(action, fetchOptions)
        const { status, statusText } = response
        const messageHeader = `${status}. ${statusText}`

        let data = {}

        try { data = await response.json() }
        catch (_) {}  // Якщо тіло не JSON — наприклад, пусте
        //  _ — це просто змінна для помилки, яку ми не використовуємо. Це стилістично вказує: "Так, помилка була, але вона мені не потрібна"
        //  catch (_) {} або навіть catch {} — це короткий варіант, де (_) підкреслює, що помилка свідомо ігнорується

        if (!response.ok) {
            const { issue = data } = data || {}

            const error = Array.isArray(issue)
                ? issue.map(err => ` - ${ err.msg || err }`).join("\n")
                : typeof issue === 'object'
                ? JSON.stringify(issue)
                : issue
           
            const serverErrorMessage = `❌ ${ messageHeader }\n${ error }`
            if (allowPostLogs) postForLogs(serverErrorMessage, "error")    // 🔵 пігную на "/log" для логів, async не потрібно

            if (allowClipboard && navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(serverErrorMessage)
            }

            if (allowAlerts) await Swal.fire({ icon: "error", title: `❌ ${ messageHeader }`, html: error.replace(/\n/g, "<br>") }) // alert(serverErrorMessage)
            if (throwOnError) throw new Error(serverErrorMessage)
            return null
        }
        
        return data     // Якщо все ок

    } catch (e) {
        const errMessage = `❌ ${ method } ${ method === "GET" ? "from" : "to" } "${ action }" failed:\n${ e.message }`
        if (allowPostLogs) postForLogs(errMessage, "error")    // 🔵 пігную на "/log" для логів, async не потрібно
        if (allowAlerts) await Swal.fire({ icon: "error", title: "Request failed", html: errMessage.replace(/\n/g, "<br>") })  // alert(errMessage)
        console.error(errMessage)
        if (throwOnError) throw e   // щоб можна було ловити у викликах
        return null
    }
}



// без async - не чекаю завершення, просто пінгую
export function postForLogs(text, level = "info") {
    if (!text?.trim()) return

    fetch("/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, text })
    })
}