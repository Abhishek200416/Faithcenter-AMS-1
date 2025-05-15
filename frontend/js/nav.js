// 1. Auto-inject sidebar/nav based on role stored in localStorage.user
(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const links = [
        ['dashboard.html', 'Dashboard'],
        ['attendance.html', 'Attendance'],
        ['profile.html', 'Profile'],
        ['manageUsers.html', 'Manage Users', 'admin,developer'],
        ['leaves.html', 'Leaves'],
        ['qr.html', 'QR Code'],
        ['developer.html', 'Developer', 'developer']
    ];

    const nav = document.createElement('nav');
    nav.id = 'sidebar';
    links.forEach(([href, label, roles]) => {
        if (roles && !roles.split(',').includes(user.role)) return;
        const a = document.createElement('a');
        a.href = href;
        a.textContent = label;
        a.className = 'nav-link';
        if (location.pathname.endsWith(href)) a.classList.add('active');
        nav.appendChild(a);
    });
    const btn = document.createElement('button');
    btn.textContent = 'Logout';
    btn.className = 'btn';
    btn.style.marginTop = 'auto';
    btn.onclick = () => { localStorage.clear();
        location = 'login.html'; };
    nav.appendChild(btn);

    document.body.prepend(nav);
})();