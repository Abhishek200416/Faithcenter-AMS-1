import { saveToken, getToken, apiFetch } from './utils.js';
import { showToast } from './toast.js';

if (getToken()) window.location.href = '/dashboard.html';

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
const sendResetBtn = forgotForm.querySelector('#sendResetOtp');
const resetSection = document.getElementById('resetSection');
const idVal = document.getElementById('forgotIdentifier').value.trim();


let resendCooldown = 30; // seconds

// — Helpers —
function isValidIdentifier(s) {
    return !!(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || // email
        /^\d{10,}$/.test(s) || // phone
        /^[a-z0-9]+$/.test(s) || // username (lowercase letters/numbers)
        /^[0-9a-fA-F-]{36}$/.test(s) // UUID
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
        btn.onclick = () => {
            const input = document.getElementById(btn.dataset.target);
            input.type = input.type === 'password' ? 'text' : 'password';
            btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
        };
    });
}

function switchTab(tab) {
    [loginForm, otpForm, forgotForm].forEach(f => f.classList.remove('active'));
    if (tab === 'login') loginForm.classList.add('active');
    if (tab === 'otp') otpForm.classList.add('active');
    if (tab === 'forgot') forgotForm.classList.add('active');
    loginTab.classList.toggle('active', tab === 'login');
    otpTab.classList.toggle('active', tab === 'otp');
}

// — Initial setup —
loginTab.onclick = () => switchTab('login');
otpTab.onclick = () => switchTab('otp');
showForgot.onclick = e => {
    e.preventDefault();
    switchTab('forgot');
};

switchTab('login');
initPasswordToggles();

// — 1) PASSWORD LOGIN —
loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginBtn.disabled = true;

    const idVal = document.getElementById('identifier').value.trim();
    const pwVal = document.getElementById('password').value;

    if (!isValidIdentifier(idVal)) {
        showToast('error', 'Invalid identifier');
        loginBtn.disabled = false;
        return;
    }
    if (!validatePassword(pwVal)) {
        loginBtn.disabled = false;
        return;
    }

    try {
        const data = await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: idVal, password: pwVal })
        });
        saveToken(data.token);
        window.location.href = '/dashboard.html';
    } catch (err) {
        showToast('error',
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
    const idVal = document.getElementById('otpIdentifier').value.trim();
    if (!isValidIdentifier(idVal)) {
        showToast('error', 'Enter valid Email/Phone/UID/Username');
        return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.classList.add('loading');

    try {
        await apiFetch('/api/auth/login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: idVal })
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

    const idVal = document.getElementById('otpIdentifier').value.trim();
    const code = document.getElementById('otpCode').value.trim();

    if (!isValidIdentifier(idVal)) {
        showToast('error', 'Invalid identifier');
        otpBtn.disabled = false;
        return;
    }
    if (!/^\d{6}$/.test(code)) {
        showToast('error', 'Enter the 6‑digit code');
        otpBtn.disabled = false;
        return;
    }

    try {
        const data = await apiFetch('/api/auth/verify-login-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: idVal, code })
        });
        saveToken(data.token);
        window.location.href = '/dashboard.html';

    } catch (err) {
        showToast('error', err.message);
    } finally {
        otpBtn.disabled = false;
    }
}

// — 4) EXPONENTIAL BACK‑OFF FOR RESEND —
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

// send reset‑OTP
sendResetBtn.addEventListener('click', async e => {
    e.preventDefault();
    const idVal = document.getElementById('forgotIdentifier').value.trim();
    if (!isValidIdentifier(idVal)) {
        showToast('error', 'Enter valid Email/Phone/UID/Username');
        return;
    }
    sendResetBtn.disabled = true;
    try {
        await apiFetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: idVal })
        });
        resetSection.classList.remove('hidden');
        showToast('success', 'Reset code sent! Check your email.');
    } catch (err) {
        showToast('error', err.message);
    } finally {
        sendResetBtn.disabled = false;
    }
});

// verify reset‑OTP & set new password
forgotForm.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = forgotForm.querySelector('button[type=submit]');
    const idVal = document.getElementById('forgotIdentifier').value.trim();
    const code = document.getElementById('resetOtp').value.trim();
    const newPw = document.getElementById('newPassword').value;

    if (!isValidIdentifier(idVal)) {
        showToast('error', 'Enter valid Email/Phone/UID/Username');
        return;
    }
    if (!/^\d{6}$/.test(code)) {
        showToast('error', 'Enter the 6‑digit code');
        return;
    }
    if (!validatePassword(newPw)) return;

    submitBtn.disabled = true;
    try {
        await apiFetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: idVal, code, newPassword: newPw })
        });
        showToast('success', 'Password reset—please log in.');
        switchTab('login');
    } catch (err) {
        showToast('error', err.message);
    } finally {
        submitBtn.disabled = false;
    }
});