const fs = require('fs');

const file = 'customers.html';
let content = fs.readFileSync(file, 'utf8');

// The 4 trend paragraph IDs
content = content.replace(
    '<p class="stat-trend positive">',
    '<p class="stat-trend positive" id="trendTotalCustomers">'
);
content = content.replace(
    '<p class="stat-trend positive">',
    '<p class="stat-trend positive" id="trendNewThisMonth">'
);
content = content.replace(
    '<p class="stat-trend neutral">',
    '<p class="stat-trend neutral" id="trendVipCustomers">'
);
content = content.replace(
    '<p class="stat-trend negative">',
    '<p class="stat-trend negative" id="trendInactiveDays">'
);

// The Search UI removal
const searchUiOld = `                        <input
                            type="text"
                            id="customerSearch"
                            class="customers-search-input"
                            placeholder="Search by name or phone"
                            autocomplete="off"
                        >
                        <div class="customers-search-divider"></div>
                        <button type="button" class="customers-search-btn">Search</button>
                    </div>`;

const searchUiNew = `                        <input
                            type="text"
                            id="customerSearch"
                            class="customers-search-input"
                            placeholder="Search by name or phone"
                            autocomplete="off"
                        >
                    </div>`;

content = content.replace(searchUiOld, searchUiNew);

fs.writeFileSync(file, content);
console.log('Fixed customers.html successfully without fuzzy patch destruction.');
