/**
 * notification-manager.js
 * ─────────────────────────────────────────────────────────────
 * Global helper that checks notification preferences and shows:
 * 1. In-app popup toasts
 * 2. Header bell badge counter
 * 3. Interactive bell notification dropdown panel with history
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

    // ── Helper: Company ID ──
    function getCompanyId() {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            return ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch { return localStorage.getItem('company_id') || null; }
    }

    // ── Helper: Notification Preferences ──
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
     */
    function shouldShowNotification(category, eventKey) {
        const prefs = getPrefs();
        if (!prefs) return true; // default ON if nothing saved yet
        const cat = prefs[category];
        if (!cat) return true;
        if (!cat.master) return false;
        if (typeof cat[eventKey] !== 'undefined') return !!cat[eventKey];
        return true;
    }

    // ── Helper: Notification History in LocalStorage ──
    function getHistoryKey() {
        const companyId = getCompanyId() || 'default';
        return `notification_history_${companyId}`;
    }

    function getHistory() {
        try {
            return JSON.parse(localStorage.getItem(getHistoryKey()) || '[]');
        } catch { return []; }
    }

    function saveHistory(history) {
        try {
            localStorage.setItem(getHistoryKey(), JSON.stringify(history));
        } catch (e) {
            console.warn('Could not save notification history:', e);
        }
    }

    // ── Icons & Colors Map by Category ──
    const CATEGORY_META = {
        bookings: {
            color: '#3b82f6',
            bg: '#eff6ff',
            label: 'Booking',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
        },
        customers: {
            color: '#8b5cf6',
            bg: '#f5f3ff',
            label: 'Customer',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
        },
        staff: {
            color: '#10b981',
            bg: '#f0fdf4',
            label: 'Staff',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>'
        },
        services: {
            color: '#059669',
            bg: '#ecfdf5',
            label: 'Service',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>'
        },
        sales: {
            color: '#f59e0b',
            bg: '#fffbeb',
            label: 'Sales',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'
        },
        pos: {
            color: '#f59e0b',
            bg: '#fffbeb',
            label: 'POS',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'
        },
        payments: {
            color: '#0d9488',
            bg: '#f0fdfa',
            label: 'Payment',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'
        },
        marketing: {
            color: '#d946ef',
            bg: '#fdf4ff',
            label: 'Marketing',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d946ef" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>'
        }
    };

    function getCategoryMeta(cat) {
        return CATEGORY_META[cat] || {
            color: '#3b82f6',
            bg: '#eff6ff',
            label: 'System',
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
        };
    }

    function formatTimeAgo(isoString) {
        if (!isoString) return '';
        const diffMs = Date.now() - new Date(isoString).getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 45) return 'Just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDays = Math.floor(diffHr / 24);
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    // ── Inject Scoped Styles ──
    function injectStyles() {
        if (document.getElementById('notif-manager-styles')) return;
        const style = document.createElement('style');
        style.id = 'notif-manager-styles';
        style.textContent = `
            .notif-bell-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .notif-badge {
                position: absolute;
                top: -3px;
                right: -4px;
                background: #ef4444;
                color: #ffffff;
                font-size: 0.65rem;
                font-weight: 700;
                min-width: 16px;
                height: 16px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                border: 2px solid #ffffff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.15);
                pointer-events: none;
                z-index: 2;
                box-sizing: border-box;
                line-height: 1;
            }
            .notif-dropdown {
                position: absolute;
                top: calc(100% + 10px);
                right: 0;
                width: 380px;
                max-width: calc(100vw - 28px);
                background: #ffffff;
                border-radius: 14px;
                box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.16), 0 6px 16px -2px rgba(15, 23, 42, 0.08);
                border: 1px solid #e2e8f0;
                z-index: 1000;
                display: none;
                flex-direction: column;
                overflow: hidden;
                font-family: 'Inter', -apple-system, sans-serif;
                animation: notifDropdownFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .notif-dropdown.show {
                display: flex;
            }
            @keyframes notifDropdownFade {
                from { opacity: 0; transform: translateY(-8px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            .notif-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 18px;
                border-bottom: 1px solid #f1f5f9;
                background: #ffffff;
            }
            .notif-title-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .notif-title {
                font-size: 0.95rem;
                font-weight: 700;
                color: #0f172a;
                margin: 0;
            }
            .notif-unread-pill {
                background: #eff6ff;
                color: #2563eb;
                font-size: 0.72rem;
                font-weight: 700;
                padding: 2px 7px;
                border-radius: 10px;
            }
            .notif-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .notif-btn-link {
                background: none;
                border: none;
                font-size: 0.76rem;
                font-weight: 600;
                color: #3b82f6;
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 6px;
                transition: background 0.15s, color 0.15s;
            }
            .notif-btn-link:hover {
                background: #eff6ff;
                color: #1d4ed8;
            }
            .notif-list {
                list-style: none;
                margin: 0;
                padding: 0;
                max-height: 380px;
                overflow-y: auto;
                overscroll-behavior: contain;
            }
            .notif-list::-webkit-scrollbar {
                width: 5px;
            }
            .notif-list::-webkit-scrollbar-thumb {
                background: #e2e8f0;
                border-radius: 4px;
            }
            .notif-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 12px 18px;
                border-bottom: 1px solid #f8fafc;
                cursor: pointer;
                transition: background 0.15s;
                position: relative;
            }
            .notif-item:hover {
                background: #f8fafc;
            }
            .notif-item.unread {
                background: #fcfdfe;
            }
            .notif-item.unread:hover {
                background: #f1f5f9;
            }
            .notif-item-icon {
                width: 34px;
                height: 34px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                margin-top: 1px;
            }
            .notif-item-body {
                flex: 1;
                min-width: 0;
            }
            .notif-item-title-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 2px;
            }
            .notif-item-title {
                font-size: 0.84rem;
                font-weight: 650;
                color: #0f172a;
                margin: 0;
            }
            .notif-item-time {
                font-size: 0.7rem;
                color: #94a3b8;
                font-weight: 500;
                white-space: nowrap;
                margin-left: 8px;
            }
            .notif-item-msg {
                font-size: 0.78rem;
                color: #64748b;
                line-height: 1.4;
                margin: 0;
                word-break: break-word;
            }
            .notif-unread-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #3b82f6;
                flex-shrink: 0;
                margin-top: 5px;
            }
            .notif-empty {
                padding: 38px 24px;
                text-align: center;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            .notif-empty-icon {
                width: 44px;
                height: 44px;
                border-radius: 12px;
                background: #f1f5f9;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #94a3b8;
                margin-bottom: 4px;
            }
            .notif-empty-title {
                font-size: 0.88rem;
                font-weight: 600;
                color: #475569;
                margin: 0;
            }
            .notif-empty-desc {
                font-size: 0.78rem;
                color: #94a3b8;
                max-width: 240px;
                line-height: 1.4;
                margin: 0;
            }
            .notif-footer {
                padding: 10px 18px;
                border-top: 1px solid #f1f5f9;
                background: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .notif-footer-link {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 0.8rem;
                font-weight: 600;
                color: #3b82f6;
                text-decoration: none;
                transition: color 0.15s;
            }
            .notif-footer-link:hover {
                color: #1d4ed8;
            }
            .notif-footer-link svg {
                width: 14px;
                height: 14px;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show in-app popup toast notification.
     */
    function showPopupNotification(title, message, category) {
        let container = document.getElementById('notif-popup-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notif-popup-container';
            container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
            document.body.appendChild(container);
        }

        const meta = getCategoryMeta(category);
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
            <div style="width:36px;height:36px;border-radius:9px;background:${meta.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                ${meta.svg}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.85rem;font-weight:600;color:#0f172a;margin-bottom:2px;">${title}</div>
                <div style="font-size:0.8rem;color:#64748b;line-height:1.4;">${message}</div>
            </div>
            <button onclick="this.parentElement.remove()" style="border:none;background:none;cursor:pointer;color:#94a3b8;padding:0;line-height:1;font-size:1.1rem;">×</button>
        `;

        container.appendChild(popup);

        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            popup.style.opacity = '0';
            popup.style.transform = 'translateX(30px)';
            setTimeout(() => popup.remove(), 350);
        }, 6000);
    }

    /**
     * Find the header bell icon button across any page.
     */
    function getBellBtn() {
        return document.querySelector('.header-right button.icon-btn') ||
               document.querySelector('header button.icon-btn') ||
               document.querySelector('.top-header button.icon-btn') ||
               document.querySelector('button[title*="Notification"]') ||
               document.querySelector('button i[data-feather="bell"]')?.closest('button') ||
               document.querySelector('button svg.feather-bell')?.closest('button');
    }

    /**
     * Update or hide the bell badge based on unread count.
     */
    function updateBellBadge() {
        const bellBtn = getBellBtn();
        if (!bellBtn) return;

        const history = getHistory();
        const unreadCount = history.filter(n => !n.read).length;

        let badge = bellBtn.querySelector('.notif-badge');
        const dot = bellBtn.querySelector('.notification-dot');

        if (unreadCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'notif-badge';
                bellBtn.style.position = 'relative';
                bellBtn.appendChild(badge);
            }
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
            if (dot) dot.style.display = 'none'; // Prefer count badge
        } else {
            if (badge) badge.style.display = 'none';
            if (dot) dot.style.display = 'none';
        }
    }

    /**
     * Render the notifications dropdown list.
     */
    function renderDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        if (!dropdown) return;

        const history = getHistory();
        const unreadCount = history.filter(n => !n.read).length;

        dropdown.innerHTML = `
            <div class="notif-header">
                <div class="notif-title-wrap">
                    <h3 class="notif-title">Notifications</h3>
                    ${unreadCount > 0 ? `<span class="notif-unread-pill">${unreadCount} new</span>` : ''}
                </div>
                <div class="notif-actions">
                    ${unreadCount > 0 ? `<button class="notif-btn-link" id="notifBtnMarkAllRead">Mark all read</button>` : ''}
                    ${history.length > 0 ? `<button class="notif-btn-link" id="notifBtnClearAll" style="color:#94a3b8;">Clear</button>` : ''}
                </div>
            </div>

            <ul class="notif-list">
                ${history.length === 0 ? `
                    <div class="notif-empty">
                        <div class="notif-empty-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        </div>
                        <p class="notif-empty-title">No notifications yet</p>
                        <p class="notif-empty-desc">When bookings, payments, or system events occur, you'll see them here.</p>
                    </div>
                ` : history.map((item, idx) => {
                    const meta = getCategoryMeta(item.category);
                    return `
                        <li class="notif-item ${item.read ? '' : 'unread'}" data-index="${idx}">
                            <div class="notif-item-icon" style="background:${meta.bg};">
                                ${meta.svg}
                            </div>
                            <div class="notif-item-body">
                                <div class="notif-item-title-row">
                                    <h4 class="notif-item-title">${item.title}</h4>
                                    <span class="notif-item-time">${formatTimeAgo(item.timestamp)}</span>
                                </div>
                                <p class="notif-item-msg">${item.message}</p>
                            </div>
                            ${item.read ? '' : '<span class="notif-unread-dot"></span>'}
                        </li>
                    `;
                }).join('')}
            </ul>

            <div class="notif-footer">
                <a href="settings-notifications.html" class="notif-footer-link">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>Notification Settings</span>
                </a>
            </div>
        `;

        // Wire: Mark all read
        dropdown.querySelector('#notifBtnMarkAllRead')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const curr = getHistory();
            curr.forEach(n => n.read = true);
            saveHistory(curr);
            updateBellBadge();
            renderDropdown();
        });

        // Wire: Clear all
        dropdown.querySelector('#notifBtnClearAll')?.addEventListener('click', (e) => {
            e.stopPropagation();
            saveHistory([]);
            updateBellBadge();
            renderDropdown();
        });

        // Wire: Click item marks as read
        dropdown.querySelectorAll('.notif-item').forEach(li => {
            li.addEventListener('click', () => {
                const idx = parseInt(li.getAttribute('data-index'), 10);
                const curr = getHistory();
                if (curr[idx]) {
                    curr[idx].read = true;
                    saveHistory(curr);
                    updateBellBadge();
                    renderDropdown();
                }
            });
        });
    }

    /**
     * Close the notifications dropdown.
     */
    function closeDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) dropdown.classList.remove('show');
    }

    /**
     * Toggle the notifications dropdown.
     */
    function toggleDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        if (!dropdown) return;
        const isOpen = dropdown.classList.contains('show');
        if (isOpen) {
            closeDropdown();
        } else {
            // Close profile dropdown if open
            document.getElementById('profileMenu')?.classList.remove('show');
            document.getElementById('profileBackdrop')?.classList.remove('show');
            renderDropdown();
            dropdown.classList.add('show');
        }
    }

    /**
     * Attach dropdown wrapper and events to the bell button.
     */
    function initBellDropdown() {
        injectStyles();

        const bellBtn = getBellBtn();
        if (!bellBtn) return;

        // Check if already wrapped
        let wrap = bellBtn.closest('.notif-bell-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'notif-bell-wrap';
            bellBtn.parentNode.insertBefore(wrap, bellBtn);
            wrap.appendChild(bellBtn);
        }

        // Create or find dropdown container
        let dropdown = document.getElementById('notificationDropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'notif-dropdown';
            dropdown.id = 'notificationDropdown';
            wrap.appendChild(dropdown);
        }

        // Handle click on bell button
        if (!bellBtn.__notifBound) {
            bellBtn.__notifBound = true;
            bellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleDropdown();
            });
        }

        updateBellBadge();
    }

    // ── Global delegated click handler (capture phase for maximum reliability) ──
    document.addEventListener('click', (e) => {
        const bellBtn = e.target.closest('button.icon-btn, button[title*="Notification"]');
        if (bellBtn && (
            bellBtn.querySelector('i[data-feather="bell"]') ||
            bellBtn.querySelector('svg.feather-bell') ||
            bellBtn.querySelector('.notification-dot') ||
            bellBtn.querySelector('.notif-badge') ||
            bellBtn.title?.toLowerCase().includes('notif') ||
            bellBtn.closest('.notif-bell-wrap')
        )) {
            e.stopPropagation();
            e.preventDefault();
            initBellDropdown();
            toggleDropdown();
            return;
        }

        // Close dropdown when clicking outside
        const wrap = document.querySelector('.notif-bell-wrap');
        if (wrap && !wrap.contains(e.target)) {
            closeDropdown();
        }
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
    });

    // ── Main Notify Event Handler ──
    function notifyEvent(category, eventKey, opts = {}) {
        if (!shouldShowNotification(category, eventKey)) return;

        const title = opts.title || 'Notification';
        const message = opts.message || '';

        // 1. Show popup toast
        showPopupNotification(title, message, category);

        // 2. Add to localStorage history
        try {
            const history = getHistory();
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
            saveHistory(history);
        } catch (e) {
            console.warn('Could not store notification history:', e);
        }

        // 3. Update bell badge
        updateBellBadge();

        // 4. Live update dropdown if currently open
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown && dropdown.classList.contains('show')) {
            renderDropdown();
        }
    }

    /**
     * Get active channels for a customer event.
     * @param {string} section  'booking' | 'purchase' | 'membership'
     * @param {string} eventKey e.g. 'booking_confirm'
     * @returns {string[]}      e.g. ['whatsapp', 'sms']
     */
    function getCustomerNotificationChannels(section, eventKey) {
        const prefs = getPrefs();
        const custPrefs = prefs?.customer_notifications;

        // Fallback default matrix
        const defaults = {
            booking: {
                master: true,
                events: {
                    booking_confirm:   { whatsapp: true, sms: true, email: true },
                    booking_modify:    { whatsapp: true, sms: true, email: false },
                    booking_cancel:    { whatsapp: true, sms: true, email: true },
                    booking_reminder:  { whatsapp: true, sms: true, email: false },
                    booking_complete:  { whatsapp: true, sms: false, email: false },
                    booking_noshow:    { whatsapp: false, sms: true, email: false }
                }
            },
            purchase: {
                master: true,
                events: {
                    purchase_confirm:  { whatsapp: true, sms: true, email: false },
                    payment_confirm:   { whatsapp: true, sms: true, email: true },
                    invoice_receipt:   { whatsapp: true, sms: false, email: true },
                    refund_confirm:    { whatsapp: true, sms: true, email: true }
                }
            },
            membership: {
                master: true,
                events: {
                    member_purchase:   { whatsapp: true, sms: true, email: true },
                    member_activate:   { whatsapp: true, sms: false, email: false },
                    member_expiring:   { whatsapp: true, sms: true, email: true },
                    member_expired:    { whatsapp: true, sms: true, email: true },
                    member_renewed:    { whatsapp: true, sms: true, email: true }
                }
            }
        };

        const secConfig = custPrefs ? custPrefs[section] : defaults[section];
        if (!secConfig || secConfig.master === false) return [];

        const evConfig = secConfig.events ? secConfig.events[eventKey] : defaults[section]?.events?.[eventKey];
        if (!evConfig) return [];

        return Object.keys(evConfig).filter(ch => !!evConfig[ch]);
    }

    /**
     * Internal customer notification dispatcher.
     * Evaluates channel preferences, dispatches event, and logs to customer delivery queue.
     */
    function notifyCustomer(section, eventKey, customer = {}, data = {}) {
        const channels = getCustomerNotificationChannels(section, eventKey);
        if (!channels || channels.length === 0) {
            return { dispatched: false, reason: 'no_channels_enabled' };
        }

        const payload = {
            section,
            eventKey,
            customer: {
                id: customer.id || customer.customer_id || null,
                name: customer.name || customer.customer_name || 'Customer',
                phone: customer.phone || customer.customer_phone || '',
                email: customer.email || customer.customer_email || ''
            },
            channels,
            data: data || {},
            timestamp: new Date().toISOString()
        };

        // 1. Store in local customer delivery queue (for logging & resilient retry)
        try {
            const companyId = getCompanyId() || 'default';
            const logKey = `customer_dispatch_queue_${companyId}`;
            const queue = JSON.parse(localStorage.getItem(logKey) || '[]');
            queue.unshift(payload);
            if (queue.length > 50) queue.length = 50;
            localStorage.setItem(logKey, JSON.stringify(queue));
        } catch (e) {
            console.warn('Could not store customer notification in queue:', e);
        }

        // 2. Broadcast browser event for real-time listeners / extensions
        window.dispatchEvent(new CustomEvent('customer_notification_dispatched', { detail: payload }));

        // 3. Trigger delivery provider adapter callback if registered
        if (typeof window.onCustomerNotificationDelivery === 'function') {
            try {
                window.onCustomerNotificationDelivery(payload);
            } catch (err) {
                console.error('Error in onCustomerNotificationDelivery handler:', err);
            }
        }

        console.log(`[Customer Notification Dispatch] [${channels.join(', ').toUpperCase()}]`, payload);
        return { dispatched: true, channels, payload };
    }

    // ── Auto-initialize on load ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBellDropdown);
    } else {
        initBellDropdown();
    }

    // Also run after a short delay in case header elements were injected dynamically
    setTimeout(initBellDropdown, 300);
    setTimeout(initBellDropdown, 1000);

    // Expose globally
    window.shouldShowNotification = shouldShowNotification;
    window.notifyEvent = notifyEvent;
    window.notifyCustomer = notifyCustomer;
    window.getCustomerNotificationChannels = getCustomerNotificationChannels;
    window.initNotificationBell = initBellDropdown;
})();
