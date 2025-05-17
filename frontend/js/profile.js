// frontend/js/profile.js

import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const profileTab = document.getElementById('profileTab');
const passwordTab = document.getElementById('passwordTab');
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
const changeSec = document.getElementById('changeSection');
const resetSec = document.getElementById('resetSection');
const sendOtpBtn = document.getElementById('sendOtp');
const usernameInput = document.getElementById('username');
const usernameHelp = (() => {
    let el = document.getElementById('usernameHelp');
    if (!el) {
        el = document.createElement('p');
        el.id = 'usernameHelp';
        el.className = 'info-text';
        usernameInput.parentNode.appendChild(el);
    }
    return el;
})();

// Helper: days since a given date string
function daysSince(dateStr) {
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Helper: sanitize to lowercase a–z & 0–9 only
function sanitizeUsername(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

// Tab switching
function switchTab(tab) {
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');
}
profileTab.onclick = () => switchTab('profile');
passwordTab.onclick = () => switchTab('password');

// Safe fetch alias
async function safeFetch(...args) {
    return apiFetch(...args);
}

// Load and render user profile
async function loadProfile() {
    try {
        const { user } = await safeFetch('/api/users/me');

        // Fill static fields
        document.getElementById('userName').textContent = user.name;
        ['name', 'phone', 'gender', 'age', 'email', 'uid']
            .forEach(field => {
                const el = document.getElementById(field);
                if (el) el.value = user[field] || '';
            });

        // Username
        usernameInput.value = user.username || '';
        usernameHelp.textContent = '';

        // Change-limit logic (3 changes per 30 days)
        const role = user.role;
        const changeCount = user.usernameChangeCount ?? 0;
        const windowStart = user.usernameChangeWindowStart;
        const daysUsedWindow = daysSince(windowStart);
        const daysLeftWindow = Math.max(0, 30 - daysUsedWindow);
        const changesLeft = Math.max(0, 3 - changeCount);

        // Only category-admin & usher are rate-limited
        if (['category-admin', 'usher'].includes(role)) {
            if (changesLeft <= 0 && daysLeftWindow > 0) {
                usernameInput.disabled = true;
                usernameHelp.textContent =
                    `No username changes left. Try again in ${daysLeftWindow} day${daysLeftWindow > 1 ? 's' : ''}.`;
            } else {
                usernameInput.disabled = false;
                usernameHelp.textContent =
                    `${changesLeft} username change${changesLeft !== 1 ? 's' : ''} left in next ${daysLeftWindow} day${daysLeftWindow > 1 ? 's' : ''}.`;
            }
        } else {
            // developers & admins always allowed
            usernameInput.disabled = false;
        }

        // Display category & role labels
        document.getElementById('categoryType').value = user.categoryType || '';
        const roleMap = {
            developer: 'Developer',
            admin: 'Admin',
            'category-admin': 'Head',
            usher: 'Member'
        };
        document.getElementById('role').value = roleMap[role] || role;

    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

// Initial load
loadProfile();


// ——— PROFILE SAVE —————————
profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    showToast('success', 'Saving profile…', true);

    try {
        // Gather payload
        const rawUsername = e.target.username.value.trim();
        const payload = {
            name: e.target.name.value.trim(),
            phone: e.target.phone.value.trim() || null,
            gender: e.target.gender.value,
            age: e.target.age.value || null,
            email: e.target.email.value.trim(),
            username: rawUsername ? sanitizeUsername(rawUsername) : undefined
        };

        await safeFetch('/api/users/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        showToast('success', 'Profile updated');
        // Reload to refresh limits/counters
        await loadProfile();

    } catch (err) {
        console.error(err);

        // Handle server-side rate-limit message
        if (err.message.includes('3 times') || err.message.includes('30-day')) {
            showToast('error', err.message);
            // Re-render help text
            const match = err.message.match(/in (\d+) day/);
            const days = match ? Number(match[1]) : 0;
            usernameInput.disabled = true;
            usernameHelp.textContent =
                `No username changes left. Try again in ${days} day${days > 1 ? 's' : ''}.`;
        } else {
            showToast('error', err.message);
        }
    }
});


// ——— PASSWORD & OTP (unchanged) —————————
// ... existing passwordForm submit, sendOtpBtn click, toggle-password handlers ...
// Keep your current logic for change-password, reset-password & OTP flows.


// ——— Password & OTP Reset ————————————

passwordForm.addEventListener('submit', async e => {
    e.preventDefault();

    // Direct password change
    if (!changeSec.classList.contains('hidden')) {
        const oldPw = document.getElementById('currentPw').value.trim();
        const newPw = document.getElementById('newPw').value.trim();
        const confirm = document.getElementById('confirmPw').value.trim();

        if (!oldPw || !newPw || !confirm) {
            showToast('error', 'All password fields are required');
            return;
        }
        if (!validatePassword(newPw)) return;
        if (newPw !== confirm) {
            showToast('error', 'New passwords do not match');
            return;
        }

        showToast('success', 'Updating password…', true);
        try {
            await safeFetch('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
            });
            showToast('success', 'Password updated successfully');
            clearFields(['currentPw', 'newPw', 'confirmPw']);
        } catch (err) {
            console.error('Error changing password:', err);
            const msg = err.message === 'Old password is incorrect' ?
                'Incorrect current password' :
                err.message;
            showToast('error', msg);
        }
    }

    // OTP‑based reset
    else {
        const email = document.getElementById('resetIdentifier').value.trim();
        const code = document.getElementById('resetCode').value.trim();
        const newPw = document.getElementById('resetNewPw').value.trim();

        if (!email || !code || !newPw) {
            showToast('error', 'Please fill all reset fields');
            return;
        }
        if (!validatePassword(newPw)) return;

        showToast('success', 'Resetting password…', true);
        try {
            await safeFetch('/api/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ email, code, newPassword: newPw })
            });
            showToast('success', 'Password reset successfully');
            clearFields(['resetIdentifier', 'resetCode', 'resetNewPw']);
            resetSec.querySelector('.otp-step2').classList.add('hidden');
            changeSec.classList.remove('hidden');
            refreshResetState();
        } catch (err) {
            console.error('Error resetting via OTP:', err);
            showToast('error', err.message);
        }
    }
});

// ——— Send OTP ————————————————

sendOtpBtn.onclick = async () => {
    const email = document.getElementById('resetIdentifier').value.trim();
    if (!email) {
        showToast('error', 'Enter your email or phone to receive OTP');
        return;
    }

    showToast('success', 'Sending OTP…', true);
    try {
        await safeFetch('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        resetSec.querySelector('.otp-step1').classList.add('hidden');
        resetSec.querySelector('.otp-step2').classList.remove('hidden');
        resetSec.querySelectorAll('.otp-step2 input, .otp-step2 button')
            .forEach(el => el.disabled = false);
        showToast('success', 'OTP sent! Check your inbox.');
    } catch (err) {
        console.error('Error sending OTP:', err);
        showToast('error', err.message);
    }
};

// ——— Toggle‑password Visibility ————————————

document.querySelectorAll('.toggle-password').forEach(btn =>
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
    })
);