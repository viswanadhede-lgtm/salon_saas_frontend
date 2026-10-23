/**
 * notifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Controller for the dedicated Notification Center (notifications.html).
 * Features:
 *   - Live Supabase pagination (25 / 50 / 100 rows per page)
 *   - Category filtering (All, Bookings, Customers, Staff, Sales, POS, Payments, Marketing, System, Unread only)
 *   - Date range filtering (All time, Today, 7 days, 30 days, 90 days)
 *   - Debounced search across title and message
 *   - Click-to-read with navigation to referenced pages
 *   - Bulk "Mark all as read" via RPC with fallback
 *   - Real-time unread badge counts synced with header bell
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './lib/supabase.js';

// ── DOM References ──
const listEl             = document.getElementById('ncList');
const skeletonEl         = document.getElementById('ncSkeleton');
const spinnerEl          = document.getElementById('ncSpinner');
const emptyEl            = document.getElementById('ncEmpty');
const emptyTitleEl       = document.getElementById('ncEmptyTitle');
const emptyDescEl        = document.getElementById('ncEmptyDesc');
const paginationEl       = document.getElementById('ncPagination');
const paginationInfoEl   = document.getElementById('ncPaginationInfo');
const paginationControls = document.getElementById('ncPaginationControls');
const resultsInfoEl      = document.getElementById('ncResultsInfo');
const searchInput        = document.getElementById('ncSearch');
const dateRangeSelect    = document.getElementById('ncDateRange');
const perPageSelect      = document.getElementById('ncPerPage');
const filterBar          = document.getElementById('ncFilterBar');
const btnMarkAllRead     = document.getElementById('ncBtnMarkAllRead');
const badgeUnreadEl      = document.getElementById('ncBadgeUnread');
const badgeAllEl         = document.getElementById('ncBadgeAll');

// ── State ──
let activeCategory = 'all';
let searchQuery    = '';
let dateRange      = 'all';
let perPage        = 50;
let currentPage    = 1;
let totalRecords   = 0;
let totalUnread    = 0;
let currentItems   = [];
let isLoading      = false;

// ── Context Helpers ──
function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch {
        return localStorage.getItem('company_id') || null;
    }
}

function getBranchId() {
    const fromDom = document.getElementById('branchSelect')?.value;
    const fromStorage = localStorage.getItem('branch_id') || localStorage.getItem('active_branch_id');
    const bId = (fromDom && fromDom !== 'branch_1' && fromDom !== 'branch_2' && fromDom !== 'all')
        ? fromDom
        : (fromStorage && fromStorage !== 'branch_1' && fromStorage !== 'branch_2' && fromStorage !== 'all' ? fromStorage : null);
    return bId;
}

// ── Category Metadata (Icons, Labels, Colors) ──
const CATEGORY_META = {
    bookings: {
        color: '#1d4ed8',
        chipClass: 'cat-bookings',
        label: 'Booking',
        feather: 'calendar'
    },
    customers: {
        color: '#7c3aed',
        chipClass: 'cat-customers',
        label: 'Customer',
        feather: 'users'
    },
    staff: {
        color: '#16a34a',
        chipClass: 'cat-staff',
        label: 'Staff',
        feather: 'user-check'
    },
    services: {
        color: '#059669',
        chipClass: 'cat-services',
        label: 'Service',
        feather: 'scissors'
    },
    sales: {
        color: '#b45309',
        chipClass: 'cat-sales',
        label: 'Sales',
        feather: 'shopping-cart'
    },
    pos: {
        color: '#c2410c',
        chipClass: 'cat-pos',
        label: 'POS',
        feather: 'monitor'
    },
    payments: {
        color: '#92400e',
        chipClass: 'cat-payments',
        label: 'Payment',
        feather: 'credit-card'
    },
    marketing: {
        color: '#9333ea',
        chipClass: 'cat-marketing',
        label: 'Marketing',
        feather: 'tag'
    },
    system: {
        color: '#475569',
        chipClass: 'cat-system',
        label: 'System',
        feather: 'cpu'
    }
};

function getCategoryMeta(cat) {
    return CATEGORY_META[cat] || {
        color: '#475569',
        chipClass: 'cat-default',
        label: cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Alert',
        feather: 'bell'
    };
}

// ── Format Relative Time ──
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
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Fetch Notifications with Filtering & Pagination ──
async function fetchNotifications() {
    const companyId = getCompanyId();
    if (!companyId) {
        showEmpty('Company not found', 'Please sign in or select a company to view notifications.');
        return;
    }

    isLoading = true;
    if (skeletonEl) skeletonEl.style.display = currentItems.length === 0 ? 'block' : 'none';
    if (spinnerEl && currentItems.length > 0) spinnerEl.classList.add('show');
    if (emptyEl) emptyEl.style.display = 'none';

    try {
        // Build base query
        let query = supabase
            .from('notifications')
            .select('id, company_id, branch_id, user_id, category, event_key, title, message, link, metadata, is_read, read_at, created_at', { count: 'exact' })
            .eq('company_id', companyId);

        // Optional branch filter
        const branchId = getBranchId();
        if (branchId) {
            query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
        }

        // Category filter
        if (activeCategory === 'unread') {
            query = query.eq('is_read', false);
        } else if (activeCategory !== 'all') {
            query = query.eq('category', activeCategory);
        }

        // Date range filter
        if (dateRange === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            query = query.gte('created_at', todayStart.toISOString());
        } else if (dateRange === '7') {
            const d = new Date(Date.now() - 7 * 86400000);
            query = query.gte('created_at', d.toISOString());
        } else if (dateRange === '30') {
            const d = new Date(Date.now() - 30 * 86400000);
            query = query.gte('created_at', d.toISOString());
        } else if (dateRange === '90') {
            const d = new Date(Date.now() - 90 * 86400000);
            query = query.gte('created_at', d.toISOString());
        }

        // Search filter (title or message ilike)
        if (searchQuery.trim()) {
            const term = searchQuery.trim();
            query = query.or(`title.ilike.*${encodeURIComponent(term)}*,message.ilike.*${encodeURIComponent(term)}*`);
        }

        // Order & Pagination
        query = query.order('created_at', { ascending: false });

        const from = (currentPage - 1) * perPage;
        const to   = from + perPage - 1;
        query = query.range(from, to);

        const { data, count, error } = await query;

        if (error) {
            console.warn('[NotificationCenter] Error fetching notifications:', error);
            // Fallback to local history
            loadFromLocalFallback();
            return;
        }

        currentItems = Array.isArray(data) ? data : [];
        totalRecords = typeof count === 'number' ? count : currentItems.length;

        renderList();
        renderPagination();
        updateResultsInfo();
        refreshCategoryCounts();

    } catch (err) {
        console.error('[NotificationCenter] Unexpected fetch error:', err);
        loadFromLocalFallback();
    } finally {
        isLoading = false;
        if (skeletonEl) skeletonEl.style.display = 'none';
        if (spinnerEl) spinnerEl.classList.remove('show');
    }
}

// ── Refresh Counts for All Category Tabs ──
async function refreshCategoryCounts() {
    const companyId = getCompanyId();
    if (!companyId) return;

    try {
        let countQuery = supabase
            .from('notifications')
            .select('category, is_read')
            .eq('company_id', companyId);

        const branchId = getBranchId();
        if (branchId) {
            countQuery = countQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`);
        }

        if (dateRange === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            countQuery = countQuery.gte('created_at', todayStart.toISOString());
        } else if (dateRange === '7') {
            countQuery = countQuery.gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
        } else if (dateRange === '30') {
            countQuery = countQuery.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
        } else if (dateRange === '90') {
            countQuery = countQuery.gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString());
        }

        const { data, error } = await countQuery;

        let rows = Array.isArray(data) ? data : [];

        // Fallback to local history if query fails or returns empty while local storage has records
        if (error || rows.length === 0) {
            try {
                const local = JSON.parse(localStorage.getItem(`notification_history_${companyId}`) || '[]');
                if (local.length > rows.length) {
                    rows = local.map(x => ({ category: x.category, is_read: !!x.read }));
                }
            } catch {}
        }

        const counts = {
            all: rows.length,
            unread: rows.filter(r => !r.is_read).length,
            bookings: rows.filter(r => (r.category || '').toLowerCase() === 'bookings').length,
            customers: rows.filter(r => (r.category || '').toLowerCase() === 'customers').length,
            staff: rows.filter(r => (r.category || '').toLowerCase() === 'staff').length,
            sales: rows.filter(r => (r.category || '').toLowerCase() === 'sales').length,
            pos: rows.filter(r => (r.category || '').toLowerCase() === 'pos').length,
            payments: rows.filter(r => (r.category || '').toLowerCase() === 'payments').length,
            marketing: rows.filter(r => (r.category || '').toLowerCase() === 'marketing').length,
            system: rows.filter(r => (r.category || '').toLowerCase() === 'system').length,
        };

        totalUnread = counts.unread;

        updateBadgeEl('ncBadgeAll', counts.all);
        updateBadgeEl('ncBadgeBookings', counts.bookings);
        updateBadgeEl('ncBadgeCustomers', counts.customers);
        updateBadgeEl('ncBadgeStaff', counts.staff);
        updateBadgeEl('ncBadgeSales', counts.sales);
        updateBadgeEl('ncBadgePos', counts.pos);
        updateBadgeEl('ncBadgePayments', counts.payments);
        updateBadgeEl('ncBadgeMarketing', counts.marketing);
        updateBadgeEl('ncBadgeSystem', counts.system);
        updateBadgeEl('ncBadgeUnread', counts.unread);

    } catch (e) {
        console.warn('[NotificationCenter] Could not refresh category counts:', e);
    }
}

function updateBadgeEl(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof count === 'number' && count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.style.display = 'inline-flex';
    } else {
        el.style.display = 'none';
    }
}

// ── Fallback to LocalStorage History (Offline / Demo) ──
function loadFromLocalFallback() {
    const companyId = getCompanyId() || 'default';
    let local = [];
    try {
        local = JSON.parse(localStorage.getItem(`notification_history_${companyId}`) || '[]');
    } catch {}

    // Apply category filter
    if (activeCategory === 'unread') {
        local = local.filter(x => !x.read);
    } else if (activeCategory !== 'all') {
        local = local.filter(x => (x.category || '').toLowerCase() === activeCategory.toLowerCase());
    }

    // Apply search filter
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        local = local.filter(x => 
            (x.title || '').toLowerCase().includes(q) || 
            (x.message || '').toLowerCase().includes(q)
        );
    }

    totalRecords = local.length;
    const from = (currentPage - 1) * perPage;
    currentItems = local.slice(from, from + perPage).map(x => ({
        id: x.id,
        category: x.category,
        title: x.title,
        message: x.message,
        link: x.link,
        is_read: !!x.read,
        created_at: x.timestamp || new Date().toISOString()
    }));

    renderList();
    renderPagination();
    updateResultsInfo();
}

// ── Render List Items ──
function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (currentItems.length === 0) {
        showEmpty(
            searchQuery ? 'No matching notifications' : 'No notifications in this view',
            searchQuery 
                ? `No notifications found matching "${searchQuery}". Try a different keyword or category.`
                : 'All caught up! New bookings, staff activity, and system updates will appear here.'
        );
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    currentItems.forEach(item => {
        const meta = getCategoryMeta(item.category);
        const isUnread = !item.is_read;

        const li = document.createElement('li');
        li.className = `nc-item ${isUnread ? 'unread' : ''}`;
        li.dataset.id = item.id;
        li.setAttribute('tabindex', '0');
        li.setAttribute('role', 'button');
        li.setAttribute('title', item.link ? `Go to ${item.link}` : 'Mark as read');

        li.innerHTML = `
            <div class="nc-item-icon-wrap ${meta.chipClass}">
                <i data-feather="${meta.feather}"></i>
            </div>
            <div class="nc-item-body">
                <div class="nc-item-top">
                    <h3 class="nc-item-title">${escapeHtml(item.title || 'Notification')}</h3>
                    <span class="nc-item-time">${formatTimeAgo(item.created_at)}</span>
                </div>
                <p class="nc-item-msg">${escapeHtml(item.message || '')}</p>
                <div class="nc-item-footer">
                    <span class="nc-item-chip ${meta.chipClass}">${meta.label}</span>
                    ${item.link ? `
                        <span style="font-size:0.75rem; color:#3b82f6; display:inline-flex; align-items:center; gap:2px; font-weight:500;">
                            View details
                            <i data-feather="arrow-right" style="width:12px; height:12px;"></i>
                        </span>
                    ` : ''}
                </div>
            </div>
            ${isUnread ? `<div class="nc-unread-dot" title="Unread"></div>` : ''}
        `;

        // Click handler: Mark as read + optional redirect
        li.addEventListener('click', () => handleItemClick(item, li));
        li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleItemClick(item, li);
            }
        });

        listEl.appendChild(li);
    });

    // Re-render Feather icons in newly created DOM
    if (window.feather) {
        window.feather.replace();
    }
}

// ── Item Click Interaction ──
async function handleItemClick(item, rowEl) {
    // If unread, mark it as read immediately in UI and Supabase
    if (!item.is_read) {
        item.is_read = true;
        rowEl.classList.remove('unread');
        const dot = rowEl.querySelector('.nc-unread-dot');
        if (dot) dot.remove();

        // Background update in Supabase
        try {
            supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', item.id)
                .then(() => {
                    // Refresh category counts & header bell badge
                    refreshCategoryCounts();
                    if (window.NotificationManager?.refreshUnreadCount) {
                        window.NotificationManager.refreshUnreadCount();
                    }
                });
        } catch (e) {
            console.warn('[NotificationCenter] Failed to update read state:', e);
        }
    }

    // If notification has a link, navigate to it smoothly
    if (item.link) {
        window.location.href = item.link;
    }
}

// ── Mark All Notifications Read ──
async function handleMarkAllRead() {
    const companyId = getCompanyId();
    if (!companyId) return;

    if (!btnMarkAllRead) return;
    const origHtml = btnMarkAllRead.innerHTML;
    btnMarkAllRead.disabled = true;
    btnMarkAllRead.innerHTML = `
        <div style="width:14px; height:14px; border:2px solid #cbd5e1; border-top-color:#3b82f6; border-radius:50%; animation:nc-spin 0.6s linear infinite;"></div>
        <span>Marking…</span>
    `;

    try {
        // Try RPC first
        const branchId = getBranchId();
        const { error: rpcErr } = await supabase.rpc('mark_all_notifications_read', {
            p_company_id: companyId,
            p_branch_id: branchId || null
        });

        if (rpcErr) {
            // Fallback direct update
            await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('company_id', companyId)
                .eq('is_read', false);
        }

        // Also mark local history read
        const localKey = `notification_history_${companyId}`;
        try {
            const hist = JSON.parse(localStorage.getItem(localKey) || '[]');
            hist.forEach(h => { h.read = true; });
            localStorage.setItem(localKey, JSON.stringify(hist));
        } catch {}

        // Notify notification-manager
        if (window.NotificationManager?.refreshUnreadCount) {
            window.NotificationManager.refreshUnreadCount();
        }

        // Refresh view
        await fetchNotifications();

    } catch (err) {
        console.error('[NotificationCenter] Failed to mark all as read:', err);
    } finally {
        btnMarkAllRead.disabled = false;
        btnMarkAllRead.innerHTML = origHtml;
        if (window.feather) window.feather.replace();
    }
}

// ── Pagination Controls ──
function renderPagination() {
    if (!paginationEl || !paginationControls) return;

    const totalPages = Math.ceil(totalRecords / perPage) || 1;

    if (totalRecords <= perPage && totalPages <= 1) {
        paginationEl.style.display = 'none';
        return;
    }

    paginationEl.style.display = 'flex';

    // Summary info
    const start = Math.min((currentPage - 1) * perPage + 1, totalRecords);
    const end   = Math.min(currentPage * perPage, totalRecords);
    if (paginationInfoEl) {
        paginationInfoEl.textContent = `Showing ${start} to ${end} of ${totalRecords.toLocaleString()} notifications`;
    }

    paginationControls.innerHTML = '';

    // Prev Button
    const btnPrev = document.createElement('button');
    btnPrev.className = 'nc-page-btn';
    btnPrev.innerHTML = '‹';
    btnPrev.disabled = currentPage <= 1;
    btnPrev.title = 'Previous page';
    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchNotifications();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    paginationControls.appendChild(btnPrev);

    // Numbered page buttons with smart windowing
    const pages = getPageNumbers(currentPage, totalPages);
    pages.forEach(p => {
        if (p === '...') {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '…';
            ellipsis.style.padding = '0 6px';
            ellipsis.style.color = '#94a3b8';
            paginationControls.appendChild(ellipsis);
        } else {
            const btnPage = document.createElement('button');
            btnPage.className = `nc-page-btn ${p === currentPage ? 'active' : ''}`;
            btnPage.textContent = p;
            btnPage.addEventListener('click', () => {
                if (p !== currentPage) {
                    currentPage = p;
                    fetchNotifications();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            paginationControls.appendChild(btnPage);
        }
    });

    // Next Button
    const btnNext = document.createElement('button');
    btnNext.className = 'nc-page-btn';
    btnNext.innerHTML = '›';
    btnNext.disabled = currentPage >= totalPages;
    btnNext.title = 'Next page';
    btnNext.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            fetchNotifications();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    paginationControls.appendChild(btnNext);
}

// ── Smart Page Numbers Array (e.g. [1, 2, 3, '...', 10]) ──
function getPageNumbers(current, total) {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
        return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
        return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
}

// ── Update Results Info Bar ──
function updateResultsInfo() {
    if (!resultsInfoEl) return;
    if (totalRecords === 0) {
        resultsInfoEl.textContent = '0 results';
    } else {
        resultsInfoEl.textContent = `${totalRecords.toLocaleString()} notification${totalRecords === 1 ? '' : 's'}`;
    }
}

// ── Show Empty State ──
function showEmpty(title, desc) {
    if (listEl) listEl.innerHTML = '';
    if (paginationEl) paginationEl.style.display = 'none';
    if (emptyEl) {
        emptyEl.style.display = 'flex';
        if (emptyTitleEl) emptyTitleEl.textContent = title;
        if (emptyDescEl)  emptyDescEl.textContent = desc;
    }
    if (resultsInfoEl) resultsInfoEl.textContent = '0 results';
}

// ── HTML Escape ──
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Debounce Helper ──
function debounce(fn, delay) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

// ── Setup Event Listeners ──
function initEventListeners() {
    // 1. Category Filter Tabs
    if (filterBar) {
        filterBar.querySelectorAll('.nc-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                filterBar.querySelectorAll('.nc-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = btn.dataset.category || 'all';
                currentPage = 1;
                fetchNotifications();
            });
        });
    }

    // 2. Search Input (Debounced)
    if (searchInput) {
        const onSearch = debounce(() => {
            searchQuery = searchInput.value || '';
            currentPage = 1;
            fetchNotifications();
        }, 280);

        searchInput.addEventListener('input', onSearch);
    }

    // 3. Date Range Selector
    if (dateRangeSelect) {
        dateRangeSelect.addEventListener('change', () => {
            dateRange = dateRangeSelect.value;
            currentPage = 1;
            fetchNotifications();
        });
    }

    // 4. Per-Page Selector
    if (perPageSelect) {
        perPageSelect.addEventListener('change', () => {
            perPage = parseInt(perPageSelect.value, 10) || 50;
            currentPage = 1;
            fetchNotifications();
        });
    }

    // 5. Mark All Read Button
    if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener('click', handleMarkAllRead);
    }

    // 6. Branch Switcher Sync
    document.getElementById('branchSelect')?.addEventListener('change', () => {
        currentPage = 1;
        fetchNotifications();
    });

    window.addEventListener('branch:changed', () => {
        currentPage = 1;
        fetchNotifications();
    });

    // 7. Global Notifications Changed Event
    window.addEventListener('notifications:changed', () => {
        fetchNotifications();
    });

    // 8. App Shell Ready (Mount branch selector listener)
    document.addEventListener('app-shell:ready', () => {
        document.getElementById('branchSelect')?.addEventListener('change', () => {
            currentPage = 1;
            fetchNotifications();
        });
    });
}

// ── Initialize on Page Load ──
function init() {
    initEventListeners();
    fetchNotifications();
    refreshCategoryCounts();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

