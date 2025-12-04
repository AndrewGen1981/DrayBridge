// Відслідковує елементи форми на предмет зміни
// зберігає їх оригінальне значення та порівнює з поточним значенням
// повертає клас "modified", якщо зміни були


/**
 * Tracks changes in form input elements and adds a CSS class to modified fields.
 * 
 * Returns an object that allows you to reset visual indicators (`reset`) 
 * or retrieve the list of changed fields (`getModified`).
 *
 * @param {Object} params - Configuration object.
 * @param {string|HTMLFormElement} params.formSelectorOrForm - A CSS selector string or a direct reference to the form element.
 * @param {string|NodeList} [params.inputsSelectorOrInputs="input, textarea, select"] - A CSS selector string for form inputs, or NodeList/array of inputs.
 * @param {Object} [params.options={}] - Additional options.
 * @param {string} [params.options.modifiedClass="modified"] - The CSS class to apply to inputs that have been changed from their original value.
 *
 * @returns {Object} An object with:
 * - `reset()` {Function} — Clears the modified class from all inputs.
 * - `getModified()` {Function} — Returns an array of changed inputs in format: `{ name, value }`.
 *
 * @example
 * const tracker = trackFormElements({ formSelectorOrForm: "#myForm" });
 * const changes = tracker.getModified(); // [{ name: "email", value: "new@example.com" }]
 * tracker.reset(); // remove "modified" class from all inputs
 */

export function trackFormElements ({ formSelectorOrForm, inputsSelectorOrInputs = "input, textarea, select", options = {} }) {
    const {
        modifiedClass = "modified",
        allowedReadOnly = []    //  тут передаються id інпутів readonly, які треба відслідковувати
    } = options

    // Базові перевірки
    if (!formSelectorOrForm) return console.warn("__formTracker issue: Bad form selector")
        
    // Шукаю форму, якщо передано селектор або використовую вже передану
    const form = typeof formSelectorOrForm === "string"
    ? document.querySelector(formSelectorOrForm)
    : formSelectorOrForm

    if (!form) return console.warn(`__formTracker issue: cannot find form with "${ formSelectorOrForm }"`)

    // Шукаю інпути форми
    const inputs = typeof inputsSelectorOrInputs === "string"
    ? form.querySelectorAll(inputsSelectorOrInputs)
    : inputsSelectorOrInputs

    if (!inputs?.length) return console.warn(`__formTracker issue: cannot find form inputs with "${ inputsSelectorOrInputs }"`)
    
    const inputsMap = new Map()
    const debounceMap = new Map()

    function handler (e) {
        const input = e.target
        if (!input) return

        const { id, type, value, checked } = input || {}

        const timeout = debounceMap.get(id)
        clearTimeout(timeout)
        const newTimeout = setTimeout(() => {
            const current = inputsMap.get(id)
            if (!current) return

            const state = type === "checkbox" || type === "radio"
            // тут хитро, якщо checkbox/radio змінився, то недостатньо повернути тільки checked = true,
            // потрібно знати id цього зміненого, щоб знати який з radio вибраний, тому повертаю його id,
            // але, якщо юзер обрав той, що і був першочергово активним, то не потрібно повертати його id,
            // бо getModified відслідковує відмінність між newValue i originalValue, і перший буде помилково
            // повертатися як змінений, тому повертаємо його checked, що буде дорівнювати його originalValue = true
            ? current.originalValue ? checked : id
            : value.trim()
            
            
            // type === "radio" мають інший принцип дії, вони всі з однаковим ім*ям
            // і клас потрібно вилучити у всіх, а потім присвоїти лише поточному, якщо треба
            if (type === "radio") [...inputsMap.values()]
            .filter(i => i.input?.name === input.name)
            .forEach(i => {
                i.input.classList.remove(modifiedClass) //  видаляю клас з кожного
                i.newValue = i.originalValue    //  обнуляю значення, інакше в getModified будуть потрапляти всі, навіть хоч раз змінені і потім повернуті
            })

            input.classList.toggle(modifiedClass, current.originalValue !== state)
            if (current.newValue !== state) inputsMap.set(id, { ...current, newValue: state })

        }, 500)

        debounceMap.set(id, newTimeout)
    }


    // Додає інпути до трекеру, інпути мають бути DOM-елементами
    function addInputsToTracker(inputs = []) {
        inputs.forEach(input => {
            if ((input.disabled || input.readOnly) && !allowedReadOnly.includes(input.id)) return
    
            const state = input.type === "checkbox" || input.type === "radio" ? input.checked : input.value.trim()
            const key = input.id || new Date().getTime()
            input.id ??= key

            // уникаю дублікатів, оскільки функція може використовуватися в addInputs()
            if (!inputsMap.has(key)) {
                inputsMap.set(key, { input, originalValue: state, newValue: state })
                input.addEventListener("input", handler)
                input.addEventListener("change", handler)
            }
    
        })
    }


    // Видаляє інпути з трекеру, інпути мають бути DOM-елементами
    // в метод передається масив інпутів або ж порожній масив, щоб видалити всі
    function removeInputsFromTracker(_inputs) {
        for (const input of (_inputs || inputs || [])) {
            const id = input?.id
            if (id && inputsMap.has(id)) {
                input.removeEventListener("input", handler)
                input.removeEventListener("change", handler)
                inputsMap.delete(id)
            }
        }
    }


    // Додаю всі інпути до трекеру
    addInputsToTracker(inputs)


    return {
        // повертаю метод reset(), який знімає модифікаційний клас зі змінених полів;
        reset: () => {
            inputs.forEach(input => input.classList.remove(modifiedClass))
        },
        // повертаю метод getModified(), який повертає тільки (!) модифіковані інпути
        getModified: () => {
            return [...inputsMap.values()]
            .filter(({ originalValue, newValue }) => newValue !== originalValue )
            .map(({ input, newValue }) => ({
                name: input.name || input.id,
                value: newValue
            }))
        },
        // повертає інпут за його id
        getInput: (id) => inputsMap.get(id) || {},
        // повертає всі інпути
        getInputs: () => [...inputsMap.values()],
        // повертаю метод addInputs(), який додає інпути до трекеру, після його створення/ініту
        addInputs: addInputsToTracker,
        // повертаю метод removeInputs(), який видаляє інпути з трекеру
        removeInputs: removeInputsFromTracker
    }

}