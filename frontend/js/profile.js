// frontend/js/profile.js
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
const SUFFIX = '@1FC';

// … after your loadProfile() call, insert this handler:
usernameInput.addEventListener('input', () => {
    let v = usernameInput.value;

    // if it doesn't end with the exact suffix, strip off any bad suffix or extra chars
    if (!v.endsWith(SUFFIX)) {
        // take everything up to the first '@' (in case they tried to re‑insert one),
        // or the whole string if they never removed '@1FC' entirely
        const idx = v.indexOf(SUFFIX);
        if (idx >= 0) {
            v = v.slice(0, idx);
        } else if (v.includes('@')) {
            v = v.split('@')[0];
        }
        // finally re‑append the frozen suffix
        usernameInput.value = v + SUFFIX;
    }
});

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

async function safeFetch(...args) {
    return apiFetch(...args);
}

async function loadProfile() {
    try {
        const { user } = await safeFetch('/api/users/me');

        // Welcome banner
        document.getElementById('userName').textContent = user.name;

        // fill fields
        ['name', 'phone', 'gender', 'age', 'email', 'uid']
        .forEach(f => {
            const el = document.getElementById(f);
            if (el) el.value = user[f] || '';
        });

        // username
        usernameInput.value = user.username;
        usernameHelp.textContent = '';
        // username
        const raw = user.username || '';
        // if somehow missing suffix, force it
        usernameInput.value = raw.endsWith(SUFFIX) ?
            raw :
            raw.split('@')[0] + SUFFIX;
        usernameHelp.textContent = '';


        // decide if editable
        const role = user.role;
        const elapsed = daysSince(user.usernameChangedAt);
        const daysLeft = Math.max(0, 30 - elapsed);

        if (role === 'category-admin' || role === 'usher') {
            if (daysLeft > 0) {
                usernameInput.disabled = true;
                usernameHelp.textContent =
                    `You can change your username in ${daysLeft} day${daysLeft>1?'s':''}.`;
            } else {
                usernameInput.disabled = false;
            }
        } else {
            // developers & admins always can
            usernameInput.disabled = false;
        }

        // category & role display
        document.getElementById('categoryType').value = user.categoryType || '';
        const roleMap = {
            'developer': 'Developer',
            'admin': 'Admin',
            'category-admin': 'Head',
            'usher': 'Member'
        };
        document.getElementById('role').value = roleMap[role] || 'Member';

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
        await safeFetch('/api/users/me', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        showToast('success', 'Profile updated');
        // reload so cooldown resets if username was changed
        await loadProfile();
    } catch (err) {
        console.error(err);
        // server may return our 30‑day error
        if (err.message.includes('30 days')) {
            showToast('error', err.message);
            // re‑render help text
            const msg = err.message.match(/(\d+)/);
            if (msg) usernameHelp.textContent =
                `You can change your username in ${msg[1]} days.`;
        } else {
            showToast('error', err.message);
        }
    }
});

// ——— PASSWORD & OTP (unchanged) —————————
// ... your existing passwordForm submit, sendOtpBtn click, toggle‑password handlers ...

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