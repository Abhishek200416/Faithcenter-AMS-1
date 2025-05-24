// frontend/js/base.js

import { getToken, apiFetch as originalApiFetch } from './utils.js';
import { startGeolocation, sendPunchCoords, checkAutoPunchOut } from './location.js';


// ─── Config ───────────────────────────────────────────────────────────────

// Paste your base64-encoded VAPID public key here:
const VAPID_PUBLIC_KEY = 'YOUR_ACTUAL_PUBLIC_KEY'; // ← Must NOT be a placeholder
console.log("Client Time:", new Date().toISOString());


// Utility from web-push docs to convert the key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        output[i] = rawData.charCodeAt(i);
    }
    return output;
}

// ─── JWT / Auth Helpers ─────────────────────────────────────────────────

function parseJwt(token) {
    try {
        const [, payload] = token.split('.');
        return JSON.parse(atob(payload));
    } catch {
        return null;
    }
}

function isTokenExpired() {
    const token = getToken();
    if (!token) return false;
    const data = parseJwt(token);
    return !!(data?.exp && Math.floor(Date.now() / 1000) >= data.exp);
}

function handleLogout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

function redirectIfExpired() {
    if (isTokenExpired()) handleLogout();
}

// ─── Wrapped Fetch ───────────────────────────────────────────────────────

export async function apiFetch(input, init) {
    const res = await originalApiFetch(input, init);
    if (res.status === 401 && isTokenExpired()) {
        handleLogout();
        return new Promise(() => { }); // hang forever
    }
    return res;
}

// ─── Permission Bootstrapping ────────────────────────────────────────────

async function requirePermissions() {
    // 1) Geolocation
    if (!navigator.geolocation) throw new Error('Geolocation not supported');
    let status = null;
    if (navigator.permissions) {
        status = await navigator.permissions.query({ name: 'geolocation' });
    }
    while (!status || status.state !== 'granted') {
        await new Promise(res =>
            navigator.geolocation.getCurrentPosition(res, () => {
                alert('Allow location to proceed');
                res();
            })
        );
        if (navigator.permissions) {
            status = await navigator.permissions.query({ name: 'geolocation' });
        }
    }

    // 2) Notifications
    while (Notification.permission !== 'granted') {
        await Notification.requestPermission();
        if (Notification.permission !== 'granted') {
            alert('Allow notifications to proceed');
        }
    }
}

// ─── Push Subscription ───────────────────────────────────────────────────

async function subscribeToPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        // send the subscription to your backend so you can later web-push to it
        await originalApiFetch('/api/users/me/push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
        });
        console.log('Push subscription saved on server');
    } catch (err) {
        console.error('Push subscription failed', err);
    }
}

async function initPushNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push APIs not fully supported');
        return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
        console.warn('Notifications permission denied');
        return;
    }
    // register your service worker
    await navigator.serviceWorker.register('/sw.js');
    // then subscribe
    await subscribeToPush();
}

// ─── Persistent Geo-Watcher ──────────────────────────────────────────────

function startGeoWatch() {
    if (!navigator.geolocation || !navigator.permissions) return;
    navigator.permissions.query({ name: 'geolocation' }).then(({ state }) => {
        if (state === 'granted') {
            navigator.geolocation.watchPosition(
                pos => {
                    localStorage.setItem('lastLat', pos.coords.latitude);
                    localStorage.setItem('lastLng', pos.coords.longitude);
                },
                err => console.error('Geo watch failed', err),
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
            );
        }
    });
}
// Check if user is currently punched in
async function checkAndAutoPunchOut() {
    // Call API to get user's last attendance status and active check
    const resp = await apiFetch('/api/attendance/active');
    if (!resp.ok) return;
    const { activeCheck, punchIn } = await resp.json();

    if (activeCheck && punchIn && !punchIn.punchOut) {
        // Get current position and check if out of radius
        navigator.geolocation.getCurrentPosition(pos => {
            const d = haversineDistance(
                pos.coords.latitude, pos.coords.longitude,
                activeCheck.latitude, activeCheck.longitude
            );
            if (d > activeCheck.radius) {
                // Auto punch-out on server
                apiFetch('/api/attendance/punch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'punch-out',
                        checkId: activeCheck.id,
                        timestamp: new Date().toISOString(),
                        status: 'auto-out'
                    })
                });
                showTile({ message: 'Auto punched out: you left the allowed area.', type: 'warning' });
            }
        });
    }
}


// ─── Silence Console (optional) ─────────────────────────────────────────

if (typeof console !== 'undefined') {
    console.log = console.info = console.warn = console.error = () => { };
}

// ─── Periodic Token‐Expiry Check ─────────────────────────────────────────

setInterval(redirectIfExpired, 10_000);

// ─── DOM READY / UI BOOTSTRAP ────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    requirePermissions().catch(console.error);
    initPushNotifications().catch(console.error);

    // Start global geolocation watcher
    startGeolocation();

    // Periodically check & punch-in automatically (every 1 min for example)
    setInterval(() => {
        sendPunchCoords().catch(console.error);
        checkAutoPunchOut().catch(console.error);
    }, 60_000);  // every minute

    // Your existing DOM ready code (unchanged)

    // 1) Ensure we have both perms
    requirePermissions().catch(console.error);

    // 2) Init service-worker + push
    initPushNotifications().catch(console.error);

    // 3) Start global geo-watch so every page keeps location up to date
    startGeoWatch();

    // 4) Role-based UI + logout + menu (unchanged)
    const root = document.getElementById('app-root');
    const token = getToken();
    const claims = token ? parseJwt(token) : null;
    const role = claims?.role;

    if (role) {
        if (['usher', 'member'].includes(role)) {
            document
                .querySelectorAll(
                    '.nav-links a[href="manageUsers.html"], .mobile-menu a[href="manageUsers.html"]'
                )
                .forEach(el => (el.style.display = 'none'));
        }
        if (role !== 'developer') {
            document
                .querySelectorAll(
                    '.nav-links a[href="developer.html"], .mobile-menu a[href="developer.html"]'
                )
                .forEach(el => (el.style.display = 'none'));
        }
    }
    if (root) root.classList.remove('hidden');
    document.getElementById('logout')?.addEventListener('click', handleLogout);
    document.getElementById('mobileLogout')?.addEventListener('click', handleLogout);
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    menuToggle?.addEventListener('click', () => mobileMenu.classList.toggle('show'));
    document.querySelectorAll('.mobile-menu a').forEach(a =>
        a.addEventListener('click', () => mobileMenu.classList.remove('show'))
    );

    // 5) Optional sanity‐check your auth
    (async () => {
        try {
            await originalApiFetch('/api/users/me');
        } catch {
            /* ignore */
        }
    })();
});
