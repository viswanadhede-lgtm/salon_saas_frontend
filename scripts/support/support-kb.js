// Init Feather Icons
if (typeof feather !== 'undefined') {
    feather.replace();
}

// ====== Support Knowledge Base =========================================================================
const SUPPORT_KB = [
    // Bookings
    { category: 'Bookings', question: 'How do I create a new booking?', answer: 'Click the "New Booking" button in the top-right of the header. Fill in the customer phone number, select a service, staff member, date and time, then click "Confirm Booking".' },
    { category: 'Bookings', question: 'How do I cancel or reschedule a booking?', answer: 'Go to the Bookings section from the sidebar. Find the booking, click the three-dot menu next to it, and choose "Cancel" or "Reschedule". Rescheduling opens the booking form pre-filled with existing details.' },
    { category: 'Bookings', question: 'Can I add notes to a booking?', answer: 'Yes. When creating or editing a booking, there is a "Booking Notes" field at the bottom of the form where you can add any special instructions or preferences for the customer.' },
    { category: 'Bookings', question: 'How do I search for an existing booking?', answer: 'Use the global search bar in the top header to search by customer name, phone number, or booking ID. The Bookings section also has its own filter and search.' },
    { category: 'Bookings', question: 'Can I book multiple services in one appointment?', answer: 'Currently, each booking supports one service at a time. To book multiple services, create separate bookings back-to-back for the same customer.' },

    // Billing & Subscription
    { category: 'Billing', question: 'How do I change my subscription plan?', answer: 'Navigate to Billing via the avatar dropdown menu. Click "Change Plan" to see available options. Upgrades take effect immediately; downgrades take effect at the end of your billing cycle.' },
    { category: 'Billing', question: 'Where can I download my invoice?', answer: 'Go to Billing → Payment History. Each invoice row has a "Download" icon on the right side that exports a PDF receipt.' },
    { category: 'Billing', question: 'How do I update my payment method?', answer: 'In the Billing page, scroll to the "Payment Method" card. Click "Update Card" and enter your new card details. Your next billing cycle will use the updated card.' },
    { category: 'Billing', question: 'What happens if my payment fails?', answer: 'You will receive an email notification. The system will retry automatically after 3 days. If payment still fails, your account will move to a limited mode until billing is resolved.' },

    // Staff
    { category: 'Staff', question: 'How do I add a new staff member?', answer: 'Go to Staff → Staff List from the sidebar. Click "Add Staff", enter their name, role, email and phone. They will receive an invite email to activate their account.' },
    { category: 'Staff', question: 'How do I set staff working hours?', answer: 'Navigate to Staff → Working Hours. Select the staff member and toggle on each working day. Set the start and end times for each day. Click Save.' },
    { category: 'Staff', question: 'How do I assign services to a staff member?', answer: 'Go to Staff → Service Assignment. Select the staff member and check the services they are qualified to perform. This controls which staff appear when customers book a specific service.' },
    { category: 'Staff', question: 'Can I deactivate a staff member without deleting them?', answer: 'Yes. In Staff → Staff List, click the staff card and toggle "Active" to off. Deactivated staff do not appear in booking forms but their history is retained.' },

    // Services
    { category: 'Services', question: 'How do I add a new service?', answer: 'Go to Services → Services from the sidebar. Click "Add Service", fill in the name, category, duration, and price. Save to make it available for booking.' },
    { category: 'Services', question: 'How do I organise services into categories?', answer: 'Go to Services → Categories. Create or edit categories here. When adding or editing a service, you can assign it to a category for easier browsing.' },
    { category: 'Services', question: 'How do I update the price of a service?', answer: 'Go to Services → Services, find the service and click Edit. Update the price field and click Save. Existing bookings are not affected.' },

    // Dashboard
    { category: 'Dashboard', question: 'My dashboard numbers are not updating live', answer: 'The dashboard auto-refreshes every 5 minutes. For immediate updates after a booking, manually refresh the browser page. Live real-time sync is planned for the next major release.' },
    { category: 'Dashboard', question: 'What does the dashboard show?', answer: 'The dashboard displays today\'s bookings, total revenue, active customers, and staff on duty. It also shows weekly revenue trends, upcoming appointments, and top-performing services.' },

    // Customers
    { category: 'Customers', question: 'How do I export my customer list?', answer: 'Under the "Customers" tab in the sidebar, click "Export to CSV" in the top-right corner. The export includes names, contact details, and total visit counts.' },
    { category: 'Customers', question: 'Can I view a customer\'s booking history?', answer: 'Yes. Open the Customers section, click any customer name to open their profile. The profile page shows all past and upcoming bookings, total spend, and notes.' },

    // Settings & App
    { category: 'Settings', question: 'How do I change the app language?', answer: 'Click your avatar in the top-right → Settings. Under "App Preferences", select your preferred language from the Language dropdown and save.' },
    { category: 'Settings', question: 'How do I change the theme to dark mode?', answer: 'Click your avatar → Settings → App Preferences. Change the Theme to "Dark". The change applies instantly without a page reload.' },
    { category: 'Settings', question: 'How do I update the app?', answer: 'Go to avatar → Settings → App Information. If an update is available, an "Update" button will appear next to the version status. Click it to install.' },

    // Marketing
    { category: 'Marketing', question: 'How do I create a discount coupon?', answer: 'Navigate to Marketing → Coupons. Click "Create Coupon", set the code, discount type (percentage or flat), value, and expiry date.' },
    { category: 'Marketing', question: 'How do I create membership plans?', answer: 'Go to Marketing → Membership Plans. Click "Add Plan", define the plan name, included services, validity period, and price.' },
];

