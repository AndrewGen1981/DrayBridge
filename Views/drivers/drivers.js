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







// EDIT driver's info

const existingDrivers = document.getElementById("existingDrivers")


if (existingDrivers) {
    // EDIT buttons
    existingDrivers.addEventListener("click", async (e) => {
        if (e.target.closest('button[name="edit-driver"]')) {
            const editBtn = e.target
            try {
                if (!editBtn) throw new Error("Bad edit button")
                if (!asideWrapper) throw new Error("Modal item wasn't found")
                if (!formAddNewDriver) throw new Error("Editing form wasn't found")

                editBtn.disabled = true
                const { driverid } = editBtn.dataset || {}
                if (!driverid) throw new Error("Driver ID required for editing")

                const { action } = formAddNewDriver
                const { driver = {} } = await fetchWithHandler({
                    action: `${ action }/${ driverid }`,
                    method: "GET"
                }) || {}

                const driverFields = Object.keys(driver)
                if (!driverFields.length) throw new Error("Cannot read driver's data")
                
                for (const k of driverFields) {
                    if (k === "documents") continue
                    const input = formAddNewDriver.querySelector(`[name=${ k }]`)
                    if (input) input.value = driver[k]
                }
                    // console.log(driver)


                asideWrapper.classList.remove("-hidden")

            } catch (error) {
                console.log("❌ Edit issue: ", error.message || error)
                await Swal.fire({ icon: "error", title: "Request failed",
                    text: error?.message || "An unexpected error occurred." })
            } finally {
                if (editBtn) editBtn.disabled = false
            }
        }
    })
}