// public/js/qrScanner.js
import { apiFetch } from './utils.js';
import { showToast } from './toast.js';


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
    cancelQRBtn: document.getElementById('cancelQRBtn'),
    presetSel: document.getElementById('presetSelect'),
    savePreset: document.getElementById('savePresetBtn'),

    // PANELS
    generator: document.querySelector('.qr-form'),
    qrOutput: document.getElementById('qrOutput'),
    scannerSection: document.getElementById('scannerSection'),
    root: document.getElementById('app-root'),

    // QR DISPLAY
    qrLoading: document.getElementById('qrLoading'),
    qrCanvas: document.getElementById('qrCanvas'),
    qrTimer: document.getElementById('qrTimer'),
    liveBanner: document.getElementById('qrLiveBanner'),

    // SCANNER FEEDBACK
    scannerLoading: document.getElementById('scannerLoading'),
    fbCard: document.getElementById('feedbackCard'),
    fbTitle: document.getElementById('feedbackTitle'),
    fbMsg: document.getElementById('feedbackMsg'),
    fbReasonContainer: document.getElementById('feedbackReasonContainer'),
    fbReason: document.getElementById('feedbackReason'),
    fbOk: document.getElementById('feedbackOk'),
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

// —————————————————————————————————————————
// Bootstrap
// —————————————————————————————————————————
; (async function init() {
    E.root.classList.remove('hidden');
    hide(E.cancelQRBtn);

    try {
        const { id, role: r, categoryType } = await apiFetch('/api/users/me');
        userId = id; role = r; userCategory = categoryType;

        // Mode check
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

// —————————————————————————————————————————
// Modes
// —————————————————————————————————————————
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

// —————————————————————————————————————————
// Camera Permission + PWA Install Prompt
// —————————————————————————————————————————
function promptCameraPermission() {
    const overlay = document.getElementById('cameraOverlay');
    if (!overlay) {
        fetchAndStartScanner();
        return;
    }
    show(overlay);
    document.getElementById('cameraOkBtn').onclick = async () => {
        hide(overlay);
        fetchAndStartScanner();
        await promptInstall();
    };
}

async function promptInstall() {
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
    });
    if (!deferred) return;
    if (confirm('📥 Add the scanner to your home screen for quick access?')) {
        deferred.prompt();
        await deferred.userChoice;
        deferred = null;
    }
}

// —————————————————————————————————————————
// FETCH Active QR
// —————————————————————————————————————————
async function fetchAndStartScanner() {
    try {
        const data = await apiFetch('/api/qr/active');
        show(E.liveBanner);
        E.liveBanner.textContent = '✅ A live QR code is available — please scan!';
        bindQR(data);
        startScanner();
    } catch {
        showToast('error', 'No active QR');
    }
}

// —————————————————————————————————————————
// QR Generation Flow
// —————————————————————————————————————————
E.applyBtn.onclick = async () => {
    await generateQR();
};

async function generateQR() {
    show(E.qrLoading);
    hide(E.qrCanvas);

    const liveAtISO = buildISO(E.dateIn.value, E.timeIn.value);

    try {
        const body = {
            liveAt: liveAtISO,
            durationMinutes: +E.absentIn.value,
            earlyWindow: +E.earlyIn.value,
            lateWindow: +E.lateIn.value,
            earlyMsg: E.earlyMsgIn.value,
            onTimeMsg: E.onTimeMsgIn.value,
            lateMsg: E.lateMsgIn.value,
            scanType: E.scanType.value
        };
        const data = await apiFetch('/api/qr/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        bindQR(data);
    } catch (err) {
        console.error(err);
        showToast('error', 'QR generation failed');
    }
}

// —————————————————————————————————————————
// Bind & Display QR + Timer
// —————————————————————————————————————————
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

    // Show cancel for privileged
    if (['developer', 'admin', 'category-admin'].includes(role)) {
        show(E.cancelQRBtn);
    }

    startCountdown();
    persistState();
}

// —————————————————————————————————————————
// Cancel QR
// —————————————————————————————————————————
E.cancelQRBtn.onclick = async () => {
    if (!currentQR || !confirm('Cancel this QR?')) return;
    try {
        await apiFetch(`/api/qr/${currentQR}`, { method: 'DELETE' });
        showToast('success', 'QR cancelled');
        resetGeneratorUI();
    } catch {
        showToast('error', 'Failed to cancel');
    }
};

// —————————————————————————————————————————
// Countdown Timer
// —————————————————————————————————————————
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
    hide(E.cancelQRBtn);
    E.applyBtn.disabled = false;
    show(E.generator);
}