// ====== Search Logic =================================================================================
let autoSearchTimer;

function highlight(text, query) {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:#fef3c7; color:#92400e; border-radius:3px; padding:0 2px;">$1</mark>');
}

// Called on every keystroke → manages button state AND auto-fires results
function onSupportInput(value) {
    const btn = document.getElementById('searchManualBtn');
    const clearBtn = document.getElementById('searchClearBtn');
    const hasText = value.trim().length >= 2;
    clearBtn.style.display = value.length > 0 ? 'block' : 'none';
    btn.disabled = !hasText;
    btn.style.color = hasText ? '#6366f1' : '#c7d2fe';
    btn.style.cursor = hasText ? 'pointer' : 'not-allowed';
    btn.style.background = 'transparent';
    if (!hasText) {
        document.getElementById('searchResultsPanel').style.display = 'none';
        clearTimeout(autoSearchTimer);
        return;
    }
    // Auto-fire with debounce so results appear as user types
    clearTimeout(autoSearchTimer);
    autoSearchTimer = setTimeout(() => runSupportSearch(value), 300);
}

// Triggered by button click or Enter key (immediate, no debounce)
function triggerSupportSearch() {
    clearTimeout(autoSearchTimer);
    const query = document.getElementById('supportSearch').value;
    if (query.trim().length < 2) return;
    runSupportSearch(query);
}

function runSupportSearch(query) {
    const panel = document.getElementById('searchResultsPanel');
    const inner = document.getElementById('searchResultsInner');

    const btn = document.getElementById('searchManualBtn');
    btn.textContent = 'Searching...';
    btn.disabled = true;

    setTimeout(() => {
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
        const results = SUPPORT_KB.filter(item => {
            const haystack = (item.question + ' ' + item.answer + ' ' + item.category).toLowerCase();
            return terms.every(t => haystack.includes(t));
        }).slice(0, 6);

        if (results.length === 0) {
            inner.innerHTML = `
                <div style="padding: 2.5rem; text-align: center; color: #94a3b8;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px; opacity:0.5;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <p style="font-size:0.95rem; font-weight:500; margin:0 0 4px;">No results found for "<strong>${query}</strong>"</p>
                    <p style="font-size:0.85rem; margin:0;">Try different keywords, or use <strong>Report an Issue</strong> to reach our team.</p>
                </div>`;
        } else {
            inner.innerHTML = results.map((r, i) => `
                <div style="padding: 1.1rem 1.5rem; ${i < results.length - 1 ? 'border-bottom: 1px solid #f1f5f9;' : ''} transition: background 0.15s; cursor: default;"
                     onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='transparent';">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                        <span style="font-size:0.72rem; font-weight:600; background:#ede9fe; color:#6d28d9; padding:2px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:0.04em;">${r.category}</span>
                        <p style="font-size:0.95rem; font-weight:600; color:#1e293b; margin:0;">${highlight(r.question, query)}</p>
                    </div>
                    <p style="font-size:0.875rem; color:#475569; margin:0; line-height:1.6; padding-left:2px;">${highlight(r.answer, query)}</p>
                </div>`).join('');
        }

        panel.style.display = 'block';
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Reset button
        btn.textContent = 'Search Manual';
        btn.disabled = false;
        btn.style.color = '#6366f1';
        btn.style.cursor = 'pointer';
    }, 250);
}

function clearSupportSearch() {
    const input = document.getElementById('supportSearch');
    input.value = '';
    document.getElementById('searchResultsPanel').style.display = 'none';
    document.getElementById('searchClearBtn').style.display = 'none';
    const btn = document.getElementById('searchManualBtn');
    btn.textContent = 'Search Manual';
    btn.disabled = true;
    btn.style.color = '#c7d2fe';
    btn.style.cursor = 'not-allowed';
    input.focus();
}

// Expose functions globally for inline HTML event handlers
window.onSupportInput = onSupportInput;
window.triggerSupportSearch = triggerSupportSearch;
window.runSupportSearch = runSupportSearch;
window.clearSupportSearch = clearSupportSearch;
window.highlight = highlight;
