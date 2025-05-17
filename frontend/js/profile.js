// frontend/js/profile.js

import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

// — DOM REFERENCES —
// Tabs
const profileTab = document.getElementById('profileTab');
const passwordTab = document.getElementById('passwordTab');

// Forms & sections
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
const changeSection = document.getElementById('changeSection');
const resetSection = document.getElementById('resetSection');

// “Forgot Password?” link inside Change Password panel
const showResetLink = document.getElementById('showReset');

// Buttons & fields for direct-change
const currentPwInput = document.getElementById('currentPw');
const newPwInput = document.getElementById('newPw');
const confirmPwInput = document.getElementById('confirmPw');

// Buttons & fields for OTP-reset
const otpIdentifierInput = document.getElementById('resetIdentifier');
const sendOtpButton = document.getElementById('sendOtp');
const otpCodeInput = document.getElementById('resetCode');
const otpNewPwInput = document.getElementById('resetNewPw');

// Status messages
const profileError = document.getElementById('profileError');
const profileSuccess = document.getElementById('profileSuccess');
const passwordError = document.getElementById('passwordError');
const passwordSuccess = document.getElementById('passwordSuccess');

// — HELPERS —

// Toggle password visibility on any `.toggle-password` button
function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            target.type = target.type === 'password' ? 'text' : 'password';
            btn.textContent = target.type === 'password' ? 'Show' : 'Hide';
        });
    });
}

// Simple length check for new passwords
function validatePassword(pw) {
    if (!pw || pw.length < 6) {
        showToast('error', 'Password must be at least 6 characters');
        return false;
    }
    return true;
}

// Clear a single field by its element
function clearField(el) {
    if (el) el.value = '';
}

// Switch which top-level tab is active
function switchTab(tab) {
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');

    // Whenever you open the Change-Password tab, default to direct-change view
    if (tab === 'password') showChangePanel();
}

// Show the direct-change panel, hide OTP reset
function showChangePanel() {
    changeSection.classList.remove('hidden');
    resetSection.classList.add('hidden');
    // Clear any previous reset states
    clearField(otpIdentifierInput);
    clearField(otpCodeInput);
    clearField(otpNewPwInput);
    passwordError.textContent = '';
    passwordSuccess.textContent = '';
}

// Show the OTP-reset panel, hide direct-change
function showResetPanel() {
    changeSection.classList.add('hidden');
    resetSection.classList.remove('hidden');
    // Clear direct-change inputs
    clearField(currentPwInput);
    clearField(newPwInput);
    clearField(confirmPwInput);
    passwordError.textContent = '';
    passwordSuccess.textContent = '';
}

// — INITIAL SETUP —

// Wire up the two tab buttons
profileTab.addEventListener('click', () => switchTab('profile'));
passwordTab.addEventListener('click', () => switchTab('password'));

// “Forgot Password?” from direct-change → OTP flow
showResetLink.addEventListener('click', e => {
    e.preventDefault();
    showResetPanel();
});

// Initialize the “Show/Hide” toggles
initPasswordToggles();

// Start with Edit-Profile tab on page load
switchTab('profile');


// — LOAD PROFILE DATA — 

async function loadProfile() {
    try {
        const { user } = await apiFetch('/api/users/me');

        // Fill Edit Profile fields
        document.getElementById('name').value = user.name || '';
        document.getElementById('phone').value = user.phone || '';
        document.getElementById('gender').value = user.gender || '';
        document.getElementById('age').value = user.age || '';
        document.getElementById('email').value = user.email || '';
        document.getElementById('username').value = user.username || '';
        document.getElementById('uid').value = user.uid || '';
        document.getElementById('categoryType').value = user.categoryType || '';
        document.getElementById('role').value = user.role || '';

        // Clear any flash messages
        profileError.textContent = '';
        profileSuccess.textContent = '';

    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

// Fetch immediately
loadProfile();


// — SAVE PROFILE FORM — 

profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    profileError.textContent = '';
    profileSuccess.textContent = '';

    const payload = {
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim() || null,
        gender: document.getElementById('gender').value,
        age: Number(document.getElementById('age').value) || null,
        email: document.getElementById('email').value.trim()
            // Username, UID, Category, Role are not editable here
    };

    showToast('info', 'Saving profile…', true);

    try {
        await apiFetch('/api/users/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        showToast('success', 'Profile updated');
        profileSuccess.textContent = 'Profile updated successfully';
        await loadProfile();

    } catch (err) {
        console.error(err);
        profileError.textContent = err.message;
        showToast('error', err.message);
    }
});


// — DIRECT PASSWORD CHANGE — 

passwordForm.addEventListener('submit', async e => {
    e.preventDefault();
    passwordError.textContent = '';
    passwordSuccess.textContent = '';

    // If changeSection is visible → direct-change flow
    if (!changeSection.classList.contains('hidden')) {
        const oldPw = currentPwInput.value.trim();
        const newPw = newPwInput.value.trim();
        const confirmPw = confirmPwInput.value.trim();

        if (!oldPw || !newPw || !confirmPw) {
            return showToast('error', 'All fields are required');
        }
        if (!validatePassword(newPw)) return;
        if (newPw !== confirmPw) {
            return showToast('error', 'New passwords do not match');
        }

        showToast('info', 'Updating password…', true);

        try {
            await apiFetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oldPassword: oldPw,
                    newPassword: newPw
                })
            });

            showToast('success', 'Password changed');
            passwordSuccess.textContent = 'Password updated successfully';
            clearField(currentPwInput);
            clearField(newPwInput);
            clearField(confirmPwInput);

        } catch (err) {
            console.error(err);
            const msg = err.message === 'Old password is incorrect' ?
                'Incorrect current password' :
                err.message;
            passwordError.textContent = msg;
            showToast('error', msg);
        }

        // Else → OTP-reset submission
    } else {
        const ident = otpIdentifierInput.value.trim();
        const code = otpCodeInput.value.trim();
        const newPw = otpNewPwInput.value.trim();

        if (!ident || !code || !newPw) {
            return showToast('error', 'Fill all reset fields');
        }
        if (!validatePassword(newPw)) return;

        showToast('info', 'Resetting password…', true);

        try {
            await apiFetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: ident, code, newPassword: newPw })
            });

            showToast('success', 'Password reset successful');
            passwordSuccess.textContent = 'Password has been reset';

            // Go back to direct-change panel
            showChangePanel();

        } catch (err) {
            console.error(err);
            passwordError.textContent = err.message;
            showToast('error', err.message);
        }
    }
});


// — SEND OTP FOR RESET — 

sendOtpButton.addEventListener('click', async() => {
    const ident = otpIdentifierInput.value.trim();
    if (!ident) {
        return showToast('error', 'Enter email or phone to receive OTP');
    }

    showToast('info', 'Sending OTP…', true);

    try {
        await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: ident })
        });

        showToast('success', 'OTP sent—check your inbox');

        // Reveal OTP entry & new-password fields
        resetSection.querySelectorAll('.otp-step1').forEach(el => el.classList.add('hidden'));
        resetSection.querySelectorAll('.otp-step2').forEach(el => el.classList.remove('hidden'));

    } catch (err) {
        console.error(err);
        passwordError.textContent = err.message;
        showToast('error', err.message);
    }
});