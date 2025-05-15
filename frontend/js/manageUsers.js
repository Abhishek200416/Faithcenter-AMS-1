import { apiFetch } from './utils.js';
import { showToast } from './toast.js';

const container = document.getElementById('usersContainer');
const filterInput = document.getElementById('filterInput');
const categoryFilter = document.getElementById('categoryFilter');
const addBtn = document.getElementById('addUserBtn');
const modal = document.getElementById('userModal');
const dialog = modal.querySelector('.modal-dialog');
const form = document.getElementById('userForm');
const cancelBtn = document.getElementById('cancelBtn');
const titleEl = document.getElementById('modalTitle');
const catSelect = document.getElementById('f-category');
const roleSelect = document.getElementById('f-role');
const nameInput = document.getElementById('f-name');
const emailInput = document.getElementById('f-email');
const phoneInput = document.getElementById('f-phone');
const ageInput = document.getElementById('f-age');
const userCountEl = document.getElementById('userCount');
const clearBtn = document.querySelector('.search-wrapper .clear-btn');

const confirmModal = document.getElementById('confirmModal');
const confirmMsg = document.getElementById('confirmMessage');
const yesBtn = document.getElementById('confirmYes');
const noBtn = document.getElementById('confirmNo');

let allUsers = [];
let myRole = '';
let myId = '';
let myCategory = '';
let editId = null;

const ROLE_LABELS = {
    developer: 'Developer',
    admin: 'Admin',
    'category-admin': 'Head',
    usher: 'Member'
};

// UID / username / password generators
const genUid = () => new Date().getFullYear().toString().slice(-2) +
    Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
const genUsername = n => n.replace(/\s+/g, '').toLowerCase() + '@1FC';
const genPassword = n => n.replace(/\s+/g, '').toLowerCase() + '@passFC';

