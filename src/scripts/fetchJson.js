function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url, options = {}, { attempts = 10, delayMs = 500 } = {}) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            lastError = new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
        } catch (error) {
            lastError = error;
        }

        if (attempt < attempts) {
            await wait(delayMs);
        }
    }

    throw new Error(`Failed to fetch ${url} after ${attempts} attempts: ${lastError?.message || lastError}`);
}

export async function fetchJson(url, options = {}, retryOptions = {}) {
    const response = await fetchWithRetry(url, options, retryOptions);

    try {
        return await response.json();
    } catch (error) {
        throw new Error(`Invalid JSON from ${url}: ${error.message}`);
    }
}
