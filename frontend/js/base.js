// auth.js

// ──────────────────────────────────────────────────────────────────────────────
// 0) SILENCE ALL CONSOLE OUTPUT IN THE BROWSER
// ──────────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined' && typeof console !== 'undefined') {
    console.log = () => { };
    console.info = () => { };
    console.warn = () => { };
    console.error = () => { };
}

// ──────────────────────────────────────────────────────────────────────────────
// 1) IMPORT & LOGOUT HANDLER
// ──────────────────────────────────────────────────────────────────────────────
import { apiFetch as originalApiFetch } from './utils.js';

function handleLogout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// ──────────────────────────────────────────────────────────────────────────────
// 2) JWT EXPIRY CHECK
// ──────────────────────────────────────────────────────────────────────────────
function isTokenExpired() {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
        const [, payload] = token.split('.');
        const { exp } = JSON.parse(atob(payload));        // exp is in seconds
        const now = Math.floor(Date.now() / 1000);        // seconds
        return exp < now;
    } catch {
        return false;
    }
}

function redirectIfExpired() {
    if (isTokenExpired()) {
        handleLogout();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 3) WRAPPED apiFetch
//    - Delegates to your original utils.js  
//    - If server returns 401 *and* token is expired → force logout  
// ──────────────────────────────────────────────────────────────────────────────
export async function apiFetch(input, init) {
    const res = await originalApiFetch(input, init);

    if (res.status === 401 && isTokenExpired()) {
        handleLogout();
        // hang forever so caller won’t try to process
        return new Promise(() => { });
    }

    return res;
}

// start periodic expiry checks every 10 seconds
setInterval(redirectIfExpired, 10 * 1000);

// ──────────────────────────────────────────────────────────────────────────────
// 4) DOM READY: WIRE UP UI AND ROLE‑BASED MENUS
//    Any errors here are now silently swallowed client‑side.
// ──────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // logout buttons
    document.getElementById('logout')?.addEventListener('click', handleLogout);
    document.getElementById('mobileLogout')?.addEventListener('click', handleLogout);

    // mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    menuToggle?.addEventListener('click', () => mobileMenu.classList.toggle('show'));
    document.querySelectorAll('.mobile-menu a')
        .forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('show')));

    (async () => {
        try {
            const { user } = await apiFetch('/api/users/me');
            if (user.role === 'usher') {
                document.querySelectorAll(
                    '.nav-links a[href="manageUsers.html"], .mobile-menu a[href="manageUsers.html"]'
                ).forEach(el => el.style.display = 'none');
            }
            if (user.role !== 'developer') {
                document.querySelectorAll(
                    '.nav-links a[href="developer.html"], .mobile-menu a[href="developer.html"]'
                ).forEach(el => el.style.display = 'none');
            }
        } catch {
            // intentionally silent
        }
    })();
});
