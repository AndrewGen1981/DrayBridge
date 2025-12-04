import { fetchWithHandler } from "/__errorHandler.js"
import { trackFormElements } from "/__formTracker.js"



document.addEventListener("DOMContentLoaded", () => {

        
    // formTracker для відслідковування заміни особистих даних
    const tracker = trackFormElements({ formSelectorOrForm: "#person" })


    // Сабміт форми на зміну даних користувача
    const profileForm = document.getElementById("person")
    if (profileForm) profileForm.addEventListener("submit", async (e) => {
        e.preventDefault()

        const changes = tracker.getModified()
        if (!changes?.length) {
            await Swal.fire({ icon: "info", title: "Nothing to update",
                text: "No changes detected." })
            return
        }

        try {
            const { isConfirmed } = await Swal.fire({
                icon: "question",
                title: "Please confirm",
                html: `You are about to update your personal data (${changes.length} field${changes.length > 1 ? "s" : ""} changed). Continue?`,
                showCancelButton: true,
                confirmButtonText: "Update",
                cancelButtonText: "Cancel",
                focusCancel: true,
            })

            if (!isConfirmed) return

            const { result, updatedFields = {} } = await fetchWithHandler({
                action: profileForm.action,
                method: profileForm.method,
                body: { changes },
            }) || {}

            if (result) {

                const updatedInputs = []
                for (const upf of Object.keys(updatedFields)) {
                    const upi = document.getElementById(upf)
                    if (!upi) continue
                    updatedInputs.push(upi)
                    upi.classList.remove("modified")
                }

                if (changes.length !== updatedInputs.length) {
                    await Swal.fire({ icon: "warning", title: "Partial update",
                        text: `Not all requested fields were updated. Successfully updated fields: ${ Object.keys(updatedFields).join(', ') }.` })
                } else {
                    await Swal.fire({ icon: "success", title: "Successfully updated!",
                        toast: true, timer: 1500, timerProgressBar: true })
                }
                
                tracker.removeInputs(updatedInputs)
                tracker.addInputs(updatedInputs)

            } else {
                console.log(`Personal data update issue: false result received, fields: `, updatedFields)
                await Swal.fire({ icon: "warning", title: "Personal data update issue",
                    text: "We couldn't update your personal data. Please check the highlighted fields and try again, or contact support if the problem persists." })
            }

        } catch (error) {
            console.log("❌ Personal data update error: ", error.message || error)
            await Swal.fire({ icon: "error", title: "Request failed",
                text: error?.message || "An unexpected error occurred." })
        }
    })

})