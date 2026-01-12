import { fetchWithHandler } from "/__errorHandler.js"


const selectedCRUD = document.getElementById("selectedCRUD")
const containersCRUD = document.getElementById("containersCRUD")
const buttonsCRUD = containersCRUD && containersCRUD.querySelectorAll('button[type="button"]')


const getSelected = () => document.querySelectorAll('input[name="containers"]:checked')


const updateSelected = () => {
    if (!containersCRUD) {
        console.error("No containersCRUD element found")
        return
    }

    const selectedContainers = getSelected()
    const isThereSelected = Boolean(selectedContainers.length)

    containersCRUD.classList.toggle("-active", isThereSelected)
    buttonsCRUD.forEach(btn => btn.disabled = !isThereSelected)

    if (selectedCRUD) selectedCRUD.textContent = selectedContainers.length
}


document.addEventListener("toggleSelected", updateSelected)


const deselect = document.getElementById("deselect")
if (deselect) deselect.addEventListener("click", () => {
    for (const input of getSelected()) {
        input.checked = false
        const container = input.closest(`li[data-id="${ input.id }"]`)
        if (container) container.classList.remove("-selected")
    }
    updateSelected()
})


const deleteSelected = document.getElementById("deleteSelected")
if (deleteSelected) deleteSelected.addEventListener("click", async () => {
    try {
        deleteSelected.disabled = true

        const selectedContainers = [...getSelected()]
            .filter(c => c.closest(`li[data-id][data-toremove="false"]`))

        if (!selectedContainers.length) return

        const { isConfirmed } = await Swal.fire({
            icon: "question",
            title: "Remove selected containers?",
            html: "The selected containers will be scheduled for removal and automatically deleted in <b>10 days</b>. You can restore them at any time before then.",
            showCancelButton: true,
            confirmButtonText: "Schedule removal",
            cancelButtonText: "Keep containers"
        })
            
        if (!isConfirmed) return

        const result = await fetchWithHandler({
            action: "/admin/containers",
            method: "delete",
            body: {
                containers: [...selectedContainers]
                    .map(c => c.id)
            }
        })

        if (result) {
            for (const input of selectedContainers) {
                input.checked = false
                const container = input.closest(`li[data-id="${ input.id }"]`)
                if (container) {
                    container.classList.remove("-selected")
                    container.dataset.toremove = true
                    container.innerHTML += "<span>Scheduled to remove</span>"
                }
            }

            await Swal.fire({ icon: "success", title: "Scheduled for removal.",
                toast: true, timer: 1500, timerProgressBar: true })
        }

    } catch (error) {
        console.log("❌ Couldn't remove: ", error.message || error)
        await Swal.fire({ icon: "error", title: "Request failed",
            text: error?.message || "An unexpected error occurred." })
    } finally {
        updateSelected()
    }
})



const restore = document.getElementById("restore")
if (restore) restore.addEventListener("click", async () => {
    try {
        restore.disabled = true

        const selectedContainers = [...getSelected()]
            .filter(c => c.closest(`li[data-id][data-toremove="true"]`))

        if (!selectedContainers.length) return

        const { isConfirmed } = await Swal.fire({
            icon: "question",
            title: "Restore selected containers?",
            html: "The scheduled removal of the selected containers will be <b>cancelled</b>, and the containers will remain active.",
            showCancelButton: true,
            confirmButtonText: "Restore containers",
            cancelButtonText: "Keep removal scheduled"
        })
            
        if (!isConfirmed) return

        const result = await fetchWithHandler({
            action: "/admin/containers/restore",
            method: "post",
            body: {
                containers: [...selectedContainers]
                    .map(c => c.id)
            }
        })

        if (result) {
            for (const input of selectedContainers) {
                const container = input.closest(`li[data-id="${ input.id }"]`)
                if (container) {
                    container.dataset.toremove = false
                    const deletedAt = container.querySelector('.deletedAt')
                    if (deletedAt) deletedAt.remove()
                }
            }

            await Swal.fire({ icon: "success", title: "Scheduled removing is cancelled.",
                toast: true, timer: 1500, timerProgressBar: true })
        }

    } catch (error) {
        console.log("❌ Couldn't restore: ", error.message || error)
        await Swal.fire({ icon: "error", title: "Request failed",
            text: error?.message || "An unexpected error occurred." })
    } finally {
        updateSelected()
    }
})