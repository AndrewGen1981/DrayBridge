import { fetchWithHandler } from "/__errorHandler.js"


const terminalsList = document.getElementById("terminals-list")
if (!terminalsList) console.warn("Cannot find terminals cards in the DOM")

const resultBox = document.getElementById("result")
if (!resultBox) console.warn("Cannot find result area in the DOM")


let selectTimer


if (terminalsList && resultBox) {
    document.addEventListener("DOMContentLoaded", () => {

        // Кліки по картках терміналів
        terminalsList.addEventListener("click", async (e) => {

            // Кліки по чекбоксах карток терміналів
            if (e.target.closest("input[type='checkbox'][data-selector]")) {
        
                // Обнуляю таймер
                clearTimeout(selectTimer)
                
                const allChecked = terminalsList.querySelectorAll("input[type='checkbox'][data-selector]:checked")
                if (!allChecked.length) return
        
                try {
                    const checkbox = e.target        
                    const isTotal = checkbox.value === "total"
        
                    const card = terminalsList.querySelector(`.terminal-card[data-key="${ checkbox.name }"]`)
                    if (card) card.classList.add("-searching")
        
                    // Тотал знімає решту checked в БЛОЦІ(!), а якщо обирають конкретний статус(и), то знімається checked у тоталу
                    const checked = terminalsList.querySelectorAll(`input[name='${ checkbox.name }']:checked`)
                    if (checked.length > 1) checked.forEach(ch => {
                        if (ch !== checkbox && (ch.value === "total" || isTotal)) {
                            ch.checked = false
                        }
                    })
            
                    selectTimer = setTimeout(async () => {
        
                        const obj = {}
        
                        // перечитую заново всі чеки всіх карток терміналів
                        terminalsList.querySelectorAll("input[type='checkbox'][data-selector]:checked")
                            .forEach(ch => {
                                if (!obj[ch.name]) obj[ch.name] = []
                                if (ch.value !== "total") obj[ch.name].push(ch.value)
                            })
        
                        const result = await fetchWithHandler({
                            action: "/admin/containers/get-containers",
                            method: "post",
                            body: {
                                terminalStatus: Object.entries(obj)
                                    .map(([k, v]) => ({ terminal: k, status: v }))
                            }
                        })
        
                        // console.log(result)
        
                        const { containers = [], schemaLabels = {} } = result || {}
        
                        if (containers.length) {
                            let html = ""
                            for (const c of containers) {
                                html += `<li id="${ c._id }">`
                                
                                // щоб зберігався порядок полій йду по схемі, не по об*єкту
                                for (const k of Object.keys(schemaLabels)) {
        
                                    if (!c[k]) continue     //  _id сюди не портапляє, бо в schemaLabels це "id"
                                    
                                    html += `<dl class="${ k }">
                                        <dt>${ schemaLabels[k] || k }</dt>
                                        <dd name="${ k }">${ c[k] }</dd>
                                    </dl>`
        
                                }
                                html += "</li>"
                            }
                            resultBox.innerHTML = html
                        } else {
                            resultBox.innerHTML = `Nothing found...`
                        }
        
                        // знімаю всі позначки "wait"
                        terminalsList.querySelectorAll(`.terminal-card`).forEach(c => c.classList.remove("-searching"))
                    }, 1000)
                    
                } catch (error) {
                    console.log("❌ Couldn't find: ", error.message || error)
                    await Swal.fire({ icon: "error", title: "Request failed",
                        text: error?.message || "An unexpected error occurred." })
                }        
        
            } else if (e.target.closest("button[name='off']")) {
                // Вмикання/вимикання терміналів з оновлення

                try {

                    const btn = e.target
                    const card = btn.closest(".terminal-card")
                    const id = btn.id?.split(".")?.[1]

                    if (!id || id !== card?.id) {
                        console.warn("Cannot proceed, Terminal ID is required")
                        return
                    }

                    const isActive = card.dataset.active !== "false"

                    const { isConfirmed } = await Swal.fire({
                        icon: "question",
                        title: isActive
                            ? "Disable this terminal?"
                            : "Enable this terminal?",
                        html: `
                            This terminal will be <b>${ isActive ? "excluded from" : "included in" }</b>
                            the automatic data updates.
                            <br><br>
                            Are you sure you want to continue?
                        `,
                        showCancelButton: true,
                        confirmButtonText: isActive ? "Disable terminal" : "Enable terminal",
                        cancelButtonText: "Cancel"
                    })
                        
                    if (!isConfirmed) return

                    const { result } = await fetchWithHandler({
                        action: "/admin/terminals/toggle-activity",
                        method: "post",
                        body: { id }
                    }) || {}

                    if (result) {
                        await Swal.fire({ icon: "success", title: "Successfully updated!",
                            toast: true, timer: 1500, timerProgressBar: true })

                        card.dataset.active = !isActive
                        btn.textContent = isActive ? "Enable" : "Turn Off"
                    } else {
                        await Swal.fire({ icon: "error", title: "Something went wrong!",
                            toast: true, timer: 2500, timerProgressBar: true })
                        return
                    }

                } catch (error) {
                    console.log("❌ Couldn't update: ", error.message || error)
                    await Swal.fire({ icon: "error", title: "Request failed",
                        text: error?.message || "An unexpected error occurred." })
                }                
            } else if (e.target.closest("button[name='sync']")) {
                // Ручна синхронізація

                await Swal.fire({ icon: "info", title: "Eventually, this will work too...",
                    toast: true, timer: 3500, timerProgressBar: true })
            }
        
        })


        // Реакція на query типу "?terminal=t5"
        const chkSelector = "input[type='checkbox'][value='total'][data-selector]:checked"
        const checked = terminalsList.querySelectorAll(chkSelector)
        if (checked.length) checked[0].dispatchEvent(new Event("click", { bubbles: true }))
        
    })
}