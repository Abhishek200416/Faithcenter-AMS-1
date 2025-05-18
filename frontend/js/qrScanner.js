// public/js/qrScanner.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const E = {
    // Form inputs
    dateIn: document.getElementById('dateInput'),
    timeIn: document.getElementById('timeInput'),
    earlyIn: document.getElementById('earlyThresh'),
    lateIn: document.getElementById('lateThresh'),
    absentIn: document.getElementById('absentCutoff'),
    earlyMsgIn: document.getElementById('earlyMsg'),
    onTimeMsgIn: document.getElementById('onTimeMsg'),
    lateMsgIn: document.getElementById('lateMsg'),

    // Action selector
    scanType: document.getElementById('scanType'),

    // Buttons & selects
    applyBtn: document.getElementById('applyBtn'),
    cancelQRBtn: document.getElementById('cancelQRBtn'),
    savePreset: document.getElementById('savePresetBtn'),
    presetSel: document.getElementById('presetSelect'),

    // Panels + scanner
    formCard: document.querySelector('.qr-form'),
    qrOutput: document.getElementById('qrOutput'),
    qrLoading: document.getElementById('qrLoading'),
    qrCanvas: document.getElementById('qrCanvas'),
    qrTimer: document.getElementById('qrTimer'),
    scannerSection: document.getElementById('scannerSection'),
    scannerLoading: document.getElementById('scannerLoading'),

    // Feedback
    fbCard: document.getElementById('feedbackCard'),
    fbTitle: document.getElementById('feedbackTitle'),
    fbMsg: document.getElementById('feedbackMsg'),
    fbReasonContainer: document.getElementById('feedbackReasonContainer'),
    fbReason: document.getElementById('feedbackReason'),
    fbOk: document.getElementById('feedbackOk'),

    // Developer manual punch (must add in HTML)
    devPanel: document.getElementById('devPunchPanel'),
    devUserSelect: document.getElementById('devUserSelect'),
    devPunchInBtn: document.getElementById('devPunchIn'),
    devPunchOutBtn: document.getElementById('devPunchOut'),

    // Preset modal
    modal: document.getElementById('presetModal'),
    nameInput: document.getElementById('presetName'),
    cancelBtn: document.getElementById('presetCancel'),
    confirmBtn: document.getElementById('presetConfirm'),
};

let html5QrInstance;
let attendanceCache = {};
let currentQR = null;
let liveTs = 0, expiryTs = 0, qrCategory, qrIssuerId;
let userId, role, userCategory;
const thresholds = { early: 0, late: 0, absent: 0 };
let timerInterval;
const MODE = new URLSearchParams(window.location.search).get('mode');

/** Bootstrap **/
(async function init() {
    // Hide cancel & dev panel by default
    E.cancelQRBtn.style.display = 'none';
    if (E.devPanel) E.devPanel.style.display = 'none';

    try {
        const me = await apiFetch('/api/users/me');
        userId = me.id;
        role = me.role;
        userCategory = me.categoryType || null;

        // Show dev panel if developer
        if (role === 'developer' && E.devPanel) {
            E.devPanel.style.display = 'block';
            await loadAllUsersForDev();
        }

        const isMember = ['member', 'usher'].includes(role);
        if (isMember || MODE === 'scan') {
            return showScannerOnly();
        }

        showGeneratorOnly();
        await loadPresets();
        restoreFromLocal();
    } catch {
        showToast('error', 'Init failed');
    }
})();

function showScannerOnly() {
    E.formCard.classList.add('hidden');
    E.qrOutput.classList.add('hidden');
    E.scannerSection.classList.remove('hidden');
    fetchActiveQR().then(initScanner).catch(() => showToast('error', 'No active QR'));
}
function showGeneratorOnly() {
    E.formCard.classList.remove('hidden');
    E.qrOutput.classList.remove('hidden');
    E.scannerSection.classList.add('hidden');
}

/** Auto-fill IST date/time **/
window.addEventListener('load', () => {
    const now = new Date(),
        utc = now.getTime() + now.getTimezoneOffset() * 60000,
        ist = new Date(utc + 5.5 * 60 * 60000);
    E.dateIn.value = ist.toISOString().slice(0, 10);
    E.timeIn.value = ist.toTimeString().slice(0, 8);
});

/** Fetch Active QR **/
async function fetchActiveQR() {
    const data = await apiFetch('/api/qr/active');
    bindQR(data);
}

