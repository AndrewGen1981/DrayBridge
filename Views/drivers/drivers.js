import { fetchWithHandler } from "/__errorHandler.js"


// Бічна панель (форма для додавання нового водія)
const asideWrapper = document.getElementById("asideWrapper")
const btnToggleForm = document.getElementById("toggleForm")

const btnCancelAddNew = document.getElementById("cancelAddNew")
const btnSubmitAddNew = document.getElementById("submitAddNew")


const toogleAddNewForm = () => {
    if (asideWrapper) asideWrapper.classList.toggle("-hidden")
}

if (btnToggleForm) btnToggleForm.addEventListener("click", () => {
    toogleAddNewForm()
})

// Cancel / "Очистити" форму
if (btnCancelAddNew) btnCancelAddNew.addEventListener("click", () => {
    clearAll()  //  тут revokeObjectURL усіх завантажених 
    toogleAddNewForm()
})



const filesInput = document.getElementById("documents")
const dropzone = document.getElementById("dropzone")
const previews = document.getElementById("previews")


const MAX_FILES = 10
const MAX_FILE_SIZMB = 5    // MB
const MAX_FILE_SIZE = MAX_FILE_SIZMB * 1024 * 1024


const dropDownEvents = ["dragenter", "dragover", "dragleave", "drop"]
let dt = new DataTransfer()


function updateFilesStorage(_files = []) {
    const files = Array.isArray(_files) ? _files : [..._files]
    const rejected = []

    for (const file of files) {

        // Перевіряю формат
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
            rejected.push({
                file,
                reasonGroup: 0,
                reasonText: "Wrong file type. Images and PDF are allowed only",
            })
            continue
        }        

        // Перевіряю чи не дублікат
        const isDuplicate = Array.from(dt.files)
            .some(f => f.name.toLowerCase() === file.name.toLowerCase())
        
        if (isDuplicate) {
            rejected.push({
                file,
                reasonGroup: 1,
                reasonText: "Duplicate file name",
            })
            continue
        }

        // Перевіряю максимально дозволену кількість файлів
        if (dt.files.length >= MAX_FILES) {
            rejected.push({
                file,
                reasonGroup: 2,
                reasonText: `Maximum ${ MAX_FILES } files allowed`,
            })
            continue
        }

        // Перевіряю граничний об*єм
        if (file.size > MAX_FILE_SIZE) {
            rejected.push({
                file,
                reasonGroup: 3,
                reasonText: `File size exceeds ${ MAX_FILE_SIZMB }MB`,
            })
            continue
        }

        dt.items.add(file)
    }

    showRejectedFiles(rejected)
}


function showRejectedFiles(rejected = []) {
    if (!rejected.length) return

    rejected.sort((a,b) => a.reasonGroup - b.reasonGroup)

    let html = `<p style="margin-bottom:.5rem;">The following files were skipped:</p>`
    html += `<ul style="margin-left:1rem;text-align:left;list-style-position:inside;">`

    let group
    for (const r of rejected) {
        html += `<li ${ r.reasonGroup !== group ? 'style="margin-top:.5rem;"' : "" }><b>${ r.file.name }</b> — ${ r.reasonText }</li>`
        group = r.reasonGroup
    }

    html += `</ul>`

    Swal.fire({
        icon: "warning", title: "Some files were not added",
        html, width: "45rem", confirmButtonText: "OK"
    })
}


// click → open file picker
dropzone.addEventListener("click", () => {
    filesInput.click()
})


// CLICK — file picker
filesInput.addEventListener("change", e => {
    updateFilesStorage(e.target.files)
    syncInput()
})


// prevent default browser behavior
dropDownEvents.forEach((event, i) => {
    dropzone.addEventListener(event, e => {
        e.preventDefault()
        e.stopPropagation()
        
        // visual feedback
        const isActive = i < 2
        dropzone.classList.toggle("active", isActive)
    })
})


// DROP — додає файли
dropzone.addEventListener("drop", e => {
    updateFilesStorage(e.dataTransfer.files)
    syncInput()
})


function syncInput() {
    filesInput.files = dt.files
    renderPreviews()
}


function renderPreviews() {
    previews.innerHTML = ""

    const storedFiles = [...dt.files]
    previews.dataset.active = Boolean(storedFiles.length)

    storedFiles.forEach((file, index) => {
        const item = document.createElement("div")
        item.className = "preview"

        let objectUrl = null

        // image preview
        if (file.type.startsWith("image/")) {
            const img = document.createElement("img")
            objectUrl = URL.createObjectURL(file)
            img.src = objectUrl
            item.appendChild(img)
        }

        const label = document.createElement("span")
        label.textContent = file.name

        const remove = document.createElement("button")
        remove.type = "button"
        remove.textContent = "✕"

        remove.addEventListener("click", () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl)
            }
            removeFile(index)
        })

        item.append(label, remove)
        previews.appendChild(item)
    })
}


function removeFile(index) {
    const newDt = new DataTransfer()

    Array.from(dt.files)
        .filter((_, i) => i !== index)
        .forEach(file => newDt.items.add(file))

    dt = newDt
    syncInput()
}

function clearAll() {
    previews.querySelectorAll("img").forEach(img => {
        URL.revokeObjectURL(img.src)
    })
    previews.innerHTML = ""
    dt = new DataTransfer()
    filesInput.value = ""
}