// —————————————————————————————————————————
// Restore / Persist
// —————————————————————————————————————————
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
        currentQR = s.token; liveTs = s.liveTs; expiryTs = s.expiryTs;
        thresholds = { early: s.earlyMs, late: s.lateMs, absent: s.absentMs };
        E.scanType.value = s.scanType;
        bindQR(s);
    }
}

// —————————————————————————————————————————
// HTML5-QRCode Scanner with Auto‐Zoom Logic
// —————————————————————————————————————————
async function startScanner() {
    show(E.scannerLoading);
    qrScanner = new Html5Qrcode('qr-reader');

    const cfg = {
        fps: 10,
        qrbox: calculateQrBox(),
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    try {
        await qrScanner.start(
            { facingMode: 'environment' },
            cfg,
            onScanSuccess,
            onScanError
        );
    } catch (err) {
        console.warn('Env camera failed, trying user camera', err);
        await qrScanner.start({ facingMode: 'user' }, cfg, onScanSuccess, onScanError);
    } finally {
        hide(E.scannerLoading);
    }
}

// Calculate a dynamic 70%-of-min(viewport) square
function calculateQrBox() {
    const w = window.innerWidth * 0.7;
    const h = window.innerHeight * 0.7;
    return Math.floor(Math.min(w, h));
}

// If detection keeps missing, try to zoom camera (if supported)
function onScanError(err) {
    // err = “no QR” often
    const track = qrScanner.getState().stream?.getVideoTracks()[0];
    if (track && track.getCapabilities().zoom) {
        const cap = track.getCapabilities().zoom;
        const settings = track.getSettings();
        const newZoom = Math.min(cap.max, (settings.zoom || 1) + 0.1);
        track.applyConstraints({ advanced: [{ zoom: newZoom }] }).catch(() => { });
    }
}

// —————————————————————————————————————————
// Handle a successful scan
// —————————————————————————————————————————
async function onScanSuccess(token) {
    if (token !== currentQR) {
        return showToast('error', 'Invalid QR');
    }
    qrScanner.stop();  // pause scanning while we process

    // Prevent self-scan or wrong category
    if (qrCategory && qrCategory !== userCategory) {
        showToast('error', 'Wrong category');
        return startScanner();
    }
    if (userId === qrIssuerId) {
        showToast('error', 'Cannot scan your own QR');
        return startScanner();
    }

    handlePunch();
}

// —————————————————————————————————————————
// Punch logic: auto-absent, early/on-time/late, then feedback
// —————————————————————————————————————————
async function handlePunch() {
    const now = Date.now();
    const key = `${currentQR}::${E.scanType.value}`;

    if (attendanceCache[key]) {
        return showFeedback(attendanceCache[key], key);
    }

    // auto-absent
    if (now > expiryTs) {
        await apiFetch('/api/attendance/punch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                qrToken: currentQR, type: E.scanType.value,
                status: 'absent', reason: null
            })
        });
        showToast('success', 'Marked absent');
        return startScanner();
    }

    // classify time
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

// —————————————————————————————————————————
// Show modal, then submit to backend
// —————————————————————————————————————————
function showFeedback(rec, key) {
    E.fbTitle.textContent = rec.title;
    E.fbMsg.textContent = rec.custom;
    rec.needReason
        ? show(E.fbReasonContainer)
        : hide(E.fbReasonContainer);
    show(E.fbCard);

    E.fbOk.onclick = async () => {
        if (!rec.punched) {
            const reason = rec.needReason ? E.fbReason.value.trim() : null;
            if (rec.needReason && !reason) {
                return showToast('error', 'Please supply a reason');
            }
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
        }
        hide(E.fbCard);
        startScanner();
    };
}

// —————————————————————————————————————————
// Utility Helpers
// —————————————————————————————————————————
function buildISO(date, time) {
    const [Y, M, D] = date.split('-').map(Number);
    const [h, m, s] = time.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h - 5, m - 30, s)).toISOString();
}
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

