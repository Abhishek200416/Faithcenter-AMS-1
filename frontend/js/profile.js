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

// Buttons & fields for OTP flow
const sendOtpBtn = document.getElementById('sendOtp');
const resetIdentifier = document.getElementById('resetIdentifier');
const resetCodeInput = document.getElementById('resetCode');
const resetNewPwInput = document.getElementById('resetNewPw');

// Status messages
const profileError = document.getElementById('profileError');
const profileSuccess = document.getElementById('profileSuccess');
const passwordError = document.getElementById('passwordError');
const passwordSuccess = document.getElementById('passwordSuccess');

// Password-toggle buttons (delegated)
function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.onclick = () => {
            const input = document.getElementById(btn.dataset.target);
            input.type = input.type === 'password' ? 'text' : 'password';
            btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
        };
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

// Clear input by ID
function clearField(id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
}

// Switch between Profile / ChangePassword tabs
function switchTab(tab) {
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');
}

// Handler: User clicks “Forgot Password?” inside ChangePassword
function showResetFlow(e) {
    e.preventDefault();
    changeSection.classList.add('hidden');
    resetSection.classList.remove('hidden');
}

// Initial tab setup
profileTab.addEventListener('click', () => switchTab('profile'));
passwordTab.addEventListener('click', () => switchTab('password'));

// “Forgot Password?” link
showResetLink.addEventListener('click', showResetFlow);

// Initialize toggles once
initPasswordToggles();

// — LOAD PROFILE — 
async function loadProfile() {
    try {
        const { user } = await apiFetch('/api/users/me');

        // Fill form fields
        document.getElementById('name').value = user.name || '';
        document.getElementById('phone').value = user.phone || '';
        document.getElementById('gender').value = user.gender || '';
        document.getElementById('age').value = user.age || '';
        document.getElementById('email').value = user.email || '';
        document.getElementById('username').value = user.username || '';
        document.getElementById('uid').value = user.uid || '';
        document.getElementById('categoryType').value = user.categoryType || '';
        document.getElementById('role').value = user.role || '';

        // Clear any messages
        profileError.textContent = '';
        profileSuccess.textContent = '';
    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

// Fetch on page load
loadProfile();


// — SAVE PROFILE — 
profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    profileError.textContent = '';
    profileSuccess.textContent = '';
    showToast('info', 'Saving profile…', true);

    try {
        const payload = {
            name: document.getElementById('name').value.trim(),
            phone: document.getElementById('phone').value.trim() || null,
            gender: document.getElementById('gender').value,
            age: Number(document.getElementById('age').value) || null,
            email: document.getElementById('email').value.trim()
                // username is not editable here (disabled)
        };

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


// — CHANGE PASSWORD — 
passwordForm.addEventListener('submit', async e => {
    e.preventDefault();
    passwordError.textContent = '';
    passwordSuccess.textContent = '';

    // If still showing direct-change section
    if (!changeSection.classList.contains('hidden')) {
        const oldPw = document.getElementById('currentPw').value.trim();
        const newPw = document.getElementById('newPw').value.trim();
        const confirmPw = document.getElementById('confirmPw').value.trim();

        if (!oldPw || !newPw || !confirmPw) {
            showToast('error', 'All fields are required');
            return;
        }
        if (!validatePassword(newPw)) return;
        if (newPw !== confirmPw) {
            showToast('error', 'New passwords do not match');
            return;
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

            // Clear fields
            clearField('currentPw');
            clearField('newPw');
            clearField('confirmPw');
        } catch (err) {
            console.error(err);
            const msg = err.message === 'Old password is incorrect' ?
                'Incorrect current password' :
                err.message;
            passwordError.textContent = msg;
            showToast('error', msg);
        }
    }

    // Else—OTP Reset submission
    else {
        const identifier = resetIdentifier.value.trim();
        const code = resetCodeInput.value.trim();
        const newPw = resetNewPwInput.value.trim();

        if (!identifier || !code || !newPw) {
            showToast('error', 'Fill all reset fields');
            return;
        }
        if (!validatePassword(newPw)) return;

        showToast('info', 'Resetting password…', true);
        try {
            await apiFetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier,
                    code,
                    newPassword: newPw
                })
            });

            showToast('success', 'Password reset successful');
            passwordSuccess.textContent = 'Password has been reset';

            // Reset UI: back to direct-change
            resetSection.classList.add('hidden');
            changeSection.classList.remove('hidden');
            clearField('resetIdentifier');
            clearField('resetCode');
            clearField('resetNewPw');
        } catch (err) {
            console.error(err);
            passwordError.textContent = err.message;
            showToast('error', err.message);
        }
    }
});


// — SEND OTP FOR RESET — 
sendOtpBtn.addEventListener('click', async() => {
    const identifier = resetIdentifier.value.trim();
    if (!identifier) {
        showToast('error', 'Enter email or phone to receive OTP');
        return;
    }

    showToast('info', 'Sending OTP…', true);
    try {
        await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });

        showToast('success', 'OTP sent—check your inbox');
        // Reveal OTP and new-pw inputs
        resetSection.querySelectorAll('.otp-step1').forEach(el => el.classList.add('hidden'));
        resetSection.querySelectorAll('.otp-step2').forEach(el => el.classList.remove('hidden'));
    } catch (err) {
        console.error(err);
        passwordError.textContent = err.message;
        showToast('error', err.message);
    }
});