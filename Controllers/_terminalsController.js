// Контролер для роботи з терміналами різних портів:
// ✅ 1) термінали порту Сіетлу (t5, t18, t30...)
// 2) WUT - WASHINGTON UNITED TERMINAL MARINE
// 3) TOS - HUSKY TERMINAL & STEVEDORING


const { 
    connectSeattleTerminal,
    seattleBulkAvailabilityCheck
} = require("./_seattleTerminalsController.js")

const { 
    connectWUTTerminal,
    uswutBulkAvailabilityCheck
} = require("./_WUTTerminalsController.js")

const { 
    connectTOSTerminal,
    tosBulkAvailabilityCheck
} = require("./_TOSTerminalsController.js")




const { TERMINALS } = require("../Config/terminalsCatalog")



const bulkAvailabilityCheck = async (containerNumbers, terminalsChoice) => {
    const emptyResult = { found: [], missing: [] }

    try {
        // базові перевірки
        if (!containerNumbers || !terminalsChoice) return emptyResult

        let containers = Array.isArray(containerNumbers)
            ? containerNumbers.slice()  //  щоб створити новий, ане мутувати containerNumbers
            : [ containerNumbers ]

        // не передано список контейнерів
        if (!containers.length) return emptyResult

        const choises = Array.isArray(terminalsChoice)
            ? terminalsChoice
            : [ terminalsChoice ]

        // не передано список терміналів
        if (!choises.length) return emptyResult

        let terminals = { ...TERMINALS }
        if (!choises.includes("auto")) {
            for (let t of Object.keys(terminals)) {
                if (!choises.includes(t)) delete terminals[t]
            }
        }

        // перетворюю в ітерабельний вигляд
        terminals = Object.values(terminals)

        // список терміналів порожній
        if (!terminals.length) return emptyResult

        const results = []
        
        for (const terminal of terminals) {
            
            if (!containers.length) break

            let foundContainers = []
            
            console.log(`Checking "${ terminal.label }" | ${ terminal.key }:`)

            // Seattle group (t5, t18, t30...)
            if (terminal.group === "Seattle") {
                if (await connectSeattleTerminal(terminal, { shouldloadCookies: true })) {
                    foundContainers = await seattleBulkAvailabilityCheck(terminal, containers)
                }
            }

            // WUT
            if (terminal.group === "USWUT") {
                if (await connectWUTTerminal(terminal, { shouldloadCookies: true })) {
                    foundContainers = await uswutBulkAvailabilityCheck(terminal, containers)
                }
            }

            // TOS
            if (terminal.group === "TOS") {
                if (await connectTOSTerminal(terminal, { shouldloadCookies: true })) {
                    foundContainers = await tosBulkAvailabilityCheck(terminal, containers)
                }
            }



            // TODO: інші термінали тут



            if (foundContainers.length) {
                // якщо щось знайшов, то відсіваю знайдені із першочергового списку контейнерів,
                // найшвидший спосіб - перетворити в множину і видалити знайдені
                const theRestOfContainers = new Set(containers)
                for (const c of foundContainers) {
                    theRestOfContainers.delete(c.number)
                }
                // повертаю в масив і зберігаю знайдені результати
                containers = [...theRestOfContainers]
                results.push(...foundContainers)
            }

            if (containers.length) {
                console.log(`${ terminal.key } — containers not found: `, containers)
            }

        }

        return {
            found: results,
            missing: containers.map(c => ({ number: c, status: "missing" }))
        }

    } catch (error) {
        console.error(error)
        return emptyResult
    }
}



module.exports = {
    bulkAvailabilityCheck
}