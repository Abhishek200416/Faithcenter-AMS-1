// base.js

// 1) Make sure your HTML <body> wraps everything in:
//    <div id="app-root" class="hidden">…your UI…</div>
// 2) In base.css (at the very top):
//    .hidden { visibility: hidden; }

import { getToken, apiFetch as originalApiFetch } from './utils.js';

/**
 * Decode a JWT payload without validation.
 * @param {string} token
 * @returns {object|null}
 */
function parseJwt(token) {
    try {
        const [, payload] = token.split('.');
        return JSON.parse(atob(payload));
    } catch {
        return null;
    }
}

// 3) Read and decode the stored JWT synchronously
const token = getToken();
const claims = token ? parseJwt(token) : null;
const initialRole = claims?.role;

// 4) Immediately apply role-based hides (no network)
if (initialRole) {
    // Members & Ushers never see Manage Users
    if (['usher', 'member'].includes(initialRole)) {
        document.querySelectorAll(
            '.nav-links a[href="manageUsers.html"],' +
            ' .mobile-menu a[href="manageUsers.html"]'
        ).forEach(el => el.style.display = 'none');
    }
    // Everyone except Developers hides Developer page
    if (initialRole !== 'developer') {
        document.querySelectorAll(
            '.nav-links a[href="developer.html"],' +
            ' .mobile-menu a[href="developer.html"]'
        ).forEach(el => el.style.display = 'none');
    }
    // Add any additional synchronous hide/show logic here
}

// 5) Reveal the UI as soon as the DOM is parsed
window.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('app-root');
    if (root) root.classList.remove('hidden');
});

// 6) Silence all console output
if (typeof console !== 'undefined') {
    console.log = console.info = console.warn = console.error = () => { };
}

// 7) Logout handler
function handleLogout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// 8) Token expiry helpers
function isTokenExpired() {
    if (!token) return false;
    const data = parseJwt(token);
    if (!data || !data.exp) return false;
    return Math.floor(Date.now() / 1000) >= data.exp;
}
function redirectIfExpired() {
    if (isTokenExpired()) handleLogout();
}

// 9) Wrapped apiFetch
export async function apiFetch(input, init) {
    const res = await originalApiFetch(input, init);
    if (res.status === 401 && isTokenExpired()) {
        handleLogout();
        return new Promise(() => { });
    }
    return res;
}

// 10) Periodic JWT expiry checks
setInterval(redirectIfExpired, 10 * 1000);

// 11) After DOM is ready, wire up UI events
document.addEventListener('DOMContentLoaded', () => {
    // Logout buttons
    document.getElementById('logout')?.addEventListener('click', handleLogout);
    document.getElementById('mobileLogout')?.addEventListener('click', handleLogout);

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    menuToggle?.addEventListener('click', () => mobileMenu.classList.toggle('show'));
    document.querySelectorAll('.mobile-menu a')
        .forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('show')));

    // Background sanity-check: verify the role server-side
    (async () => {
        try {
            const { user } = await originalApiFetch('/api/users/me');
            // If server disagrees with initialRole, you can enforce stricter behavior
            if (user.role !== initialRole) {
                // e.g., handleLogout(); or adjust DOM accordingly
            }
        } catch {
            // No-op: UI already shown
        }
    })();
});