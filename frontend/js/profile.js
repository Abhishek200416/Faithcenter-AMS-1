// File: public/js/profile.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

// ——————————————————————————————————————————————————————————————————
// Helpers
// ——————————————————————————————————————————————————————————————————
/** Strip to lowercase a–z & 0–9 only */
function sanitizeUsername(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Return whole days since ISO date string */
function daysSince(dateStr) {
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ——————————————————————————————————————————————————————————————————
// DOM Refs
// ——————————————————————————————————————————————————————————————————
const profileTab = document.getElementById('profileTab');
const passwordTab = document.getElementById('passwordTab');
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');
const forgotLink = document.getElementById('forgotLink');
const sendVerifyBtn = document.getElementById('sendVerifyBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const resetPwBtn = document.getElementById('resetPwBtn');


const usernameInput = document.getElementById('username');
const usernameHelp = (() => {
    let p = document.getElementById('usernameHelp');
    if (!p) {
        p = document.createElement('p');
        p.id = 'usernameHelp';
        p.className = 'info-text';
        usernameInput.parentNode.appendChild(p);
    }
    return p;
})();

// feedback lines
const [profileError, profileSuccess, passwordError, passwordSuccess] =
    ['profileError', 'profileSuccess', 'passwordError', 'passwordSuccess']
        .map(id => document.getElementById(id));

// ——————————————————————————————————————————————————————————————————
// Tab Switching
// ——————————————————————————————————————————————————————————————————
function switchTab(tab) {
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');
    // always reset to direct-change on tab switch
    showStep(1);
    [profileError, profileSuccess, passwordError, passwordSuccess].forEach(el => el.textContent = '');
}

profileTab.onclick = () => switchTab('profile');
passwordTab.onclick = () => switchTab('password');

// ——————————————————————————————————————————————————————————————————
// Password Reset Wizard
// ——————————————————————————————————————————————————————————————————
function showStep(n) {
    [step1, step2, step3, step4].forEach((el, i) => {
        el.classList.toggle('hidden', i + 1 !== n);
    });
    passwordError.textContent = '';
    passwordSuccess.textContent = '';
}

// “Forgot password?” → step 2
forgotLink.addEventListener('click', e => {
    e.preventDefault();
    showStep(2);
});

// Step 2 → send verification code
sendVerifyBtn.addEventListener('click', async () => {
    const identifier = document.getElementById('resetIdentifier').value.trim();
    if (!identifier) {
        showToast('error', 'Please enter your email or phone');
        return;
    }
    try {
        showToast('success', 'Sending code…', true);
        await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        showToast('success', 'Code sent!');
        showStep(3);
    } catch (err) {
        showToast('error', err.message);
    }
});

// Step 3 → verify OTP
verifyOtpBtn.addEventListener('click', async () => {
    const identifier = document.getElementById('resetIdentifier').value.trim();
    const code = document.getElementById('resetCode').value.trim();
    if (!/^\d{4,6}$/.test(code)) {
        showToast('error', 'Enter a valid code');
        return;
    }
    try {
        showToast('success', 'Verifying…', true);
        await apiFetch('/api/auth/verify-reset-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, code })
        });
        showToast('success', 'Verified!');
        showStep(4);
    } catch (err) {
        showToast('error', err.message);
    }
});

// Step 4 → set new password
resetPwBtn.addEventListener('click', async () => {
    const identifier = document.getElementById('resetIdentifier').value.trim();
    const code = document.getElementById('resetCode').value.trim();
    const newPw = document.getElementById('resetNewPw').value.trim();
    const confPw = document.getElementById('resetConfirmPw').value.trim();
    if (!newPw || newPw !== confPw) {
        showToast('error', 'Passwords must match');
        return;
    }
    try {
        showToast('success', 'Resetting…', true);
        await apiFetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, code, newPassword: newPw })
        });
        showToast('success', 'Password reset! Please log in.');
        switchTab('profile');
    } catch (err) {
        showToast('error', err.message);
    }
});

// ——————————————————————————————————————————————————————————————————
// Load & Render Profile
// ——————————————————————————————————————————————————————————————————
async function loadProfile() {
    try {
        const { user } = await apiFetch('/api/users/me');

        // banner
        document.getElementById('userName').textContent = user.name;

        // basic fields
        ['name', 'phone', 'gender', 'age', 'email', 'uid', 'categoryType', 'role']
            .forEach(f => {
                const el = document.getElementById(f);
                if (el) el.value = user[f] ?? '';
            });

        // username + cooldown
        usernameInput.value = user.username;
        usernameHelp.textContent = '';
        const elapsed = daysSince(user.usernameChangedAt);
        const daysLeft = Math.max(0, 30 - elapsed);
        if (['category-admin', 'usher'].includes(user.role)) {
            usernameInput.disabled = daysLeft > 0;
            usernameHelp.textContent = daysLeft > 0
                ? `You have ${daysLeft} day${daysLeft > 1 ? 's' : ''} until next username change.`
                : '';
        } else {
            usernameInput.disabled = false;
        }
    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

// ——————————————————————————————————————————————————————————————————
// Profile Save Handler
// ——————————————————————————————————————————————————————————————————
profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    showToast('success', 'Saving profile…', true);

    try {
        const payload = {
            name: e.target.name.value.trim(),
            phone: e.target.phone.value.trim() || null,
            gender: e.target.gender.value,
            age: e.target.age.value ? +e.target.age.value : null,
            email: e.target.email.value.trim(),
            username: sanitizeUsername(usernameInput.value) || undefined
        };

        await apiFetch('/api/users/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        showToast('success', 'Profile updated');
        await loadProfile();
    } catch (err) {
        console.error(err);
        showToast('error', err.message);
        if (err.message.includes('30-day')) {
            const days = err.message.match(/\d+/)?.[0];
            if (days) {
                usernameHelp.textContent = `You can change your username in ${days} day${days > 1 ? 's' : ''}.`;
            }
        }
    }
});

// ——————————————————————————————————————————————————————————————————
// Username Input Sanitization
// ——————————————————————————————————————————————————————————————————
usernameInput.addEventListener('input', () => {
    usernameInput.value = sanitizeUsername(usernameInput.value);
});

// ——————————————————————————————————————————————————————————————————
// Toggle-password visibility (works for all steps)
// ——————————————————————————————————————————————————————————————————
document.querySelectorAll('.toggle-password').forEach(btn =>
    btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
    })
);

// ——————————————————————————————————————————————————————————————————
// Init
// ——————————————————————————————————————————————————————————————————
(async function init() {
    switchTab('profile');
    await loadProfile();
})();
