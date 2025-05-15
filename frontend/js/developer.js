// js/developer.js
import { apiFetch } from './utils.js';

async function loadUsers() {
    const res = await apiFetch('/api/users');
    const { users } = await res.json();
    const tbody = document.querySelector('#usersDevTable tbody');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${u.name}</td><td>${u.role}</td><td>${u.email}</td>`;
        tbody.appendChild(tr);
    });
}

async function loadLeaves() {
    const res = await apiFetch('/api/leaves');
    const { leaves } = await res.json();
    const tbody = document.querySelector('#leavesDevTable tbody');
    tbody.innerHTML = '';
    leaves.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${l.user?.name||'Unknown'}</td>
      <td>${new Date(l.fromDate).toLocaleDateString()}</td>
      <td>${new Date(l.toDate).toLocaleDateString()}</td>
      <td>${l.status}</td>
    `;
        tbody.appendChild(tr);
    });
}

loadUsers();
loadLeaves();