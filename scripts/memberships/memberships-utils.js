// scripts/memberships/memberships-utils.js

/**
 * Display toast notification at bottom right.
 * Preserves support for custom color strings (e.g. #ef4444, #f59e0b) or error booleans.
 */
export function showToast(msg, colorOrIsError) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.className = 'toast-notification';
        toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #1e293b; color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); z-index: 9999; font-size: 0.9rem; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; opacity: 0; transform: translateY(20px); pointer-events: none;';
        document.body.appendChild(toast);
        
        const style = document.createElement('style');
        style.innerHTML = `
            #toastNotification.show {
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    if (typeof colorOrIsError === 'string') {
        toast.style.background = colorOrIsError;
    } else if (colorOrIsError === true) {
        toast.style.background = '#ef4444';
    } else {
        toast.style.background = '#1e293b';
    }

    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

/**
 * Format date as DD-MM-YYYY
 */
export function formatDateDMY(d) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt)) return '-';
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Format date in UK English: DD Mon YYYY (e.g. 15 Oct 2024)
 */
export function formatDateGB(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Calculate difference in years, months, and days between two dates.
 */
export function calculateDurationBetweenDates(startInput, endInput) {
    if (!startInput) return 'Unknown';
    const s = new Date(startInput);
    const e = endInput ? new Date(endInput) : new Date();
    if (isNaN(s) || isNaN(e)) return 'Unknown';

    let years = e.getFullYear() - s.getFullYear();
    let months = e.getMonth() - s.getMonth();
    let days = e.getDate() - s.getDate();
    if (days < 0) {
        months -= 1;
        days += new Date(e.getFullYear(), e.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    let arr = [];
    if (years > 0) arr.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) arr.push(`${months} month${months > 1 ? 's' : ''}`);
    if (days > 0) arr.push(`${days} day${days > 1 ? 's' : ''}`);
    return arr.join(' ') || '0 days';
}