/** Cancel QR **/
E.cancelQRBtn.onclick = async () => {
    if (!currentQR) return;
    if (!confirm('Cancel this QR?')) return;
    try {
        await apiFetch(`/api/qr/${currentQR}`, { method: 'DELETE' });
        showToast('success', 'QR cancelled');
        resetUI();
    } catch (e) {
        showToast('error', 'Cancel failed');
    }
};

/** Presets **/
async function loadPresets() {
    E.presetSel.innerHTML = '<option>— Load Preset —</option>';
    try {
        const ps = await apiFetch('/api/presets');
        ps.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id; o.textContent = p.name;
            E.presetSel.append(o);
        });
    } catch { showToast('error', 'Load presets failed'); }
}
E.presetSel.onchange = async () => {
    const id = E.presetSel.value; if (!id) return;
    try {
        const p = await apiFetch(`/api/presets/${id}`);
        E.dateIn.value = p.date;
        E.timeIn.value = p.time;
        E.earlyIn.value = p.early;
        E.lateIn.value = p.late;
        E.absentIn.value = p.absent;
        E.earlyMsgIn.value = p.earlyMsg;
        E.onTimeMsgIn.value = p.onTimeMsg;
        E.lateMsgIn.value = p.lateMsg;
    } catch { showToast('error', 'Load preset failed'); }
};

/** Generate QR **/
E.applyBtn.onclick = async () => {
    E.qrLoading.classList.remove('hidden');
    E.qrCanvas.classList.add('hidden');
    // Build liveAt from inputs
    const [Y, M, D] = E.dateIn.value.split('-').map(Number);
    const [h, m, s] = E.timeIn.value.split(':').map(Number);
    const liveAtISO = new Date(Date.UTC(Y, M - 1, D, h - 5, m - 30, s)).toISOString();

    try {
        const data = await apiFetch('/api/qr/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                liveAt: liveAtISO,
                durationMinutes: +E.absentIn.value,
                earlyWindow: +E.earlyIn.value,
                lateWindow: +E.lateIn.value,
                earlyMsg: E.earlyMsgIn.value,
                onTimeMsg: E.onTimeMsgIn.value,
                lateMsg: E.lateMsgIn.value,
                scanType: E.scanType.value
            })
        });
        bindQR(data);
    } catch (e) {
        showToast('error', 'Generate failed');
    }
};

/** Bind QR data **/
function bindQR(d) {
    currentQR = d.token;
    liveTs = new Date(d.liveAt).getTime();
    expiryTs = new Date(d.expiresAt).getTime();
    qrCategory = d.category;
    qrIssuerId = d.issuedBy;
    thresholds.early = d.earlyWindow * 60000;
    thresholds.late = d.lateWindow * 60000;
    thresholds.absent = d.duration * 60000;

    E.qrLoading.classList.add('hidden');
    E.qrCanvas.classList.remove('hidden');
    window.QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });
    E.cancelQRBtn.style.display = (['developer', 'admin', 'category-admin'].includes(role) ? 'block' : 'none');
    startTimer();
    if (window.innerWidth <= 600) E.formCard.classList.add('hidden');
    localStorage.setItem('qrState', JSON.stringify({
        token: currentQR, liveTs, expiryTs,
        category: qrCategory, issuerId: qrIssuerId,
        scanType: E.scanType.value,
        earlyMs: thresholds.early, lateMs: thresholds.late, absentMs: thresholds.absent
    }));
}

/** Timer **/
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const rem = expiryTs - Date.now();
        if (rem <= 0) { resetUI(); return; }
        const mm = String(Math.floor(rem / 60000)).padStart(2, '0'),
            ss = String(Math.floor((rem % 60000) / 1000)).padStart(2, '0');
        E.qrTimer.textContent = `Expires in ${mm}:${ss}`;
        E.applyBtn.disabled = true;
    }, 1000);
}

/** Restore from localStorage **/
function restoreFromLocal() {
    const s = JSON.parse(localStorage.getItem('qrState') || '{}');
    if (s.token && Date.now() < s.expiryTs) {
        Object.assign(thresholds, { early: s.earlyMs, late: s.lateMs, absent: s.absentMs });
        qrCategory = s.category; qrIssuerId = s.issuerId;
        currentQR = s.token; liveTs = s.liveTs; expiryTs = s.expiryTs;
        E.scanType.value = s.scanType;
        bindQR(s);
    }
}

