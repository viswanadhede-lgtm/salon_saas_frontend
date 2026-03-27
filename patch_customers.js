const fs = require('fs');

// ── Load file ──────────────────────────────────────────────
let html = fs.readFileSync('customers.html', 'utf8');

// ── 1. Add trend IDs ──────────────────────────────────────
html = html.replace(
    '<p class="stat-trend positive">\r\n                            <i data-feather="trending-up"></i>\r\n                            <span>+12% from last month</span>',
    '<p class="stat-trend positive" id="trendTotalCustomers">\r\n                            <i data-feather="trending-up"></i>\r\n                            <span>+12% from last month</span>'
);
html = html.replace(
    '<p class="stat-trend positive">\r\n                            <i data-feather="trending-up"></i>\r\n                            <span>+8% from last month</span>',
    '<p class="stat-trend positive" id="trendNewThisMonth">\r\n                            <i data-feather="trending-up"></i>\r\n                            <span>+8% from last month</span>'
);
html = html.replace(
    '<p class="stat-trend neutral">',
    '<p class="stat-trend neutral" id="trendVipCustomers">'
);
html = html.replace(
    '<p class="stat-trend negative">',
    '<p class="stat-trend negative" id="trendInactiveDays">'
);

// ── 2. Remove search button + divider ─────────────────────
html = html.replace(
    /\r?\n[ \t]*<div class="customers-search-divider"><\/div>\r?\n[ \t]*<button type="button" class="customers-search-btn">Search<\/button>/,
    ''
);

// ── 3. Remove pagination block ────────────────────────────
const paginationStart = html.indexOf('<!-- Pagination Footer -->');
const paginationEndMarker = '</div>\n            </div>';
if (paginationStart !== -1) {
    const closingDiv = html.indexOf('</div>\r\n            </div>', paginationStart);
    if (closingDiv !== -1) {
        html = html.slice(0, paginationStart) + html.slice(closingDiv + '</div>\r\n            </div>'.length);
    }
}

// ── 4. Clear out dummy tbody rows (keep empty tbody) ──────
html = html.replace(
    /(<tbody id="customersTableBody">)([\s\S]*?)(<\/tbody>)/,
    '$1\n                        $3'
);

// ── 5. Make Save Customer button green ─────────────────────
html = html.replace(
    'id="btnSaveNewCustomer">Save Customer</button>',
    'id="btnSaveNewCustomer" style="background: #10b981; border-color: #10b981;">Save Customer</button>'
);

// ── 6. Remove text-right from Actions <th> ────────────────
html = html.replace(
    '<th class="text-right">Actions</th>',
    '<th>Actions</th>'
);

// ── 7. Convert modal body to 2-column + add Notes ─────────
const oldBody = `            <!-- Body -->
            <div class="modal-body" style="padding: 1.5rem;">
                <div class="form-group">
                    <label class="form-label" for="newCustName">Full Name <span class="text-rose">*</span></label>
                    <input type="text" id="newCustName" class="form-input" placeholder="e.g., Jane Doe">
                </div>

                <div class="form-group">
                    <label class="form-label" for="newCustPhone">Phone Number <span class="text-rose">*</span></label>
                    <input type="tel" id="newCustPhone" class="form-input" placeholder="e.g., +91 98765 43210">
                </div>

                <div class="form-group">
                    <label class="form-label" for="newCustEmail">Email Address <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                    <input type="email" id="newCustEmail" class="form-input" placeholder="e.g., jane.doe@example.com">
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="newCustDob">Birthday <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <input type="date" id="newCustDob" class="form-input">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label" for="newCustTag">Customer Tag</label>
                        <select id="newCustTag" class="form-select">
                            <option value="new" selected>New</option>
                            <option value="regular">Regular</option>
                            <option value="vip">VIP</option>
                        </select>
                    </div>
                </div>
            </div>`;

const newBody = `            <!-- Body -->
            <div class="modal-body" style="padding: 1.5rem;">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="newCustName">Full Name <span class="text-rose">*</span></label>
                        <input type="text" id="newCustName" class="form-input" placeholder="e.g., Jane Doe">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustPhone">Phone Number <span class="text-rose">*</span></label>
                        <input type="tel" id="newCustPhone" class="form-input" placeholder="e.g., +91 98765 43210">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustEmail">Email Address <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <input type="email" id="newCustEmail" class="form-input" placeholder="e.g., jane.doe@example.com">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustDob">Birthday <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <input type="date" id="newCustDob" class="form-input">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="newCustTag">Customer Tag</label>
                        <select id="newCustTag" class="form-select">
                            <option value="new" selected>New</option>
                            <option value="regular">Regular</option>
                            <option value="vip">VIP</option>
                        </select>
                    </div>

                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label class="form-label" for="newCustNotes">Notes <span class="text-muted" style="font-weight: 400; font-size: 0.8rem;">(Optional)</span></label>
                        <textarea id="newCustNotes" class="form-input" rows="3" placeholder="Enter any preferences, allergies, or specific notes about the customer..."></textarea>
                    </div>
                </div>
            </div>`;

// Normalize line endings for matching
const normalised = html.replace(/\r\n/g, '\n');
const normalisedOld = oldBody.replace(/\r\n/g, '\n');
const normalisedNew = newBody.replace(/\r\n/g, '\n');
const patched = normalised.replace(normalisedOld, normalisedNew);

if (patched === normalised) {
    console.warn('WARNING: Modal body replacement did NOT match. Double-check content.');
} else {
    console.log('Modal body replaced successfully.');
}

// ── Save ──────────────────────────────────────────────────
fs.writeFileSync('customers.html', patched);
console.log('All patches applied to customers.html successfully!');
