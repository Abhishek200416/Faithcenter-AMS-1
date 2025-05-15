// js/utils.js

/**
 * Save auth token to localStorage
/**
 * Save auth token to localStorage
 */
export function saveToken(token) {
    localStorage.setItem('authToken', token);
}

/**
 * Retrieve auth token
 */
export function getToken() {
    return localStorage.getItem('authToken');
}

/**
 * Wrapper around fetch:
 *  • adds JSON headers
 *  • adds Bearer token if present
 *  • if 401 comes back, clear storage and redirect immediately
 *  • otherwise throws on non‑2xx
 */
export async function apiFetch(path, opts = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    // 1️⃣ Perform the actual fetch
    let res;
    try {
        res = await fetch(path, {
            ...opts,
            headers,
            credentials: 'include'
        });
    } catch (networkErr) {
        // network errors, DNS failures, etc.
        console.warn('Network error:', networkErr);
        throw networkErr;
    }

    // 2️⃣ If the server says “Unauthorized”, we know the token is bad/expired
    if (res.status === 401) {
        localStorage.clear();
        // hard redirect to login
        window.location.href = 'login.html';
        // return a never‑resolving promise so no downstream code runs
        return new Promise(() => {});
    }

    // 3️⃣ Otherwise read the body and parse JSON
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    // 4️⃣ If non‑2xx, throw with the server‑provided message
    if (!res.ok) {
        const msg = data.message || res.statusText;
        throw new Error(msg);
    }

    // 5️⃣ Finally, return the parsed JSON
    return data;
}