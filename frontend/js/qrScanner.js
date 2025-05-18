// public/js/qrScanner.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

// ——————————————————————————————————————————————————
// ELEMENT REFS
// ——————————————————————————————————————————————————
const E = {
    // CONFIG
    dateIn: document.getElementById('dateInput'),
    timeIn: document.getElementById('timeInput'),
    earlyIn: document.getElementById('earlyThresh'),
    lateIn: document.getElementById('lateThresh'),
    absentIn: document.getElementById('absentCutoff'),
    earlyMsgIn: document.getElementById('earlyMsg'),
    onTimeMsgIn: document.getElementById('onTimeMsg'),
    lateMsgIn: document.getElementById('lateMsg'),
    scanType: document.getElementById('scanType'),

    // CONTROLS
    applyBtn: document.getElementById('applyBtn'),
    cancelBtn: document.getElementById('cancelQRBtn'),
    presetSel: document.getElementById('presetSelect'),
    savePresetBtn: document.getElementById('savePresetBtn'),

    // PANELS
    generator: document.querySelector('.qr-form'),
    qrOutput: document.getElementById('qrOutput'),
    scannerSection: document.getElementById('scannerSection'),
    liveBanner: document.getElementById('qrLiveBanner'),
    root: document.getElementById('app-root'),

    // QR DISPLAY
    qrLoading: document.getElementById('qrLoading'),
    qrCanvas: document.getElementById('qrCanvas'),
    qrTimer: document.getElementById('qrTimer'),

    // SCANNER FEEDBACK
    scannerLoading: document.getElementById('scannerLoading'),
    fbCard: document.getElementById('feedbackCard'),
    fbTitle: document.getElementById('feedbackTitle'),
    fbMsg: document.getElementById('feedbackMsg'),
    fbReasonContainer: document.getElementById('feedbackReasonContainer'),
    fbReason: document.getElementById('feedbackReason'),
    fbOk: document.getElementById('feedbackOk'),

    // CAMERA PERMISSION OVERLAY
    cameraOverlay: document.getElementById('cameraOverlay'),
    cameraOkBtn: document.getElementById('cameraOkBtn'),
};

let qrScanner,
    attendanceCache = {},
    currentQR = null,
    liveTs = 0,
    expiryTs = 0,
    thresholds = { early: 0, late: 0, absent: 0 },
    userId, role, userCategory,
    timerInterval;

const MODE = new URLSearchParams(window.location.search).get('mode');

// ——————————————————————————————————————————————————
// BOOTSTRAP
// ——————————————————————————————————————————————————
; (async function init() {
    E.root.classList.remove('hidden');
    hide(E.cancelBtn);

    // auto–fill IST now
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 5.5 * 60 * 60000);
    E.dateIn.value = ist.toISOString().slice(0, 10);
    E.timeIn.value = ist.toTimeString().slice(0, 8);

    try {
        const me = await apiFetch('/api/users/me');
        userId = me.id; role = me.role; userCategory = me.categoryType;

        if (['member', 'usher'].includes(role) || MODE === 'scan') {
            return enterScannerMode();
        }

        enterGeneratorMode();
        await loadPresets();
        restoreFromStorage();
    } catch (err) {
        console.error(err);
        showToast('error', 'Initialization failed');
    }
})();

// ——————————————————————————————————————————————————
// MODE SWITCHING
// ——————————————————————————————————————————————————
function enterGeneratorMode() {
    show(E.generator);
    show(E.qrOutput);
    hide(E.scannerSection);
}
function enterScannerMode() {
    hide(E.generator);
    hide(E.qrOutput);
    show(E.scannerSection);
    E.liveBanner?.classList.add('hidden');
    promptCameraPermission();
}

// ——————————————————————————————————————————————————
// CAMERA PERMISSION + PWA PROMPT
// ——————————————————————————————————————————————————
function promptCameraPermission() {
    if (!E.cameraOverlay) {
        fetchAndStartScanner();
        return;
    }
    show(E.cameraOverlay);
    E.cameraOkBtn.onclick = async () => {
        hide(E.cameraOverlay);
        fetchAndStartScanner();
        await promptInstall();
    };
}
async function promptInstall() {
    let deferred;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
    });
    if (!deferred) return;
    if (confirm('📥 Add scanner to home screen?')) {
        deferred.prompt();
        await deferred.userChoice;
    }
}

