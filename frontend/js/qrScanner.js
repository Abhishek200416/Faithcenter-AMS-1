// public/js/qrScanner.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const E = {
    // form inputs
    dateIn: document.getElementById('dateInput'),
    timeIn: document.getElementById('timeInput'),
    earlyIn: document.getElementById('earlyThresh'),
    lateIn: document.getElementById('lateThresh'),
    absentIn: document.getElementById('absentCutoff'),
    earlyMsgIn: document.getElementById('earlyMsg'),
    onTimeMsgIn: document.getElementById('onTimeMsg'),
    lateMsgIn: document.getElementById('lateMsg'),

    // action selector
    scanType: document.getElementById('scanType'),

    // buttons & selects
    applyBtn: document.getElementById('applyBtn'),
    cancelQRBtn: document.getElementById('cancelQRBtn'),
    savePreset: document.getElementById('savePresetBtn'),
    presetSel: document.getElementById('presetSelect'),

    // panels + scanner
    formCard: document.querySelector('.qr-form'),
    qrOutput: document.getElementById('qrOutput'),
    qrLoading: document.getElementById('qrLoading'),
    qrCanvas: document.getElementById('qrCanvas'),
    qrTimer: document.getElementById('qrTimer'),
    scannerSection: document.getElementById('scannerSection'),
    scannerLoading: document.getElementById('scannerLoading'),

    // feedback
    fbCard: document.getElementById('feedbackCard'),
    fbTitle: document.getElementById('feedbackTitle'),
    fbMsg: document.getElementById('feedbackMsg'),
    fbReasonContainer: document.getElementById('feedbackReasonContainer'),
    fbReason: document.getElementById('feedbackReason'),
    fbOk: document.getElementById('feedbackOk'),

    // preset modal
    modal: document.getElementById('presetModal'),
    nameInput: document.getElementById('presetName'),
    cancelBtn: document.getElementById('presetCancel'),
    confirmBtn: document.getElementById('presetConfirm'),
};

let html5QrInstance;
let attendanceCache = {};
let currentQR, liveTs, expiryTs, qrCategory, qrIssuerId;
let userId, role, userCategory, isMember;
const thresholds = { early: 0, late: 0, absent: 0 };
let timerInterval;

const MODE = new URLSearchParams(window.location.search).get('mode');

/** 1) Bootstrap **/
(async function init() {
    try {
        const me = await apiFetch('/api/users/me');
        userId = me.id;
        role = me.role;
        userCategory = me.categoryType || null;
        isMember = (role === 'member' || role === 'usher');

        if (isMember || MODE === 'scan') {
            return showScannerOnly();
        }

        showGeneratorOnly();
        await loadPresets();

        // restore any unexpired QR
        const saved = JSON.parse(localStorage.getItem('qrState') || '{}');
        if (saved.token && Date.now() < saved.expiryTs) {
            Object.assign(thresholds, {
                early: saved.earlyMs,
                late: saved.lateMs,
                absent: saved.absentMs
            });
            qrCategory = saved.category;
            qrIssuerId = saved.issuerId;
            currentQR = saved.token;
            liveTs = saved.liveTs;
            expiryTs = saved.expiryTs;
            E.scanType.value = saved.scanType;
            restoreQRCode();
        }
    } catch {
        showToast('error', 'Unable to initialize QR page');
    }
})();

function showScannerOnly() {
    E.formCard.classList.add('hidden');
    E.qrOutput.classList.add('hidden');
    E.scannerSection.classList.remove('hidden');
    fetchActiveQR().then(initScanner).catch(() => {
        showToast('error', 'No active QR available');
    });
}

function showGeneratorOnly() {
    E.formCard.classList.remove('hidden');
    E.qrOutput.classList.remove('hidden');
    E.scannerSection.classList.add('hidden');
}

/** 2) Auto-fill IST date/time **/
window.addEventListener('load', () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 5.5 * 60 * 60000);
    E.dateIn.value = ist.toISOString().slice(0, 10);
    E.timeIn.value = ist.toTimeString().slice(0, 8);
});

/** 3) Fetch active QR **/
async function fetchActiveQR() {
    const data = await apiFetch('/api/qr/active');
    currentQR = data.token;
    qrCategory = data.category;
    qrIssuerId = data.issuedBy;
    liveTs = new Date(data.liveAt).getTime();
    expiryTs = new Date(data.expiresAt).getTime();
    thresholds.early = (data.earlyWindow || 0) * 60000;
    thresholds.late = (data.lateWindow || 0) * 60000;
    thresholds.absent = (data.duration || 0) * 60000;
}

/** 4) Cancel QR **/
E.cancelQRBtn.onclick = async () => {
    if (!currentQR) return showToast('error', 'No active QR to cancel');
    if (!confirm('Cancel this QR? All its attendance records will be removed.')) return;
    try {
        await apiFetch(`/api/qr/${currentQR}`, { method: 'DELETE' });
        showToast('success', 'QR cancelled – all attendances removed');
        localStorage.removeItem('qrState');
        E.qrCanvas.classList.add('hidden');
        E.qrTimer.textContent = '';
        E.applyBtn.disabled = false;
    } catch (err) {
        showToast('error', err.message || 'Cancel failed');
    }
};

/** 5) Presets **/
async function loadPresets() {
    E.presetSel.innerHTML = '<option value="">— Load Preset —</option>';
    try {
        const ps = await apiFetch('/api/presets');
        ps.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id; o.textContent = p.name;
            E.presetSel.append(o);
        });
    } catch {
        showToast('error', 'Could not load presets');
    }
}
E.presetSel.addEventListener('change', async () => {
    const id = E.presetSel.value;
    if (!id) return;
    try {
        const p = await apiFetch(`/api/presets/${id}`);
        Object.assign(E, {
            dateIn: p.date, timeIn: p.time,
            earlyIn: p.early, lateIn: p.late,
            absentIn: p.absent,
            earlyMsgIn: p.earlyMsg,
            onTimeMsgIn: p.onTimeMsg,
            lateMsgIn: p.lateMsg
        });
    } catch {
        showToast('error', 'Failed to load preset');
    }
});

