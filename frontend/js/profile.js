// frontend/js/profile.js

import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

// — DOM REFERENCES —
const profileTab = document.getElementById('profileTab');
const passwordTab = document.getElementById('passwordTab');
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
const changeSec = document.getElementById('changeSection');
const resetSec = document.getElementById('resetSection');
const showResetLink = document.getElementById('showReset'); // “Forgot Password?” link
const sendOtpBtn = document.getElementById('sendOtp'); // inside resetSec
const profileError = document.getElementById('profileError');
const profileSuccess = document.getElementById('profileSuccess');
const passwordError = document.getElementById('passwordError');
const passwordSuccess = document.getElementById('passwordSuccess');

// — UTILS —

// Simple toggle-password handler
function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            target.type = (target.type === 'password') ? 'text' : 'password';
            btn.textContent = (target.type === 'password') ? 'Show' : 'Hide';
        });
    });
}

// Validate new password length
function validatePassword(pw) {
    if (!pw || pw.length < 6) {
        showToast('error', 'Password must be at least 6 characters');
        return false;
    }
    return true;
}

// Switch between “Edit Profile” and “Change Password” tabs
function switchTab(tab) {
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');
}

// Clear form fields by ID
function clearFields(ids = []) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// Initialize toggle buttons
initPasswordToggles();

// — TABS BAR EVENT LISTENERS —
profileTab.addEventListener('click', () => {
    switchTab('profile');
});
passwordTab.addEventListener('click', () => {
    switchTab('password');
});

// — LOAD PROFILE DATA —
async function loadProfile() {
    try {
        const { user } = await apiFetch('/api/users/me');

        // Populate profile form
        document.getElementById('name').value = user.name || '';
        document.getElementById('phone').value = user.phone || '';
        document.getElementById('gender').value = user.gender || '';
        document.getElementById('age').value = user.age || '';
        document.getElementById('email').value = user.email || '';
        document.getElementById('username').value = user.username || '';
        document.getElementById('uid').value = user.uid || '';
        document.getElementById('categoryType').value = user.categoryType || '';
        document.getElementById('role').value = user.role || '';

        // Reset profile messages
        profileError.textContent = '';
        profileSuccess.textContent = '';
    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

// Initial load
loadProfile();

// — PROFILE UPDATE HANDLER —
profileForm.addEventListener('submit', async(evt) => {
    evt.preventDefault();
    profileError.textContent = '';
    profileSuccess.textContent = '';

    const payload = {
        name: evt.target.name.value.trim(),
        phone: evt.target.phone.value.trim() || null,
        gender: evt.target.gender.value,
        age: evt.target.age.value.trim() ? Number(evt.target.age.value) : null,
        email: evt.target.email.value.trim(),
        username: evt.target.username.value.trim() || undefined
    };

    try {
        showToast('success', 'Saving profile…', true);
        await apiFetch('/api/users/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        profileSuccess.textContent = 'Profile updated successfully';
        await loadProfile();
    } catch (err) {
        console.error(err);
        profileError.textContent = err.message || 'Failed to update profile';
    }
});

// — PASSWORD CHANGE & RESET WORKFLOW —

// 1) Show/hide reset-OTP panel when “Forgot Password?” clicked
showResetLink.addEventListener('click', e => {
    e.preventDefault();
    changeSec.classList.add('hidden');
    resetSec.classList.remove('hidden');
});

// 2) Send OTP for reset
sendOtpBtn.addEventListener('click', async() => {
    const identifier = document.getElementById('resetIdentifier').value.trim();
    if (!identifier) {
        showToast('error', 'Enter your email or phone');
        return;
    }

    try {
        showToast('success', 'Sending OTP…', true);
        await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        // Show OTP entry fields
        resetSec.querySelector('.otp-step1').classList.add('hidden');
        resetSec.querySelectorAll('.otp-step2').forEach(el => {
            el.classList.remove('hidden');
            el.querySelectorAll('input, button').forEach(inp => inp.disabled = false);
        });
        showToast('success', 'OTP sent! Check your inbox.');
    } catch (err) {
        console.error(err);
        showToast('error', err.message);
    }
});

// 3) Handle either direct change-password or OTP-reset, on the same form submit
passwordForm.addEventListener('submit', async(evt) => {
    evt.preventDefault();
    passwordError.textContent = '';
    passwordSuccess.textContent = '';

    // If resetSec is still hidden, do direct change
    if (changeSec.classList.contains('hidden')) {
        // OTP flow
        const idVal = document.getElementById('resetIdentifier').value.trim();
        const code = document.getElementById('resetCode').value.trim();
        const newPw = document.getElementById('resetNewPw').value.trim();

        if (!idVal || !code || !newPw) {
            showToast('error', 'Please complete all fields for OTP reset');
            return;
        }
        if (!validatePassword(newPw)) return;

        try {
            showToast('success', 'Resetting password…', true);
            await apiFetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: idVal,
                    code,
                    newPassword: newPw
                })
            });
            passwordSuccess.textContent = 'Password reset successfully!';
            // Clear fields & return to direct-change panel
            clearFields(['resetIdentifier', 'resetCode', 'resetNewPw']);
            resetSec.classList.add('hidden');
            changeSec.classList.remove('hidden');
        } catch (err) {
            console.error(err);
            passwordError.textContent = err.message || 'OTP reset failed';
        }
    } else {
        // Direct change-password flow
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

        try {
            showToast('success', 'Updating password…', true);
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
            });
            passwordSuccess.textContent = 'Password updated successfully';
            clearFields(['currentPw', 'newPw', 'confirmPw']);
        } catch (err) {
            console.error(err);
            passwordError.textContent = (err.message === 'Old password is incorrect') ?
                'Incorrect current password' :
                err.message;
        }
    }
});