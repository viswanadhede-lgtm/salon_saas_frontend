/**
 * BharathBots Salon SaaS - Settings Business UI Interactions
 * Extracted from settings-business.html
 */

let isDirty = false;
window.isDirty = false;

export function markDirty() {
    isDirty = true;
    window.isDirty = true;
    const savebar = document.getElementById('savebar');
    if (savebar) savebar.classList.add('visible');
    if (typeof feather !== 'undefined') feather.replace();
}
window.markDirty = markDirty;

export function cancelChanges() {
    isDirty = false;
    window.isDirty = false;
    const savebar = document.getElementById('savebar');
    if (savebar) savebar.classList.remove('visible');
    if (typeof window.loadBusinessData === 'function') {
        window.loadBusinessData();
    }
}
window.cancelChanges = cancelChanges;

export function showToast(msg, type = 'success') {
    const t = document.getElementById('toastNotification');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'error' ? '#dc2626' : '#1e293b';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3500);
}
window.showToast = showToast;

window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});

function initSettingsBusinessUI() {
    if (typeof feather !== 'undefined') feather.replace();

    // Sidebar
    const sidebar = document.getElementById('sidebar');
    const mainWrapper = document.getElementById('mainWrapper');
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
        mainWrapper?.classList.toggle('sidebar-collapsed');
    });
    document.querySelectorAll('.submenu-toggle').forEach(t => t.addEventListener('click', () => t.closest('.nav-item')?.classList.toggle('open')));
    document.querySelectorAll('.nav-item.active').forEach(li => li.classList.add('open'));

    // Profile dropdown
    const avatarBtn = document.getElementById('avatarBtn');
    const profileMenu = document.getElementById('profileMenu');
    const backdrop = document.getElementById('profileBackdrop');
    avatarBtn?.addEventListener('click', e => {
        e.stopPropagation();
        profileMenu?.classList.toggle('show');
        backdrop?.classList.toggle('show');
    });
    backdrop?.addEventListener('click', () => {
        profileMenu?.classList.remove('show');
        backdrop?.classList.remove('show');
    });

    // Logo preview
    document.getElementById('logoFileInput')?.addEventListener('change', function(e) {
        if (e.target.files?.[0]) {
            const reader = new FileReader();
            reader.onload = ev => {
                const logoBox = document.getElementById('logoPreviewBox');
                if (logoBox) logoBox.innerHTML = `<img src="${ev.target.result}" alt="Logo">`;
                const btnRemove = document.getElementById('btnRemoveLogo');
                if (btnRemove) btnRemove.style.display = 'inline-flex';
                if (typeof feather !== 'undefined') feather.replace();
                markDirty();
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    // Cover image preview
    document.getElementById('coverFileInput')?.addEventListener('change', function(e) {
        if (e.target.files?.[0]) {
            const reader = new FileReader();
            reader.onload = ev => {
                const coverBox = document.getElementById('coverPreviewBox');
                if (coverBox) coverBox.innerHTML = `<img src="${ev.target.result}" alt="Cover">`;
                const btnRemove = document.getElementById('btnRemoveCover');
                if (btnRemove) btnRemove.style.display = 'inline-flex';
                if (typeof feather !== 'undefined') feather.replace();
                markDirty();
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    // Unsaved changes guard
    const inputs = document.querySelectorAll('.form-input, .form-select, .form-textarea');
    inputs.forEach(el => el.addEventListener('input', markDirty));
    inputs.forEach(el => el.addEventListener('change', markDirty));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsBusinessUI);
} else {
    initSettingsBusinessUI();
}