/** 6) Generate QR **/
E.applyBtn.onclick = async () => {
    E.qrLoading.classList.remove('hidden');
    E.qrCanvas.classList.add('hidden');

    // Build UTC ISO from IST input
    const [Y, M, D] = E.dateIn.value.split('-').map(Number);
    const [h, m, s] = E.timeIn.value.split(':').map(Number);
    const liveAtISO = new Date(Date.UTC(Y, M - 1, D, h - 5, m - 30, s)).toISOString();

    try {
        const data = await apiFetch('/api/qr/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        // Adopt server values
        currentQR = data.token;
        liveTs = new Date(data.liveAt).getTime();
        expiryTs = new Date(data.expiresAt).getTime();
        qrCategory = data.category;
        qrIssuerId = data.issuedBy;
        thresholds.early = data.earlyWindow * 60000;
        thresholds.late = data.lateWindow * 60000;
        thresholds.absent = data.duration * 60000;

        E.qrLoading.classList.add('hidden');
        E.qrCanvas.classList.remove('hidden');
        window.QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });
        startTimer();

        localStorage.setItem('qrState', JSON.stringify({
            token: currentQR, liveTs, expiryTs,
            category: qrCategory, issuerId: qrIssuerId,
            scanType: E.scanType.value,
            earlyMs: thresholds.early,
            lateMs: thresholds.late,
            absentMs: thresholds.absent
        }));

        if (window.innerWidth <= 600) {
            E.formCard.classList.add('hidden');
        }
    } catch (err) {
        E.qrLoading.classList.add('hidden');
        showToast('error', 'QR generation failed: ' + err.message);
    }
};

/** 7) Timer **/
function startTimer() {
    clearInterval(timerInterval);
    function tick() {
        const d = expiryTs - Date.now();
        if (d <= 0) {
            E.qrTimer.textContent = 'Expired';
            clearInterval(timerInterval);
            localStorage.removeItem('qrState');
            E.qrCanvas.classList.add('hidden');
            E.applyBtn.disabled = false;
            if (window.innerWidth <= 600) E.formCard.classList.remove('hidden');
            return;
        }
        E.applyBtn.disabled = true;
        const mm = String(Math.floor(d / 60000)).padStart(2, '0');
        const ss = String(Math.floor((d % 60000) / 1000)).padStart(2, '0');
        E.qrTimer.textContent = `Expires in ${mm}:${ss}`;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
}

function restoreQRCode() {
    E.qrLoading.classList.add('hidden');
    E.qrCanvas.classList.remove('hidden');
    window.QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });
    startTimer();
    if (window.innerWidth <= 600) E.formCard.classList.add('hidden');
}

/** 8) Scanner Initialization **/
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
            showToast('error', 'Camera error: ' + (e.message || e));
        }
    } finally {
        E.scannerLoading.classList.add('hidden');
    }
}

/** 9) onScan Logic **/
async function onScan(token) {
    if (token !== currentQR) {
        return showToast('error', 'Invalid QR');
    }
    // Prevent issuer from scanning own
    if (qrIssuerId === userId) {
        return showToast('error', 'You cannot scan your own QR');
    }
    // Category check
    if (qrCategory && qrCategory !== userCategory) {
        return showToast('error', 'Not for your category');
    }

    const now = Date.now();
    const key = `${currentQR}::${E.scanType.value}`;
    if (attendanceCache[key]) {
        return popFeedback(attendanceCache[key], key);
    }
    // Expired → auto absent
    if (now > expiryTs) {
        try {
            await apiFetch('/api/attendance/punch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qrToken: currentQR,
                    type: E.scanType.value,
                    status: 'absent',
                    reason: null
                })
            });
            return showToast('success', 'Marked absent (expired)');
        } catch (e) {
            return showToast('error', e.message || 'Punch failed');
        }
    }

    // Compute Early / On Time / Late
    let title, main, custom, needReason = false;
    if (now < liveTs - thresholds.early) {
        title = 'Early';
        main = `Early by ${Math.ceil((liveTs - now) / 60000)}m`;
        custom = E.earlyMsgIn.value || main;
    } else if (now <= liveTs + thresholds.late) {
        title = 'On Time';
        main = 'On time';
        custom = E.onTimeMsgIn.value || main;
    } else {
        title = 'Late';
        main = `Late by ${Math.ceil((now - (liveTs + thresholds.late)) / 60000)}m`;
        custom = E.lateMsgIn.value || main;
        needReason = true;
    }

    attendanceCache[key] = { title, main, custom, needReason, punched: false };
    popFeedback(attendanceCache[key], key);
}

/** 10) Feedback & Punch **/
function popFeedback(rec, key) {
    html5QrInstance?.stop();
    E.fbTitle.textContent = rec.title;
    E.fbMsg.textContent = rec.custom;
    E.fbReasonContainer.classList.toggle('hidden', !rec.needReason);
    E.fbCard.classList.remove('hidden');

    E.fbOk.onclick = async () => {
        if (!rec.punched) {
            const reason = rec.needReason ? E.fbReason.value.trim() : null;
            if (rec.needReason && !reason) {
                return showToast('error', 'Please supply a reason');
            }
            try {
                await apiFetch('/api/attendance/punch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                return showToast('error', e.message || 'Punch failed');
            }
        }
        E.fbCard.classList.add('hidden');
        window.location.href = 'dashboard.html';
    };
}
