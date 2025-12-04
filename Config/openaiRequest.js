const OpenAI = require("openai")
const client = new OpenAI({ apiKey: process.env.OPENAI_KEY })


const getPrompt = (data = {}) => {
    return `
        You are a truck part listing generator.

        STYLE:
        - Output must be a single catalog-style line (10-15 words).
        - Use short, factual phrases separated by " | ".
        - Do not use full sentences or articles ("the", "a", "an").
        - Avoid marketing adjectives (no "premium", "durable", "top-quality").
        - Maintain OEM order references exactly as provided.
        - Capitalize labels you use (makes, models, cats, subcats).

        TASK:
        1. If OEM part number is provided, use it as the main reference.
        2. If ELI (Existing Listing Information) is provided and relevant, use it as base and enrich with structured fields.
        3. If no ELI, rely only on structured data — do not invent features.
        4. Include when relevant:
        - Material or finish (chrome, steel, plastic, etc.)
        - Functional or design notes (heated, w/ bug screen, W/O emblem, etc.)
        - Compatibility (make, model, year)
        - OEM number
        5. Use default units: inches for size, pounds for weight.
        6. Always return **one line**, not a full sentence.

        OUTPUT Examples:
        1. LH LED Headlight F01096-L - Chrome Projector | Fits Volvo VNL 2018-2025.
        2. LED Right Headlight Assembly - Black Housing | Fits Freightliner Cascadia 2018+.
        3.Fuel Injector F00710S268 - OEM RA4720701187 / RA4600701387 | Fits Freightliner & Western Star DD15/DD13.
        4. Silicone Hose F01616S09 - 82 mm x 150 mm 5 Hump 4 Ring w/ Flanges | Fits Volvo Trucks.
        5. Automatic Slack Adjuster F01635 - 1-1/2" 28 Spline, 5-1/2" Arm | Replaces 138.2810, AS1140.
        6. Shock Absorber S-25436 - OEM M89430 | Fits Hendrickson Suspension Systems 2000-2025.
        7. Engine Air Filter 03-42776-010 - OEM 0342776010 | Fits Freightliner Cascadia 2018-2025.
        8. Passenger Side Chrome Hood Mirror with Heater - Fits 2019+ Volvo VNL 84723683.
        9. Volvo Left Hood Mirror for 2019+ Volvo VNL - Chrome Cover, Heated, OEM 82361058.
        10. RH Headlight - LED Projector with Chrome Stripe - Fits Kenworth T680 (2021+).

        INPUT: ${ JSON.stringify(data, null, 2) }

        OUTPUT:
    `
}



// Повертає згенерований AI лістинг на основі переданих характеристик
const getListing = async (data = {}) => {
    const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
            { role: "system", content: "You generate concise, factual truck part listings." },
            { role: "user", content: getPrompt(data) }
        ],
        temperature: 0.4,
    })

    return response.choices[0].message.content
}



const getMarkdownPrompt = (data = "") => {
    return `You are a **Markdown Transformer**.

    Your job is to take the INPUT text (a raw listing) and apply Markdown formatting **strictly following the structure and logic shown in the EXAMPLE**.

    ### ❗️ Very important rules:
    1. **Do NOT rewrite, change, shorten, expand, or rephrase any text in the INPUT.**  
    Only add Markdown tags (##, *, **, >>, etc.) where appropriate, based on the EXAMPLE's structure.

    2. You are allowed to DELETE ONLY these phrases (including their variations):  
    - "Product Description"  
    - "Specifications"  
    - "Product Specification"

    3. Preserve the INPUT text content exactly as it is (words, sentences, order).

    4. **Match the Markdown formatting style of the EXAMPLE**, including:
    - Headings: \`## Title\`
    - Bulleted lists using: \`* \`
    - Attribute/value blocks using:  
        \`>> Attribute: **Value**\`
    - Section headers (“Vehicle Compatibility”, etc.)

    5. **Respect line breaks exactly**:
    - A single \`\\n\` means lines should be merged in HTML (no new paragraph).  
    - A double \`\\n\\n\` forces a new paragraph.  
    You must maintain or add \`\\n\` and \`\\n\\n\` exactly where needed so the final Markdown matches the EXAMPLE formatting behavior.

    6. If a section of the INPUT matches a section in the EXAMPLE, format it the same way.

    7. If the INPUT contains lines that are not present in the EXAMPLE structure,  
    format them in the *closest matching style* (list, section, compatibility block, etc.).

    ---

    ### ✅ EXAMPLE MARKDOWN FORMAT:
    (You must follow this EXACT style)

    ## Front Fairing Lower Step - Aluminum (Fits Volvo VNL 2018 & Newer)
    Upgrade your Volvo VNL with this high-strength aluminum Front Fairing Lower Step, engineered to restore factory fitment while providing long-lasting durability. Designed for Volvo VNL models **from 2018 to 2025**, this step maintains a clean, OEM-style look and installs with ease - no modifications are required.

    Perfect for fleets, body shops, and owner-operators looking to replace cracked, corroded, or worn lower fairing steps.

    * **OEM Fit & Finish**.
    Precisely manufactured to match factory dimensions for seamless integration.

    * **Rust-Resistant Aluminum Construction**.
    Built to withstand harsh road conditions, moisture, and salt exposure.

    * **Heavy-Duty Strength**.
    Supports repeated daily use in commercial trucking environments.

    * **Universal LH/RH Fitment**.
    Designed to fit the lower front fairing position on either driver or passenger side.

    * **Easy Bolt-On Installation**.
    Direct replacement - no cutting, welding, or custom adjustments needed.

    ## Vehicle Compatibility
    Make: **Volvo**

    Model: VNL

    Years: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025
    >> Position: **Lower Front Fairing (Universal Left/Right)**

    Cross-Reference / Part Numbers
    >> 20489697, 82748368, 82744212

    ---

    ### 🔽 INPUT (raw listing to transform into Markdown):
    ${ data }

    ---
    ### 🔽 OUTPUT:
    Return ONLY the final Markdown. No explanations.`
}



// Повертає згенерований AI Markdown лістинг на основі переданого лістингу
const getMarkDownListing = async (data = {}) => {
    const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
            { role: "user", content: getMarkdownPrompt(data) }
        ],
        temperature: 0.0
    })

    return response.choices[0].message.content
}



module.exports = {
    client,
    getPrompt,
    getListing,
    getMarkDownListing,
}