// custom confirm
function openConfirm(msg) {
    return new Promise(res => {
        confirmMsg.textContent = msg;
        confirmModal.classList.add('active');
        const cleanup = () => {
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            confirmModal.classList.remove('active');
        };
        const onYes = () => {
            cleanup();
            res(true);
        };
        const onNo = () => {
            cleanup();
            res(false);
        };
        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// 1) who am I?
async function loadMe() {
    try {
        const { user } = await apiFetch('/api/users/me');
        myRole = user.role;
        myId = user.id;
        myCategory = user.categoryType || '';

        // only dev/admin can add
        // after:
        addBtn.style.display = ['developer', 'admin', 'category-admin'].includes(myRole) ? '' : 'none';

        // only dev/admin see global category filter
        categoryFilter.parentElement.style.display = ['developer', 'admin'].includes(myRole) ? '' : 'none';
    } catch {
        addBtn.style.display = 'none';
        categoryFilter.parentElement.style.display = 'none';
    }
}

// 2) which roles can I assign?
function updateRoleOptions() {
    roleSelect.innerHTML = `<option value="" disabled selected hidden>Role</option>`;
    let allowed = [];

    if (myRole === 'developer') allowed = ['developer', 'admin', 'category-admin', 'usher'];
    else if (myRole === 'admin') allowed = ['category-admin', 'usher'];
    else if (myRole === 'category-admin') allowed = ['usher'];

    allowed.forEach(r => {
        roleSelect.append(new Option(ROLE_LABELS[r], r));
    });
    roleSelect.disabled = !allowed.length;
}

// 3) load all users
async function loadUsers() {
    try {
        const { users } = await apiFetch('/api/users');

        let visibleUsers;
        if (myRole === 'developer') {
            // dev sees all
            visibleUsers = users;
        } else if (myRole === 'admin') {
            // admin sees only Heads & Members
            visibleUsers = users.filter(u =>
                u.role === 'category-admin' || u.role === 'usher'
            );
        } else if (myRole === 'category-admin') {
            // head sees only Members in their category
            visibleUsers = users.filter(u =>
                u.role === 'usher' && u.categoryType === myCategory
            );
        } else {
            // everyone else sees nobody
            visibleUsers = [];
        }

        allUsers = visibleUsers;
        applyFilters();
    } catch (err) {
        if (err.message.includes('Forbidden')) {
            showToast('error', 'You are not allowed to view these users.');
        } else {
            showToast('error', 'Unable to load users.');
        }
        container.innerHTML = '<div class="no-users">Unable to load users.</div>';
    }
}

// 4) render list
function renderCards(list) {
    userCountEl.textContent = list.length;
    container.innerHTML = '';
    if (!list.length) {
        container.innerHTML = '<div class="no-users">No users to display.</div>';
        return;
    }
    list.forEach(u => {
                const card = document.createElement('div');
                card.className = 'user-card';
                card.innerHTML = `
      <div class="user-card-header">
        <h3>${u.name}</h3>
        <div class="badges">
          <span class="badge">${ROLE_LABELS[u.role]||u.role}</span>
          ${u.categoryType
            ? `<span class="badge badge-cat">${u.categoryType.replace(/-head/,'')}</span>`
            : ''}
        </div>
      </div>
      <div class="user-card-detail">
        <p><strong>Username:</strong> ${u.username}</p>
        <p><strong>UID:</strong> ${u.uid}</p>
        <p><strong>Email:</strong> ${u.email}</p>
        <p><strong>Phone:</strong> ${u.phone||'—'}</p>
        <p><strong>Age:</strong> ${u.age||'—'}</p>
        <p><strong>Gender:</strong> ${u.gender}</p>
        <div class="actions">
          <button class="btn edit-btn">Edit</button>
          <button class="btn delete-btn">Delete</button>
        </div>
      </div>
    `;
    card.addEventListener('click', e => {
      if (!e.target.closest('.edit-btn, .delete-btn')) {
        card.classList.toggle('expanded');
      }
    });
    card.querySelector('.edit-btn').onclick = () => editUser(u.id);
    card.querySelector('.delete-btn').onclick = async e => {
      e.stopPropagation();
      if (await openConfirm(`Delete ${u.name}?`)) {
        try {
          await apiFetch(`/api/users/${u.id}`, { method:'DELETE' });
          showToast('success','User deleted');
          loadUsers();
        } catch (err) {
          showToast('error', err.message);
        }
      }
    };
    container.append(card);
  });
}

// 5) filter & clear
function applyFilters() {
  const t = filterInput.value.trim().toLowerCase();
  clearBtn.style.display = t ? 'block' : 'none';
  const c = categoryFilter.value;
  const filtered = allUsers.filter(u => {
    const mt = !t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t);
    const mc = !c || u.categoryType === c;
    return mt && mc;
  });
  renderCards(filtered);
}

// 6) listeners
filterInput.addEventListener('input', applyFilters);
categoryFilter.addEventListener('change', applyFilters);
clearBtn.addEventListener('click', () => {
  filterInput.value = '';
  filterInput.dispatchEvent(new Event('input'));
  filterInput.focus();
});

// 7) add‑user
addBtn.addEventListener('click', () => {
  editId = null;
  form.reset();
  titleEl.textContent = 'Add User';

  // if head, lock category → own
  if (myRole === 'category-admin') {
    catSelect.value    = myCategory;
    catSelect.disabled = true;
  } else {
    catSelect.value    = '';
    catSelect.disabled = false;
  }

  updateRoleOptions();

  // if head, force usher
  if (myRole === 'category-admin') {
    roleSelect.value    = 'usher';
    roleSelect.disabled = true;
  }

  openModal();
});

// 8) edit‑user
async function editUser(id) {
  try {
    const { user } = await apiFetch(`/api/users/${id}`);
    editId = id;

    nameInput.value    = user.name;
    emailInput.value   = user.email;
    phoneInput.value   = user.phone || '';
    ageInput.value     = user.age   || '';
    form.gender.value  = user.gender;
    catSelect.value    = user.categoryType || '';

    // lock category for head
    catSelect.disabled = myRole === 'category-admin';

    updateRoleOptions();
    form.role.value    = user.role;
    titleEl.textContent= 'Edit User';
    openModal();
  } catch {
    showToast('error','Unable to load user');
  }
}

// 9) cat → role
catSelect.addEventListener('change', updateRoleOptions);

// 10) modal open/close
function openModal() {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden','false');
  dialog.focus();
}
function closeModal() {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden','true');
}
cancelBtn.addEventListener('click', closeModal);
modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

// 11) input rules
nameInput.addEventListener('input',  () => {
  nameInput.value = nameInput.value.replace(/[^A-Za-z]/g,'');
});
phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/\D/g,'').slice(0,10);
});
ageInput.addEventListener('input',   () => {
  ageInput.value = ageInput.value.replace(/\D/g,'').slice(0,3);
});

// 12) submit
form.addEventListener('submit', async e => {
  e.preventDefault();
  const name  = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const age   = ageInput.value.trim();

  if (!/^[A-Za-z]+$/.test(name))
    return showToast('error','Name must be letters only');
  if (phone && !/^\d{10}$/.test(phone))
    return showToast('error','Phone must be 10 digits');
  if (age && !/^\d+$/.test(age))
    return showToast('error','Age must be numeric');

  const cleanCategory = catSelect.value.replace(/-head$/, '');
    const payload = {
        name,
       email,
       phone,
       age: age ? Number(age) : null,
        gender: form.gender.value,
        categoryType: cleanCategory,
        role: roleSelect.value,
        uid: genUid(),
        username: genUsername(name),
        password: genPassword(name)
      };
  const url    = editId ? `/api/users/${editId}` : '/api/users';
  const method = editId ? 'PUT' : 'POST';

  try {
    showToast('success', editId ? 'Updating…' : 'Creating…', true);
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    showToast('success', editId ? 'User updated' : 'User created');
    closeModal();
    loadUsers();
  } catch (err) {
    showToast('error', err.message);
  }
});

// 13) init
(async function(){
  closeModal();
  await loadMe();
  await loadUsers();
})();