// frontend/js/profile.js

import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

document.addEventListener('DOMContentLoaded', () => {
    // — DOM REFERENCES —
    const profileTab = document.getElementById('profileTab');
    const passwordTab = document.getElementById('passwordTab');
    const profileForm = document.getElementById('profileForm');
    const passwordForm = document.getElementById('passwordForm');
    const changeSection = document.getElementById('changeSection');
    const resetSection = document.getElementById('resetSection');
    const showResetLink = document.getElementById('showReset');
    const sendOtpBtn = document.getElementById('sendOtp');
    const resetIdentifier = document.getElementById('resetIdentifier');
    const resetCodeInput = document.getElementById('resetCode');
    const resetNewPwInput = document.getElementById('resetNewPw');
    const profileError = document.getElementById('profileError');
    const profileSuccess = document.getElementById('profileSuccess');
    const passwordError = document.getElementById('passwordError');
    const passwordSuccess = document.getElementById('passwordSuccess');

    // — UTILS —
    function toggleVisibility(el, show) {
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }

    function clearField(id) {
        const f = document.getElementById(id);
        if (f) f.value = '';
    }

    function validatePassword(pw) {
        if (!pw || pw.length < 6) {
            showToast('error', 'Password must be at least 6 characters');
            return false;
        }
        return true;
    }

    // Password-toggle buttons
    function initPasswordToggles() {
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById(btn.dataset.target);
                input.type = input.type === 'password' ? 'text' : 'password';
                btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
            });
        });
    }

    // — TAB SWITCHING —
    function showTab(which) {
        toggleVisibility(profileForm, which === 'profile');
        toggleVisibility(passwordForm, which === 'password');

        profileTab.classList.toggle('active', which === 'profile');
        passwordTab.classList.toggle('active', which === 'password');
    }

    profileTab.addEventListener('click', () => showTab('profile'));
    passwordTab.addEventListener('click', () => showTab('password'));

    // — FORGOT PASSWORD FLOW —
    showResetLink.addEventListener('click', e => {
        e.preventDefault();
        toggleVisibility(changeSection, false);
        toggleVisibility(resetSection, true);
    });

    // — LOAD PROFILE —
    async function loadProfile() {
        try {
            const { user } = await apiFetch('/api/users/me');
            // fill fields
            ['name', 'phone', 'gender', 'age', 'email', 'username', 'uid', 'categoryType', 'role']
            .forEach(key => {
                const el = document.getElementById(key);
                if (el && user[key] !== undefined) el.value = user[key];
            });

            profileError.textContent = '';
            profileSuccess.textContent = '';
        } catch (err) {
            console.error(err);
            showToast('error', 'Failed to load profile');
        }
    }

    // — SAVE PROFILE —
    profileForm.addEventListener('submit', async e => {
        e.preventDefault();
        profileError.textContent = '';
        profileSuccess.textContent = '';

        showToast('info', 'Saving profile…');
        try {
            const payload = {
                name: document.getElementById('name').value.trim(),
                phone: document.getElementById('phone').value.trim() || null,
                gender: document.getElementById('gender').value,
                age: Number(document.getElementById('age').value) || null,
                email: document.getElementById('email').value.trim()
            };

            await apiFetch('/api/users/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            profileSuccess.textContent = 'Profile updated';
            showToast('success', 'Profile updated');
            await loadProfile();
        } catch (err) {
            console.error(err);
            profileError.textContent = err.message;
            showToast('error', err.message);
        }
    });

    // — CHANGE PASSWORD vs. RESET OTP —
    passwordForm.addEventListener('submit', async e => {
        e.preventDefault();
        passwordError.textContent = '';
        passwordSuccess.textContent = '';

        // Direct change
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
                showToast('error', 'Passwords do not match');
                return;
            }

            showToast('info', 'Updating password…');
            try {
                await apiFetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
                });
                passwordSuccess.textContent = 'Password changed';
                showToast('success', 'Password updated');
                ['currentPw', 'newPw', 'confirmPw'].forEach(clearField);
            } catch (err) {
                console.error(err);
                const msg = err.message === 'Old password is incorrect' ?
                    'Incorrect current password' :
                    err.message;
                passwordError.textContent = msg;
                showToast('error', msg);
            }
        }
        // OTP reset
        else {
            const identifier = resetIdentifier.value.trim();
            const code = resetCodeInput.value.trim();
            const newPw = resetNewPwInput.value.trim();

            if (!identifier || !code || !newPw) {
                showToast('error', 'All reset fields are required');
                return;
            }
            if (!validatePassword(newPw)) return;

            showToast('info', 'Resetting password…');
            try {
                await apiFetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier, code, newPassword: newPw })
                });

                passwordSuccess.textContent = 'Password reset successful';
                showToast('success', 'Password reset');
                // go back to direct-change
                toggleVisibility(resetSection, false);
                toggleVisibility(changeSection, true);
                ['resetIdentifier', 'resetCode', 'resetNewPw'].forEach(clearField);
            } catch (err) {
                console.error(err);
                passwordError.textContent = err.message;
                showToast('error', err.message);
            }
        }
    });

    // — SEND OTP —
    sendOtpBtn.addEventListener('click', async() => {
        const idVal = resetIdentifier.value.trim();
        if (!idVal) {
            showToast('error', 'Enter email/phone to send OTP');
            return;
        }

        showToast('info', 'Sending OTP…');
        try {
            await apiFetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: idVal })
            });

            showToast('success', 'OTP sent – check your inbox');
            // hide step1, show step2
            resetSection.querySelectorAll('.otp-step1')
                .forEach(el => el.classList.add('hidden'));
            resetSection.querySelectorAll('.otp-step2')
                .forEach(el => el.classList.remove('hidden'));
        } catch (err) {
            console.error(err);
            passwordError.textContent = err.message;
            showToast('error', err.message);
        }
    });

    // Finally, call loadProfile to populate fields
    loadProfile();
    initPasswordToggles();
    // and ensure initial state:
    showTab('profile');
    toggleVisibility(changeSection, true);
    toggleVisibility(resetSection, false);
});