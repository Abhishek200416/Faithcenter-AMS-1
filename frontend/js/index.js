// js/index.js
import { getToken } from './utils.js';

setTimeout(() => {
    const token = getToken();
    window.location.href = token ?
        'dashboard.html' :
        'login.html';
}, 800);