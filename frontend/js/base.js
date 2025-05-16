import { getToken, apiFetch as originalApiFetch } from './utils.js';

// JWT decode helper
function parseJwt(token) {
    try {
        const [, payload] = token.split('.');
        return JSON.parse(atob(payload));
    } catch {
        return null;
    }
}

// Token expiry helpers
function isTokenExpired() {
    const token = getToken(); // Always get the latest token
    if (!token) return false;
    const data = parseJwt(token);
    if (!data || !data.exp) return false;
    return Math.floor(Date.now() / 1000) >= data.exp;
}
function redirectIfExpired() {
    if (isTokenExpired()) handleLogout();
}

// Logout handler
function handleLogout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// Wrapped apiFetch
export async function apiFetch(input, init) {
    const res = await originalApiFetch(input, init);
    if (res.status === 401 && isTokenExpired()) {
        handleLogout();
        return new Promise(() => { });
    }
    return res;
}

// Silence all console output
if (typeof console !== 'undefined') {
    console.log = console.info = console.warn = console.error = () => { };
}

// Periodic JWT expiry checks
setInterval(redirectIfExpired, 10 * 1000);

// DOMContentLoaded = ALL DOM logic
window.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('app-root');
    const token = getToken();
    const claims = token ? parseJwt(token) : null;
    const initialRole = claims?.role;

    // Role-based hides
    if (initialRole) {
        if (['usher', 'member'].includes(initialRole)) {
            document.querySelectorAll(
                '.nav-links a[href="manageUsers.html"],' +
                ' .mobile-menu a[href="manageUsers.html"]'
            ).forEach(el => el.style.display = 'none');
        }
        if (initialRole !== 'developer') {
            document.querySelectorAll(
                '.nav-links a[href="developer.html"],' +
                ' .mobile-menu a[href="developer.html"]'
            ).forEach(el => el.style.display = 'none');
        }
        // Add more role logic if needed
    }

    // Reveal UI only after all hiding
    if (root) root.classList.remove('hidden');

    // Logout buttons
    document.getElementById('logout')?.addEventListener('click', handleLogout);
    document.getElementById('mobileLogout')?.addEventListener('click', handleLogout);

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    menuToggle?.addEventListener('click', () => mobileMenu.classList.toggle('show'));
    document.querySelectorAll('.mobile-menu a')
        .forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('show')));

    // Server role sanity check
    (async () => {
        try {
            const { user } = await originalApiFetch('/api/users/me');
            // If server disagrees, optionally: handleLogout() or adjust UI
        } catch {
            // No-op: UI already shown
        }
    })();
});
