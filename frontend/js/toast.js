// js/toast.js

const container = document.createElement('div');
container.className = 'toast-container';
document.body.appendChild(container);

/**
 * Show a toast message.
 * @param {'success'|'error'} type
 * @param {string} message
 * @param {boolean} [withSpinner=false]
 * @param {number} [duration=3000]
 */
export function showToast(type, message, withSpinner = false, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    if (withSpinner) {
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        toast.appendChild(spinner);
    }

    const text = document.createElement('div');
    text.textContent = message;
    toast.appendChild(text);

    container.appendChild(toast);

    // Trigger show
    requestAnimationFrame(() => toast.classList.add('show'));

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}