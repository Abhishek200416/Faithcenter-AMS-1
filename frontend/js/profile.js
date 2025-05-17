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
const changeSec = document.getElementById('changeSection');
const resetSec = document.getElementById('resetSection');
const sendOtpBtn = document.getElementById('sendOtp');
const showResetLink = document.getElementById('showReset');

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

const [profileError, profileSuccess, passwordError, passwordSuccess] = ['profileError', 'profileSuccess', 'passwordError', 'passwordSuccess']
.map(id => document.getElementById(id));

// ——————————————————————————————————————————————————————————————————
// Tab Switching
// ——————————————————————————————————————————————————————————————————
function switchTab(tab) {
    // Profile vs Password form
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');

    // Always reset password‐sections to “direct change” view
    changeSec.classList.remove('hidden');
    resetSec.classList.add('hidden');

    // Clear any messages
    [profileError, profileSuccess, passwordError, passwordSuccess]
    .forEach(el => el.textContent = '');
}

profileTab.onclick = () => switchTab('profile');
passwordTab.onclick = () => switchTab('password');

// ——————————————————————————————————————————————————————————————————
// Load & Render Profile
// ——————————————————————————————————————————————————————————————————
async function loadProfile() {
    try {
        const { user } = await apiFetch('/api/users/me');

        // Welcome banner
        document.getElementById('userName').textContent = user.name;

        // Fill basic fields
        ['name', 'phone', 'gender', 'age', 'email', 'uid', 'categoryType', 'role']
        .forEach(f => {
            const el = document.getElementById(f);
            if (el) el.value = user[f] || '';
        });

        // Username (no suffix logic)
        usernameInput.value = user.username;
        usernameHelp.textContent = '';

        // Cooldown logic (server enforces 3×/30d; here we show days until next allowed)
        const elapsed = daysSince(user.usernameChangedAt);
        const daysLeft = Math.max(0, 30 - elapsed);
        if (['category-admin', 'usher'].includes(user.role)) {
            usernameInput.disabled = daysLeft > 0;
            usernameHelp.textContent = daysLeft > 0 ?
                `You can change your username in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.` :
                '';
        } else {
            // dev & admin always editable
            usernameInput.disabled = false;
        }

    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

// ——————————————————————————————————————————————————————————————————
// Username Input Sanitization
// ——————————————————————————————————————————————————————————————————
usernameInput.addEventListener('input', () => {
    usernameInput.value = sanitizeUsername(usernameInput.value);
});

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
            age: e.target.age.value ? Number(e.target.age.value) : null,
            email: e.target.email.value.trim(),
            username: usernameInput.value.trim() || undefined
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
        // If server returns “3 changes in 30 days” error, it will include that text
        if (err.message.includes('30-day')) {
            const days = err.message.match(/\d+/);
            if (days) {
                usernameHelp.textContent =
                    `You can change your username in ${days[0]} days.`;
            }
        }
    }
});

// ——————————————————————————————————————————————————————————————————
// Password vs. OTP Reset Toggle
// ——————————————————————————————————————————————————————————————————
showResetLink.addEventListener('click', e => {
    e.preventDefault();
    changeSec.classList.add('hidden');
    resetSec.classList.remove('hidden');
});

// ——————————————————————————————————————————————————————————————————
// Password / OTP Submission
// ——————————————————————————————————————————————————————————————————
passwordForm.addEventListener('submit', async e => {
    e.preventDefault();

    // Direct-change section visible?
    if (!changeSec.classList.contains('hidden')) {
        // Current / New / Confirm
        const oldPw = document.getElementById('currentPw').value.trim();
        const newPw = document.getElementById('newPw').value.trim();
        const confirm = document.getElementById('confirmPw').value.trim();

        if (!oldPw || !newPw || !confirm) {
            showToast('error', 'All password fields are required');
            return;
        }
        if (newPw !== confirm) {
            showToast('error', 'New passwords do not match');
            return;
        }

        showToast('success', 'Updating password…', true);
        try {
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
            });
            showToast('success', 'Password updated');
            // Clear fields
            ['currentPw', 'newPw', 'confirmPw'].forEach(id =>
                document.getElementById(id).value = ''
            );
        } catch (err) {
            console.error('Change-password error:', err);
            const msg = err.message === 'Old password is incorrect' ?
                'Incorrect current password' :
                err.message;
            showToast('error', msg);
        }

    } else {
        // OTP-based reset
        const emailOrPhone = document.getElementById('resetIdentifier').value.trim();
        const code = document.getElementById('resetCode').value.trim();
        const newPw = document.getElementById('resetNewPw').value.trim();

        if (!emailOrPhone || !code || !newPw) {
            showToast('error', 'Please fill in all reset fields');
            return;
        }

        showToast('success', 'Resetting password…', true);
        try {
            await apiFetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: emailOrPhone,
                    code,
                    newPassword: newPw
                })
            });
            showToast('success', 'Password reset successfully');
            // Return to direct-change view
            resetSec.classList.add('hidden');
            changeSec.classList.remove('hidden');
            switchTab('profile');
        } catch (err) {
            console.error('Reset-password error:', err);
            showToast('error', err.message);
        }
    }
});

// ——————————————————————————————————————————————————————————————————
// Send OTP Button
// ——————————————————————————————————————————————————————————————————
sendOtpBtn.addEventListener('click', async() => {
    const idVal = document.getElementById('resetIdentifier').value.trim();
    if (!idVal) {
        showToast('error', 'Enter your email or phone to receive OTP');
        return;
    }

    showToast('success', 'Sending OTP…', true);
    sendOtpBtn.disabled = true;
    sendOtpBtn.classList.add('loading');

    try {
        await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: idVal })
        });
        // Reveal OTP & new-password fields
        resetSec.querySelector('.otp-step1').classList.add('hidden');
        resetSec.querySelectorAll('.otp-step2')
            .forEach(el => el.classList.remove('hidden'));
        showToast('success', 'OTP sent! Check your inbox.');
    } catch (err) {
        console.error('Send-OTP error:', err);
        showToast('error', err.message);
    } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.classList.remove('loading');
    }
});

// ——————————————————————————————————————————————————————————————————
// Toggle-password visibility
// ——————————————————————————————————————————————————————————————————
document.querySelectorAll('.toggle-password')
    .forEach(btn => btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
    }));

// ——————————————————————————————————————————————————————————————————
// Initialize
// ——————————————————————————————————————————————————————————————————
(async() => {
    switchTab('profile');
    await loadProfile();
})();