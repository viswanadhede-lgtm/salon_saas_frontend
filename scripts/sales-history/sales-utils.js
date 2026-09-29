// scripts/sales-history/sales-utils.js

/**
 * Shared utility functions for Sales History.
 */

export function showToast(msg, color) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    if (color) toast.style.background = color;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

export function formatCustomDateLabel(val) {
    if (!val) return '...';
    const d = new Date(val);
    const day = d.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st'
                 : day === 2 || day === 22 ? 'nd'
                 : day === 3 || day === 23 ? 'rd' : 'th';
    return `${day}${suffix} ${d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
}
