// public/js/auth.js

import { saveToken, getToken, apiFetch } from './utils.js';
import { showToast } from './toast.js';

if (getToken()) {
    window.location.href = '/dashboard.html';
}

// — DOM refs —
const loginTab = document.getElementById('loginTab');
const otpTab = document.getElementById('otpTab');
const loginForm = document.getElementById('loginForm');
const otpForm = document.getElementById('otpForm');
const forgotForm = document.getElementById('forgotForm');
const showForgot = document.getElementById('showForgot');
const loginBtn = loginForm.querySelector('button[type=submit]');
const sendOtpBtn = document.getElementById('sendOtp');
const otpBtn = otpForm.querySelector('button[type=submit]');
const resendBtn = document.getElementById('resendOtp');
const sendResetBtn = document.getElementById('sendResetOtp');
const resetSection = document.getElementById('resetSection');

let resendCooldown = 30; // seconds

// — Helpers —
function isValidIdentifier(s) {
    return !!(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || // email
        /^\d{10,}$/.test(s) || // phone
        /^[a-z0-9]+$/.test(s) || // username (lowercase letters/numbers)
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(s) // UUID
    );
}

function validatePassword(p) {
    if (p.length < 6) {
        showToast('error', 'Password must be at least 6 characters');
        return false;
    }
    return true;
}

function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            input.type = input.type === 'password' ? 'text' : 'password';
            btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
        });
    });
}

function switchTab(tab) {
    [loginForm, otpForm, forgotForm].forEach(f => f.classList.remove('active'));
    loginTab.classList.toggle('active', tab === 'login');
    otpTab.classList.toggle('active', tab === 'otp');

    if (tab === 'login') {
        loginForm.classList.add('active');
    } else if (tab === 'otp') {
        otpForm.classList.add('active');
    } else {
        forgotForm.classList.add('active');
    }
}

// — Initial setup —
loginTab.addEventListener('click', () => switchTab('login'));
otpTab.addEventListener('click', () => switchTab('otp'));
showForgot.addEventListener('click', e => {
    e.preventDefault();
    switchTab('forgot');
});

switchTab('login');
initPasswordToggles();

// — 1) PASSWORD LOGIN —
loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginBtn.disabled = true;

    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value;

    if (!isValidIdentifier(identifier)) {
        showToast('error', 'Invalid identifier');
        loginBtn.disabled = false;
        return;
    }
    if (!validatePassword(password)) {
        loginBtn.disabled = false;
        return;
    }

    try {
        const data = await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });
        saveToken(data.token);
        window.location.href = '/dashboard.html';
    } catch (err) {
        showToast(
            'error',
            err.message === 'Invalid credentials' ?
            'Incorrect identifier or password' :
            err.message
        );
    } finally {
        loginBtn.disabled = false;
    }
});

// — 2) SEND LOGIN OTP & SHOW SPINNER —
async function handleSendLoginOtp() {
    const identifier = document.getElementById('otpIdentifier').value.trim();
    if (!isValidIdentifier(identifier)) {
        showToast('error', 'Enter valid Email/Phone/UID/Username');
        return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.classList.add('loading');

    try {
        await apiFetch('/api/auth/login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });

        document.querySelector('.otp-step1').classList.add('hidden');
        document.querySelector('.otp-step2').classList.remove('hidden');
        showToast('success', 'Login code sent! Check your email.');
        startResendTimer();
    } catch (err) {
        showToast('error', err.message);
    } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.classList.remove('loading');
    }
}

// — 3) VERIFY LOGIN OTP —
async function handleVerifyLoginOtp(e) {
    e.preventDefault();
    otpBtn.disabled = true;

    const identifier = document.getElementById('otpIdentifier').value.trim();
    const code = document.getElementById('otpCode').value.trim();

    if (!isValidIdentifier(identifier)) {
        showToast('error', 'Invalid identifier');
        otpBtn.disabled = false;
        return;
    }
    if (!/^\d{6}$/.test(code)) {
        showToast('error', 'Enter the 6-digit code');
        otpBtn.disabled = false;
        return;
    }

    try {
        const data = await apiFetch('/api/auth/verify-login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, code })
        });
        saveToken(data.token);
        window.location.href = '/dashboard.html';
    } catch (err) {
        showToast('error', err.message);
    } finally {
        otpBtn.disabled = false;
    }
}

// — 4) EXPONENTIAL BACK-OFF FOR RESEND —
function startResendTimer() {
    resendBtn.disabled = true;
    let t = resendCooldown;
    resendBtn.textContent = `Resend Code (${t}s)`;

    const iv = setInterval(() => {
        if (--t > 0) {
            resendBtn.textContent = `Resend Code (${t}s)`;
        } else {
            clearInterval(iv);
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Code';
        }
    }, 1000);

    resendCooldown *= 2; // double the wait next time
}

// — Wire up OTP buttons —
sendOtpBtn.addEventListener('click', handleSendLoginOtp);
resendBtn.addEventListener('click', handleSendLoginOtp);
otpForm.addEventListener('submit', handleVerifyLoginOtp);

// — 5) FORGOT / RESET PASSWORD —
// NOTE: Your HTML must have a single input with id="forgotIdentifier"
sendResetBtn.addEventListener('click', async e => {
    e.preventDefault();
    const identifier = document.getElementById('forgotIdentifier').value.trim();

    if (!isValidIdentifier(identifier)) {
        showToast('error', 'Enter valid Email/Phone/UID/Username');
        return;
    }

    sendResetBtn.disabled = true;
    try {
        await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        resetSection.classList.remove('hidden');
        showToast('success', 'Reset code sent! Check your email.');
    } catch (err) {
        showToast('error', err.message);
    } finally {
        sendResetBtn.disabled = false;
    }
});

forgotForm.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = forgotForm.querySelector('button[type=submit]');
    const identifier = document.getElementById('forgotIdentifier').value.trim();
    const code = document.getElementById('resetOtp').value.trim();
    const newPw = document.getElementById('newPassword').value;

    if (!isValidIdentifier(identifier)) {
        showToast('error', 'Enter valid Email/Phone/UID/Username');
        return;
    }
    if (!/^\d{6}$/.test(code)) {
        showToast('error', 'Enter the 6-digit code');
        return;
    }
    if (!validatePassword(newPw)) return;

    submitBtn.disabled = true;
    try {
        await apiFetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, code, newPassword: newPw })
        });
        showToast('success', 'Password reset—please log in.');
        switchTab('login');
    } catch (err) {
        showToast('error', err.message);
    } finally {
        submitBtn.disabled = false;
    }
});