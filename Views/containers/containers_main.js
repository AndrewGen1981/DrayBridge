import { fetchWithHandler } from "/__errorHandler.js"


const newContainers = document.getElementById("new_containers")
const validationResults = document.getElementById("validation_results")
const validationIndicator = document.getElementById("indicator")


let prevValue
let inputTimer


async function validateContainerNumbers() {
    if (!newContainers?.value?.trim()) {
        if (validationResults) validationResults.innerHTML = ""
        return
    }

    try {
        const numbers = newContainers.value
            .toUpperCase()
            .trim()
        
        if (numbers === prevValue) return

        if (validationIndicator) validationIndicator.hidden = false
        prevValue = numbers

        // test entered container numbers
        const { result } = await fetchWithHandler({
            action: "/admin/containers/validate-numbers",
            method: "POST",
            body: {
                numbers,
                options: {
                    isExists: true
                }
            },
        }) || {}

        if (result?.tokens?.length) {
            const newValue = result.tokens.join(", ")
            newContainers.value = newValue
            prevValue = newValue

            if (!validationResults) return

            const pl = (n) => n > 1 ? "s" : ""

            const html = Object.entries(result)
                .reduce((acc, [k, v]) => {
                    const l = v.length
                    return k !== "tokens" && l
                        ? acc + `
                            <li data-${ k }>
                                <b>${ k }</b> token${ pl(l) }(${ l }): ${ v.join(", ") }
                            </li>
                        `
                        : acc
                }, "").trim()

            validationResults.innerHTML = html
            validationResults.hidden = !Boolean(html.length)
        }
    } catch (error) {
        console.log("❌ Couldn't validate: ", error.message || error)
        await Swal.fire({ icon: "error", title: "Request failed",
            text: error?.message || "An unexpected error occurred." })
    } finally {
        if (validationIndicator) validationIndicator.hidden = true
    }
}


if (newContainers) {
    newContainers.addEventListener("blur", validateContainerNumbers)
    newContainers.addEventListener("input", () => {
        clearTimeout(inputTimer)
        inputTimer = setTimeout(() => {
            validateContainerNumbers()
        }, 2000)
    })
}