// ——————————————————————————————————————————————————
// PRESSETS
// ——————————————————————————————————————————————————
async function loadPresets() {
    E.presetSel.innerHTML = '<option value="">— Load Preset —</option>';
    try {
        const ps = await apiFetch('/api/presets');
        ps.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id; o.textContent = p.name;
            E.presetSel.append(o);
        });
        E.presetSel.onchange = async () => {
            if (!E.presetSel.value) return;
            const p = await apiFetch(`/api/presets/${E.presetSel.value}`);
            E.dateIn.value = p.date;
            E.timeIn.value = p.time;
            E.earlyIn.value = p.early;
            E.lateIn.value = p.late;
            E.absentIn.value = p.absent;
            E.earlyMsgIn.value = p.earlyMsg;
            E.onTimeMsgIn.value = p.onTimeMsg;
            E.lateMsgIn.value = p.lateMsg;
        };
        E.savePresetBtn.onclick = async () => {
            const name = prompt('Preset name?');
            if (!name) return;
            await apiFetch('/api/presets', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    date: E.dateIn.value,
                    time: E.timeIn.value,
                    early: E.earlyIn.value,
                    late: E.lateIn.value,
                    absent: E.absentIn.value,
                    earlyMsg: E.earlyMsgIn.value,
                    onTimeMsg: E.onTimeMsgIn.value,
                    lateMsg: E.lateMsgIn.value
                })
            });
            showToast('success', 'Preset saved');
            await loadPresets();
        };
    } catch {
        showToast('error', 'Could not load presets');
    }
}

