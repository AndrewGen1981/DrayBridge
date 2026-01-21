import { fetchWithHandler } from "/__errorHandler.js"
import { trackFormElements } from "/__formTracker.js"
import { showProgressSimulation } from "/__tools.js"


const btnSubmitUpdates = document.getElementById("submitUpdates")
const formEditADriver = document.getElementById("formEditADriver")
let tracker = trackFormElements({ formSelectorOrForm: formEditADriver })


const docsList = document.getElementById("docs")



if (docsList) docsList.querySelectorAll("li.doc")
    .forEach(doc => doc.addEventListener("click", async (e) => {

        const { url } = doc?.dataset || {}
        if (!url) {
            await Swal.fire({
                icon: "warning",
                title: "Cannot proceed.",
                html: "Cannot proceed action. <b>No URL found</b>."
            })
            return
        }

        const deleteBtn = e.target.closest("button.delete-btn")
        if (deleteBtn) {

            try {
                deleteBtn.disable = true

                const { driverid } = deleteBtn.dataset || {}
                if (!driverid) {
                    await Swal.fire({
                        icon: "warning",
                        title: "Cannot delete.",
                        html: "Cannot remove document. <b>No driver ID found</b>."
                    })
                    return
                }

                doc.classList.add("-remove")

                const { isConfirmed } = await Swal.fire({
                    icon: "question",
                    title: "Confirm document removal",
                    html: "Would you like to <b>REMOVE</b> selected document?",
                    confirmButtonText: "Remove",
                    cancelButtonText: "Cancel",
                    showCancelButton: true,
                })

                if (!isConfirmed) return

                const { result } = await fetchWithHandler({
                    action: `/admin/drivers/remove-doc`,
                    method: "post",
                    body: {
                        url,
                        driverId: driverid,
                    }
                }) || {}

                if (result) {
                    await Swal.fire({ icon: "success", title: "Successfully removed!",
                        toast: true, timer: 1500, timerProgressBar: true })

                    doc.remove()

                    const legend = docsList.closest("fieldset")?.querySelector("legend")
                    if (legend) legend.textContent = `Existing Documents (${ docsList?.children?.length })`
                }

            } catch(error) {
                console.log("❌ Cannot remove: ", error.message || error)
                await Swal.fire({ icon: "error", title: "Request failed",
                    text: error?.message || "An unexpected error occurred." })
            } finally {
                doc.classList.remove("-remove")
                deleteBtn.disable = false
            }

        } else {
            const picture = e.target.matches("li") || e.target.matches("img")
            if (url && picture) window.open(url, "_blank")
        }

    }))


document.querySelectorAll("input.doc-title")
    .forEach(inp => {
        inp.addEventListener("input", () => {
            inp.classList.toggle("modified", inp.value !== inp.dataset.old)
        })

        inp.addEventListener("blur", async (e) => {
            if (inp.value === inp.dataset.old) return
            
            const { driverid: driverId } = inp.dataset || {}
            if (!driverId) return
            
            const { url } = e.target.closest("li.doc")?.dataset || {}
            if (!url) return

            try {
                const label = inp.value
                    .replace(/\s+/g, " ")
                    .trim()

                const { result } = await fetchWithHandler({
                    action: `/admin/drivers/set-doc-label`,
                    method: "post",
                    body: {
                        url,
                        label,
                        driverId,
                    }
                }) || {}

                if (result) {
                    inp.classList.remove("modified")
                    inp.dataset.old = label
                    inp.value = label
                }

            } catch(error) {
                console.log("❌ Cannot update: ", error.message || error)
                await Swal.fire({ icon: "error", title: "Request failed",
                    text: error?.message || "An unexpected error occurred." })
            }
        })
    })


if (formEditADriver) formEditADriver.addEventListener("submit", async (e) => {
    e.preventDefault()
    if (btnSubmitUpdates) btnSubmitUpdates.disable = true

    try {
        const modifiedInputs = tracker.getModified()
        if (!modifiedInputs.length) {
            await Swal.fire({
                icon: "warning",
                title: "Cannot update",
                html: "Looks like nothing was changed. <b>Please modify something before saving</b>."
            })
            return
        }

        if (modified) {
            modified.value = modifiedInputs.map(inp => inp.name).join(",")
        } else {
            Swal.fire({ icon: "warning", title: "Input for modified is missed" })
        }

        const { isConfirmed } = await Swal.fire({
            icon: "question",
            title: "Confirm driver update",
            html: `
                <p>You are about to update a new driver.</p>
                <p>Please double-check the entered information before proceeding.</p>
                <b>Duplicate drivers are not allowed.</b>
            `,
            confirmButtonText: "Update",
            cancelButtonText: "Cancel",
            showCancelButton: true,
        })

        if (!isConfirmed) return

        // 🔥 показуємо Swal із прогресом
        showProgressSimulation()

        e.target.submit()
        
    } catch (error) {
        console.log("❌ Cannot submit: ", error.message || error)
        await Swal.fire({ icon: "error", title: "Request failed",
            text: error?.message || "An unexpected error occurred." })
    } finally {
        if (btnSubmitUpdates) btnSubmitUpdates.disable = false
    }
})



// Delete driver
const btnRemoveDriver = document.getElementById("removeDriver")


if (btnRemoveDriver) {
    btnRemoveDriver.addEventListener("click", async (e) => {
        try {
            btnRemoveDriver.disabled = true
            const { driverid } = btnRemoveDriver.dataset || {}
            if (!driverid.trim()) throw new Error("Driver ID required for removing")

            const confirmCode = driverid.slice(0, 4).toUpperCase()

            const { isConfirmed, value } = await Swal.fire({
                icon: "warning",
                title: "Delete driver?",
                html: `
                    <p><b>This action is irreversible.</b></p>
                    <p>The driver record and all related documents will be permanently deleted.</p>
                    <p style="margin-top:12px;">
                        To confirm deletion, type the following code:<br>
                        <b style="font-size:18px;letter-spacing:2px;">${ confirmCode }</b>
                    </p>
                `,
                input: "text",
                inputPlaceholder: "Enter confirmation code",
                inputAttributes: {
                    autocapitalize: "characters",
                    autocomplete: "off"
                },
                confirmButtonText: "Delete driver",
                cancelButtonText: "Cancel",
                showCancelButton: true,
                confirmButtonColor: "#d33",
                preConfirm: (value) => {
                    if (!value || value.toUpperCase() !== confirmCode) {
                        Swal.showValidationMessage("Confirmation code does not match")
                        return false
                    }
                    return true
                }
            })

            if (!isConfirmed || !value) return

            const { result } = await fetchWithHandler({
                action: `/admin/drivers/${ driverid }`,
                method: "DELETE"
            }) || {}

            if (result) {
                await Swal.fire({ icon: "success", title: "Successfully removed!",
                    toast: true, timer: 1500, timerProgressBar: true })

                location.replace("/admin/drivers")
            }

        } catch (error) {
            console.log("❌ Remove issue: ", error.message || error)
            await Swal.fire({ icon: "error", title: "Request failed",
                text: error?.message || "An unexpected error occurred." })
        } finally {
            btnRemoveDriver.disabled = false
        }
    })
}