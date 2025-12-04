import { fetchWithHandler } from "/__errorHandler.js"



// import {  } from "/__tools.js"





// Максимальна кількість на сторінці
const itemsOnPage = document.getElementById("items-on-page")
if (itemsOnPage) itemsOnPage.addEventListener("change", async () => {
    try {

        const { result, message } = await fetchWithHandler({
            action: "/admin/update-max-on-page",
            method: "POST",
            body: {
                PAGE_SIZE: itemsOnPage.value
            },
        }) || {}
    
        if (result) {
            await Swal.fire({ icon: "success", title: "Successfully updated!",
                text: message, timer: 2000, timerProgressBar: true })
            location.reload()
        }

    } catch (error) {
        console.log("❌ Personal configs update error: ", error.message || error)
        await Swal.fire({ icon: "error", title: "Request failed",
            text: error?.message || "An unexpected error occurred." })
    }

})