// ——————————————————————————————————————————————————
// GENERATE & CANCEL QR
// ——————————————————————————————————————————————————
E.applyBtn.onclick = generateQR;
async function generateQR() {
    show(E.qrLoading);
    hide(E.qrCanvas);

    const liveAt = buildISO(E.dateIn.value, E.timeIn.value);
    try {
        const data = await apiFetch('/api/qr/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                liveAt,
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
    } catch {
        showToast('error', 'QR generation failed');
    }
}

function bindQR(d) {
    currentQR = d.token;
    liveTs = new Date(d.liveAt).getTime();
    expiryTs = new Date(d.expiresAt).getTime();
    thresholds = {
        early: d.earlyWindow * 60000,
        late: d.lateWindow * 60000,
        absent: d.duration * 60000
    };

    hide(E.qrLoading);
    show(E.qrCanvas);
    QRCode.toCanvas(E.qrCanvas, currentQR, { width: 250 });

    if (['developer', 'admin', 'category-admin'].includes(role)) {
        show(E.cancelBtn);
    }
    startCountdown();
    persistState();
}

E.cancelBtn.onclick = async () => {
    if (!currentQR || !confirm('Cancel this QR?')) return;
    try {
        await apiFetch(`/api/qr/${currentQR}`, { method: 'DELETE' });
        showToast('success', 'QR cancelled');
        resetGeneratorUI();
    } catch {
        showToast('error', 'Cancel failed');
    }
};

// ——————————————————————————————————————————————————
// COUNTDOWN
// ——————————————————————————————————————————————————
function startCountdown() {
    clearInterval(timerInterval);
    E.applyBtn.disabled = true;
    timerInterval = setInterval(() => {
        const rem = expiryTs - Date.now();
        if (rem <= 0) return resetGeneratorUI();
        const mm = String(Math.floor(rem / 60000)).padStart(2, '0');
        const ss = String(Math.floor((rem % 60000) / 1000)).padStart(2, '0');
        E.qrTimer.textContent = `Expires in ${mm}:${ss}`;
    }, 1000);
}
function resetGeneratorUI() {
    clearInterval(timerInterval);
    localStorage.removeItem('qrState');
    hide(E.qrCanvas);
    E.qrTimer.textContent = '';
    hide(E.cancelBtn);
    E.applyBtn.disabled = false;
    show(E.generator);
}

// ——————————————————————————————————————————————————
// PERSIST STATE
// ——————————————————————————————————————————————————
function persistState() {
    localStorage.setItem('qrState', JSON.stringify({
        token: currentQR,
        liveTs, expiryTs,
        earlyMs: thresholds.early,
        lateMs: thresholds.late,
        absentMs: thresholds.absent,
        scanType: E.scanType.value
    }));
}
function restoreFromStorage() {
    const s = JSON.parse(localStorage.getItem('qrState') || '{}');
    if (s.token && Date.now() < s.expiryTs) {
        currentQR = s.token;
        liveTs = s.liveTs;
        expiryTs = s.expiryTs;
        thresholds = { early: s.earlyMs, late: s.lateMs, absent: s.absentMs };
        E.scanType.value = s.scanType;
        bindQR(s);
    }
}

// ——————————————————————————————————————————————————
// SCANNER + AUTO-ZOOM
// ——————————————————————————————————————————————————
async function fetchAndStartScanner() {
    try {
        const data = await apiFetch('/api/qr/active');
        show(E.liveBanner);
        E.liveBanner.textContent = '✅ Live QR available—please scan!';
        bindQR(data);
        startScanner();
    } catch {
        showToast('error', 'No active QR');
    }
}

async function startScanner() {
    show(E.scannerLoading);
    qrScanner = new Html5Qrcode('qr-reader');

    const cfg = {
        fps: 10,
        qrbox: calculateQrBox(),
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    try {
        await qrScanner.start({ facingMode: 'environment' }, cfg, onScanSuccess, onScanError);
    } catch {
        await qrScanner.start({ facingMode: 'user' }, cfg, onScanSuccess, onScanError);
    } finally {
        hide(E.scannerLoading);
    }
}

function calculateQrBox() {
    const w = window.innerWidth * 0.7, h = window.innerHeight * 0.7;
    return Math.floor(Math.min(w, h));
}

function onScanError(err) {
    // gradually zoom if supported
    const track = qrScanner.getState().stream?.getVideoTracks()[0];
    if (track && track.getCapabilities().zoom) {
        const cap = track.getCapabilities().zoom;
        const cur = track.getSettings().zoom || 1;
        const next = Math.min(cap.max, cur + 0.1);
        track.applyConstraints({ advanced: [{ zoom: next }] }).catch(() => { });
    }
}

async function onScanSuccess(token) {
    if (token !== currentQR) {
        showToast('error', 'Invalid QR');
        return;
    }
    await qrScanner.stop();

    if (userId === role) { } // no self-scan
    if (userId === currentQR) { showToast('error', 'Cannot scan own QR'); return startScanner(); }
    if (userCategory && currentQR.category !== userCategory) {
        showToast('error', 'Wrong category'); return startScanner();
    }
    handlePunch();
}

// ——————————————————————————————————————————————————
// PUNCH LOGIC
// ——————————————————————————————————————————————————
async function handlePunch() {
    const now = Date.now();
    const key = `${currentQR}::${E.scanType.value}`;

    if (attendanceCache[key]) {
        return showFeedback(attendanceCache[key], key);
    }

    // auto-absent
    if (now > expiryTs) {
        await apiFetch('/api/attendance/punch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qrToken: currentQR, type: E.scanType.value, status: 'absent', reason: null })
        });
        showToast('success', 'Marked absent');
        return startScanner();
    }

    // classify
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
    showFeedback(attendanceCache[key], key);
}

function showFeedback(rec, key) {
    E.fbTitle.textContent = rec.title;
    E.fbMsg.textContent = rec.custom;
    rec.needReason ? show(E.fbReasonContainer) : hide(E.fbReasonContainer);
    show(E.fbCard);

    E.fbOk.onclick = async () => {
        if (!rec.punched) {
            if (rec.needReason && !E.fbReason.value.trim()) {
                return showToast('error', 'Please supply a reason');
            }
            await apiFetch('/api/attendance/punch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qrToken: currentQR,
                    type: E.scanType.value,
                    status: rec.title.toLowerCase().replace(' ', '-'),
                    reason: rec.needReason ? E.fbReason.value.trim() : null
                })
            });
            rec.punched = true;
            showToast('success', `You are ${rec.title}`);
        }
        hide(E.fbCard);
        startScanner();
    };
}

// ——————————————————————————————————————————————————
// HELPERS
// ——————————————————————————————————————————————————
function buildISO(date, time) {
    const [Y, M, D] = date.split('-').map(Number);
    const [h, m, s] = time.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h - 5, m - 30, s)).toISOString();
}
function show(el) { el && el.classList.remove('hidden'); }
function hide(el) { el && el.classList.add('hidden'); }
