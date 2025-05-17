// public/js/profile.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

// — Helpers ——————————————————————————————————
function sanitizeUsername(str) {
    return String(str || '').trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}
function daysSince(dateStr) {
    return Math.floor((Date.now() - new Date(dateStr).getTime())
        / (1000 * 60 * 60 * 24));
}

// — DOM refs ——————————————————————————————————
const profileTab = document.getElementById('profileTab');
const passwordTab = document.getElementById('passwordTab');
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

const updatePwBtn = document.getElementById('updatePwBtn');
const forgotLink = document.getElementById('forgotLink');
const sendVerifyBtn = document.getElementById('sendVerifyBtn');
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

const [profileError, profileSuccess, passwordError, passwordSuccess] =
    ['profileError', 'profileSuccess', 'passwordError', 'passwordSuccess']
        .map(id => document.getElementById(id));

// — Tab switching ——————————————————————————————
function switchTab(tab) {
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');
    showStep(1);
    [profileError, profileSuccess, passwordError, passwordSuccess]
        .forEach(el => el.textContent = '');
}

profileTab.onclick = () => switchTab('profile');
passwordTab.onclick = () => switchTab('password');

// — Step logic —————————————————————————————————————
function showStep(n) {
    [step1, step2, step3].forEach((el, i) => {
        el.classList.toggle('hidden', i + 1 !== n);
    });
    passwordError.textContent = passwordSuccess.textContent = '';
}

// — STEP 1: direct‐change ——————————————————————————
updatePwBtn.addEventListener('click', async () => {
    const oldPw = document.getElementById('currentPw').value.trim();
    const newPw = document.getElementById('newPw').value.trim();
    const conf = document.getElementById('confirmPw').value.trim();

    if (!oldPw || !newPw || !conf) {
        return showToast('error', 'All password fields are required');
    }
    if (newPw !== conf) {
        return showToast('error', 'New passwords do not match');
    }

    try {
        showToast('success', 'Updating password…', true);
        await apiFetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
        });
        showToast('success', 'Password updated');
        // clear
        ['currentPw', 'newPw', 'confirmPw']
            .forEach(id => document.getElementById(id).value = '');
        switchTab('profile');
    } catch (err) {
        showToast('error', err.message);
    }
});

// “Forgot password?” → Step 2
forgotLink.addEventListener('click', e => {
    e.preventDefault();
    showStep(2);
});

// — STEP 2: send reset code —————————————————————————
sendVerifyBtn.addEventListener('click', async () => {
    const identifier = document.getElementById('resetIdentifier').value.trim();
    if (!identifier) {
        return showToast('error', 'Please enter your email or phone');
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

// — STEP 3: reset with code + new password —————————————————
resetPwBtn.addEventListener('click', async () => {
    const code = document.getElementById('resetCode').value.trim();
    const newPw = document.getElementById('resetNewPw').value.trim();
    const conf = document.getElementById('resetConfirmPw').value.trim();

    if (!/^\d{4,6}$/.test(code)) {
        return showToast('error', 'Enter a valid code');
    }
    if (!newPw || newPw !== conf) {
        return showToast('error', 'Passwords must match');
    }

    try {
        showToast('success', 'Resetting…', true);
        await apiFetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: document.getElementById('resetIdentifier').value.trim(),
                code,
                newPassword: newPw
            })
        });
        showToast('success', 'Password reset! Please log in.');
        switchTab('profile');
    } catch (err) {
        showToast('error', err.message);
    }
});

// — Load & render profile —————————————————————————
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
        const daysLeft = Math.max(0, 30 - daysSince(user.usernameChangedAt));
        if (['category-admin', 'usher'].includes(user.role)) {
            usernameInput.disabled = daysLeft > 0;
            usernameHelp.textContent = daysLeft > 0
                ? `You can change your username in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.`
                : '';
        } else {
            usernameInput.disabled = false;
        }
    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

// — Profile‐save handler —————————————————————————
profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
        await apiFetch('/api/users/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: e.target.name.value.trim(),
                phone: e.target.phone.value.trim() || null,
                gender: e.target.gender.value,
                age: e.target.age.value ? +e.target.age.value : null,
                email: e.target.email.value.trim(),
                username: sanitizeUsername(usernameInput.value) || undefined
            })
        });
        showToast('success', 'Profile updated');
        await loadProfile();
    } catch (err) {
        showToast('error', err.message);
        if (err.message.includes('30-day')) {
            const days = err.message.match(/\d+/)?.[0];
            usernameHelp.textContent =
                `You can change your username in ${days} day${days > 1 ? 's' : ''}.`;
        }
    }
});

// — Username input sanitization ——————————————————————
usernameInput.addEventListener('input', () => {
    usernameInput.value = sanitizeUsername(usernameInput.value);
});

// — Toggle‐password buttons —————————————————————————
document.querySelectorAll('.toggle-password')
    .forEach(btn => btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
    }));

// — Init ———————————————————————————————————————
(async function init() {
    switchTab('profile');
    await loadProfile();
})();