/** Reset UI **/
function resetUI() {
    clearInterval(timerInterval);
    localStorage.removeItem('qrState');
    E.qrCanvas.classList.add('hidden');
    E.qrTimer.textContent = '';
    E.cancelQRBtn.style.display = 'none';
    E.applyBtn.disabled = false;
    if (window.innerWidth <= 600) E.formCard.classList.remove('hidden');
}

/** Scanner **/
async function initScanner() {
    E.scannerLoading.classList.remove('hidden');
    html5QrInstance = new Html5Qrcode('qr-reader');
    const cfg = { fps: 20, qrbox: 300 };
    try {
        await html5QrInstance.start({ facingMode: 'environment' }, cfg, onScan);
    } catch {
        try {
            await html5QrInstance.start({ facingMode: 'user' }, cfg, onScan);
        } catch (e) {
            showToast('error', 'Camera error: ' + e.message);
        }
    } finally {
        E.scannerLoading.classList.add('hidden');
    }
}

async function onScan(token) {
    if (token !== currentQR) return showToast('error', 'Invalid QR');
    if (qrIssuerId === userId) return showToast('error', 'Cannot scan own QR');
    if (qrCategory && qrCategory !== userCategory) return showToast('error', 'Wrong category');

    const now = Date.now(), key = `${currentQR}::${E.scanType.value}`;
    if (attendanceCache[key]) return popFeedback(attendanceCache[key], key);

    if (now > expiryTs) {
        try {
            await apiFetch('/api/attendance/punch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qrToken: currentQR, type: E.scanType.value, status: 'absent', reason: null })
            });
            return showToast('success', 'Marked absent');
        } catch (e) {
            return showToast('error', 'Punch failed');
        }
    }

    // Early / On-time / Late
    let title, custom, needReason = false;
    if (now < liveTs - thresholds.early) {
        title = 'Early';
        custom = E.earlyMsgIn.value || `Early by ${Math.ceil((liveTs - now) / 60000)}m`;
    } else if (now <= liveTs + thresholds.late) {
        title = 'On Time';
        custom = E.onTimeMsgIn.value || 'On time';
    } else {
        title = 'Late';
        custom = E.lateMsgIn.value || `Late by ${Math.ceil((now - (liveTs + thresholds.late)) / 60000)}m`;
        needReason = true;
    }

    attendanceCache[key] = { title, custom, needReason, punched: false };
    popFeedback(attendanceCache[key], key);
}

function popFeedback(rec, key) {
    html5QrInstance?.stop();
    E.fbTitle.textContent = rec.title;
    E.fbMsg.textContent = rec.custom;
    E.fbReasonContainer.classList.toggle('hidden', !rec.needReason);
    E.fbCard.classList.remove('hidden');

    E.fbOk.onclick = async () => {
        if (!rec.punched) {
            const reason = rec.needReason ? E.fbReason.value.trim() : null;
            if (rec.needReason && !reason) return showToast('error', 'Please supply reason');
            try {
                await apiFetch('/api/attendance/punch', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        qrToken: currentQR,
                        type: E.scanType.value,
                        status: rec.title.toLowerCase().replace(' ', '-'),
                        reason
                    })
                });
                showToast('success', `You are ${rec.title}`);
                rec.punched = true;
            } catch (e) {
                return showToast('error', 'Punch failed');
            }
        }
        E.fbCard.classList.add('hidden');
        // restart scanning for next user
        initScanner();
    };
}

/** Developer Manual Punch Helpers **/
async function loadAllUsersForDev() {
    try {
        const users = await apiFetch('/api/users/list'); // implement this endpoint
        users.forEach(u => {
            const o = document.createElement('option');
            o.value = u.id; o.textContent = u.name;
            E.devUserSelect.append(o);
        });
        E.devPunchInBtn.onclick = () => devPunch('punch-in');
        E.devPunchOutBtn.onclick = () => devPunch('punch-out');
    } catch { }
}
async function devPunch(type) {
    const uid = E.devUserSelect.value;
    if (!uid) return showToast('error', 'Select user');
    try {
        await apiFetch('/api/attendance/punch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, qrToken: null, type, status: type, reason: null })
        });
        showToast('success', `${type} for user done`);
    } catch { showToast('error', 'Manual punch failed'); }
}
