// --- Утиліти для fetch

// стандартний fetch (на відміну від axaj) не "вміє" обробляти системну помилку 'ETIMEDOUT', тобто, якщо
// ресурс (термінал в даному випадку) довго не відповідатиме, то це може призвести до системної помилки
// всього додатку або його перманентного "зависання". Тому, модифікую стандартний fetch наступним чином:

//  🛠️ вмітиме розривати з*єднання по timeout = standartTimeout (можна передавати як
// параметр, але нормальним вважається час очікування 5-10с);

//  🛠️ вмітиме робити повторну спробу під*єднатися, якщо N (retries) разів, якщо попередня
// спроба повернула 'ETIMEDOUT'



const DEFAULT_TIMEOUT = 8000

const DEFAULT_RETRIES_DELAY = 300
const DEFAULT_RETRIES = 3


async function fetchSmart (
    url,
    options = {},
    {
        timeout = DEFAULT_TIMEOUT,
        retries = DEFAULT_RETRIES,
        retryDelay = DEFAULT_RETRIES_DELAY,
        fetchFunc = fetch,  //  🧩 зроблено для fetchCookie(nodeFetch, jar) або ж спрацьовуватиме стандартний fetch, якщо не перекрито
    } = {}
) {

    for (let attempt = 0; attempt <= retries; attempt++) {

        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), timeout)

        try {
            const res = await fetchFunc(url, {
                ...options,
                signal: controller.signal
            })

            clearTimeout(id)
            return res

        } catch (err) {
            clearTimeout(id)

            const isTimeout = err.name === "AbortError"
            const isNetwork =
                err.code === "ECONNRESET" ||
                err.code === "ENOTFOUND" ||
                err.code === "ECONNREFUSED" ||
                err.type === "system"

            const canRetry = attempt < retries && (isNetwork || isTimeout)

            if (!canRetry) {
                throw err
            }

            // 🔥 експоненційний бекофф - з кожною наступною спробою чекає довше
            const delay = retryDelay * 2 ** attempt
            await new Promise(r => setTimeout(r, delay))
        }
    }
}


module.exports = {
    fetchSmart
}