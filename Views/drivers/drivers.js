import { fetchWithHandler } from "/__errorHandler.js"
import { trackFormElements } from "/__formTracker.js"
import { showProgressSimulation } from "/__tools.js"



// Бічна панель (форма для додавання нового водія)
const asideWrapper = document.getElementById("asideWrapper")
const btnToggleForm = document.getElementById("toggleForm")

const modified = document.getElementById("modified")
const btnCancelAddNew = document.getElementById("cancelAddNew")
const btnSubmitAddNew = document.getElementById("submitAddNew")
const formAddNewDriver = document.getElementById("formAddNewDriver")

const email = document.getElementById("email")



let tracker = formAddNewDriver
    ? trackFormElements({ formSelectorOrForm: formAddNewDriver })
    : null


if (btnToggleForm) btnToggleForm.addEventListener("click", () => {
    if (asideWrapper) asideWrapper.classList.toggle("-hidden")
})


// Cancel / "Очистити" форму
if (btnCancelAddNew) btnCancelAddNew.addEventListener("click", () => {
    if (asideWrapper) asideWrapper.classList.toggle("-hidden")
    //  далі revokeObjectURL усіх завантажених картинок в компоненті DocsDragNDrop
    document.dispatchEvent(new Event("clearAll"))
})


// Submit
if (formAddNewDriver) formAddNewDriver.addEventListener("submit", async (e) => {
    e.preventDefault()
    if (btnSubmitAddNew) btnSubmitAddNew.disable = true

    try {
        const modifiedInputs = tracker.getModified()
        if (!modifiedInputs.length) {
            await Swal.fire({
                icon: "warning",
                title: "Cannot submit",
                html: "Please fill in at least required fields to submit."
            })
            return
        }

        if (modified) {
            modified.value = modifiedInputs.map(inp => inp.name).join(",")
        } else {
            Swal.fire({ icon: "warning", title: "Input for modified is missed" })
        }

        if (!email?.value?.trim()) {
            Swal.fire({ icon: "warning", title: "Email is required" })
            return
        }

        const { result } = await fetchWithHandler({
            action: `/admin/drivers/email`,
            method: "post",
            body: { email: email.value }
        }) || {}

        if (result) {
            Swal.fire({ icon: "error", title: `Driver with email "${ email.value }" already exists` })
            return
        }

        const { isConfirmed } = await Swal.fire({
            icon: "question",
            title: "Confirm driver creation",
            html: `
                <p>You are about to create a new driver.</p>
                <p>Please double-check the entered information before proceeding.</p>
                <b>Duplicate drivers are not allowed.</b>
            `,
            confirmButtonText: "Create driver",
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
        if (btnSubmitAddNew) btnSubmitAddNew.disable = false
    }
})