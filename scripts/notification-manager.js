/**
 * notification-manager.js
 * ─────────────────────────────────────────────────────────────
 * Global helper that checks notification preferences and shows
 * in-app popups + bell notifications when enabled.
 *
 * Usage from any module:
 *   window.notifyEvent('bookings', 'evt_booking_created', {
 *       title: 'New Booking',
 *       message: 'John Doe booked a Haircut at 3 PM'
 *   });
 * ─────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // ── Helpers ──
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            return ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch { return localStorage.getItem('company_id') || null; }
    }

    function getPrefs() {
        const companyId = getCompanyId();
        if (!companyId) return null;
        try {
            const raw = localStorage.getItem(`notification_prefs_${companyId}`);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    /**
     * Check whether a specific notification event is enabled.
     * @param {string} category  e.g. 'bookings', 'payments'
     * @param {string} eventKey  e.g. 'evt_booking_created'
     * @returns {boolean}
     */
    function shouldShowNotification(category, eventKey) {
        const prefs = getPrefs();
        if (!prefs) return true; // default ON if nothing saved yet
        const cat = prefs[category];
        if (!cat) return true;
        if (!cat.master) return false;
        if (typeof cat[eventKey] !== 'undefined') return !!cat[eventKey];
        return true; // unknown key → default on
    }

    /**
     * Show in-app popup toast notification.
     */
    function showPopupNotification(title, message) {
        // Create or reuse a notification popup container
        let container = document.getElementById('notif-popup-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notif-popup-container';
            container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
            document.body.appendChild(container);
        }

        const popup = document.createElement('div');
        popup.style.cssText = `
            background:#fff; border:1px solid #e2e8f0; border-radius:12px;
            box-shadow:0 10px 30px rgba(0,0,0,0.12); padding:14px 18px;
            max-width:340px; min-width:260px; pointer-events:auto;
            opacity:0; transform:translateX(30px); transition:all 0.35s ease;
            display:flex; align-items:flex-start; gap:12px;
            font-family:'Inter',sans-serif;
        `;
        popup.innerHTML = `
            <div style="width:36px;height:36px;border-radius:8px;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.85rem;font-weight:600;color:#0f172a;margin-bottom:2px;">${title}</div>
                <div style="font-size:0.8rem;color:#64748b;line-height:1.4;">${message}</div>
            </div>
            <button onclick="this.parentElement.remove()" style="border:none;background:none;cursor:pointer;color:#94a3b8;padding:0;line-height:1;font-size:1.1rem;">×</button>
        `;

        container.appendChild(popup);

        // Animate in
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translateX(0)';
        });

        // Auto-remove after 6s
        setTimeout(() => {
            popup.style.opacity = '0';
            popup.style.transform = 'translateX(30px)';
            setTimeout(() => popup.remove(), 350);
        }, 6000);
    }

    /**
     * Increment bell icon badge count.
     */
    function incrementBellBadge() {
        // Look for the bell icon button in the header
        const bellBtn = document.querySelector('.header-right .icon-btn');
        if (!bellBtn) return;

        let badge = bellBtn.querySelector('.notif-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'notif-badge';
            badge.style.cssText = `
                position:absolute; top:-4px; right:-4px;
                background:#ef4444; color:#fff; font-size:0.65rem;
                font-weight:700; min-width:16px; height:16px;
                border-radius:8px; display:flex; align-items:center;
                justify-content:center; padding:0 4px;
                border:2px solid #fff;
            `;
            bellBtn.style.position = 'relative';
            bellBtn.appendChild(badge);
        }

        const count = parseInt(badge.textContent || '0', 10) + 1;
        badge.textContent = count > 99 ? '99+' : count;
    }

    /**
     * Main entry point. Call this from any module when an event happens.
     * @param {string} category  e.g. 'bookings'
     * @param {string} eventKey  e.g. 'evt_booking_created'
     * @param {object} opts      { title: string, message: string }
     */
    function notifyEvent(category, eventKey, opts = {}) {
        if (!shouldShowNotification(category, eventKey)) return;

        const title = opts.title || 'Notification';
        const message = opts.message || '';

        showPopupNotification(title, message);
        incrementBellBadge();

        // Store in localStorage for a notification history panel (future)
        try {
            const companyId = getCompanyId();
            const historyKey = `notification_history_${companyId}`;
            const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
            history.unshift({
                category,
                eventKey,
                title,
                message,
                timestamp: new Date().toISOString(),
                read: false
            });
            // Keep last 50 notifications
            if (history.length > 50) history.length = 50;
            localStorage.setItem(historyKey, JSON.stringify(history));
        } catch (e) {
            console.warn('Could not store notification history:', e);
        }
    }

    // Expose globally
    window.shouldShowNotification = shouldShowNotification;
    window.notifyEvent = notifyEvent;
})();
