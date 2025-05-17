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
const usernameHelp = document.getElementById('usernameHelp') || (() => {
    const p = document.createElement('p');
    p.id = 'usernameHelp';
    p.className = 'info-text';
    usernameInput.parentNode.append(p);
    return p;
})();

const [profileError, profileSuccess, passwordError, passwordSuccess] = ['profileError', 'profileSuccess', 'passwordError', 'passwordSuccess']
.map(id => document.getElementById(id));

function daysSince(dateStr) {
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function switchTab(tab) {
    profileForm.classList.toggle('active', tab === 'profile');
    passwordForm.classList.toggle('active', tab === 'password');
    profileTab.classList.toggle('active', tab === 'profile');
    passwordTab.classList.toggle('active', tab === 'password');
    [profileError, profileSuccess, passwordError, passwordSuccess]
    .forEach(el => el.textContent = '');
}

profileTab.onclick = () => switchTab('profile');
passwordTab.onclick = () => switchTab('password');

async function loadProfile() {
    try {
        const { user } = await apiFetch('/api/users/me');
        document.getElementById('userName').textContent = user.name;

        // fill simple fields
        ['name', 'phone', 'gender', 'age', 'email', 'uid', 'categoryType']
        .forEach(f => {
            const el = document.getElementById(f);
            if (el) el.value = user[f] || '';
        });

        // username: just load directly
        usernameInput.value = user.username || '';
        usernameHelp.textContent = '';

        // role display
        const roleMap = {
            developer: 'Developer',
            admin: 'Admin',
            'category-admin': 'Head',
            usher: 'Member'
        };
        document.getElementById('role').value = roleMap[user.role] || user.role;

        // username cooldown logic only if you still want it:
        const elapsed = daysSince(user.usernameChangedAt);
        const daysLeft = Math.max(0, 30 - elapsed);

        if (['category-admin', 'usher'].includes(user.role) && daysLeft > 0) {
            usernameInput.disabled = true;
            usernameHelp.textContent = `You can change your username in ${daysLeft} day${daysLeft>1?'s':''}.`;
        } else {
            usernameInput.disabled = false;
        }

    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load profile');
    }
}

loadProfile();

// ——— PROFILE SAVE —————————
profileForm.addEventListener('submit', async e => {
    e.preventDefault();
    showToast('success', 'Saving profile…', true);
    try {
        const payload = {
            name: e.target.name.value.trim(),
            phone: e.target.phone.value.trim(),
            gender: e.target.gender.value,
            age: e.target.age.value || null,
            email: e.target.email.value.trim(),
            username: usernameInput.value.trim()
        };
        await apiFetch('/api/users/me', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        showToast('success', 'Profile updated');
        await loadProfile();
    } catch (err) {
        console.error(err);
        const msg = err.message;
        if (msg.includes('Username can only be changed')) {
            showToast('error', msg);
            // re-render help text if server told you the days remaining
            const m = msg.match(/(\d+)/);
            if (m) usernameHelp.textContent = `You can change your username in ${m[1]} day${m[1]>1?'s':''}.`;
        } else {
            showToast('error', msg);
        }
    }
});

// ——— PASSWORD FORM HANDLERS —————————
// ... your existing change-password and reset-OTP logic unchanged ...

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

sendOtpBtn.onclick = async() => {
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