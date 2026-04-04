const fs = require('fs');

const filepath = 'c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend\\expenses.html';
const content = fs.readFileSync(filepath, 'utf8');

// The main element starts like <main class="content-area">
const mainStartIndex = content.indexOf('<main class="content-area">');

const headerContent = content.substring(0, mainStartIndex);

const expensesContent = `        <main class="content-area">
            <div class="content-header" style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem;">
                <div>
                    <h1>Expenses</h1>
                    <p class="text-muted">Manage and track your business expenses</p>
                </div>
                <div class="content-actions" style="display: flex; gap: 12px; align-items: center;">
                    <div class="date-filter-wrap" style="position: relative;">
                        <i data-feather="calendar" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 14px; color: #64748b;"></i>
                        <select id="expensesDateRange" class="form-select" style="padding: 0 12px 0 36px; height: 40px; border-radius: 8px; font-size: 0.875rem; border: 1px solid #e2e8f0; background: #fff; cursor: pointer;">
                            <option value="this_month">This Month</option>
                            <option value="last_month">Last Month</option>
                            <option value="3months">Last 3 Months</option>
                            <option value="6months">Last 6 Months</option>
                            <option value="12months">Last 12 Months</option>
                            <option value="all">All Time</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" onclick="window.openAddExpenseModal()" style="display: flex; align-items: center; gap: 8px;">
                        <i data-feather="plus"></i>
                        Add Expense
                    </button>
                </div>
            </div>

            <!-- Summary Cards -->
            <div class="summary-cards" style="margin-bottom: 1.5rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem;">
                <div class="card stat-card">
                    <div class="stat-icon bg-indigo-light">
                        <i data-feather="dollar-sign" class="text-indigo"></i>
                    </div>
                    <div class="stat-details">
                        <p class="stat-label">Total Expenses (Selected Range)</p>
                        <h3 class="stat-value" id="cardTotalExpenses">₹0</h3>
                    </div>
                </div>
                <div class="card stat-card">
                    <div class="stat-icon bg-amber-light">
                        <i data-feather="calendar" class="text-amber"></i>
                    </div>
                    <div class="stat-details">
                        <p class="stat-label">This Month Expenses</p>
                        <h3 class="stat-value" id="cardThisMonthExpenses">₹0</h3>
                    </div>
                </div>
            </div>

            <!-- Filters & Table -->
            <div class="card" style="padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <div style="display: flex; gap: 1rem;">
                        <select id="filterCategory" class="form-select" style="width: 200px;">
                            <option value="All">All Categories</option>
                            <option value="Rent">Rent</option>
                            <option value="Salary">Salary</option>
                            <option value="Products">Products</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Marketing">Marketing</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>

                <div class="table-container">
                    <table class="data-table" id="expensesTable">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Amount</th>
                                <th>Notes</th>
                                <th>Added By</th>
                                <th class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="expensesTableBody">
                            <!-- Populated via JS -->
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    </div>

    <!-- Add Expense Modal -->
    <div class="modal-overlay" id="addExpenseModal">
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Add New Expense</h2>
                <button class="icon-btn" onclick="window.closeAddExpenseModal()"><i data-feather="x"></i></button>
            </div>
            <div class="modal-body">
                <form id="addExpenseForm">
                    <div class="form-group row">
                        <div class="col" style="flex: 1;">
                            <label class="form-label">Date <span class="required">*</span></label>
                            <input type="date" class="form-input" id="expenseDate" required>
                        </div>
                        <div class="col" style="flex: 1;">
                            <label class="form-label">Category <span class="required">*</span></label>
                            <select class="form-select" id="expenseCategory" required>
                                <option value="" disabled selected>Select Category</option>
                                <option value="Rent">Rent</option>
                                <option value="Salary">Salary</option>
                                <option value="Products">Products</option>
                                <option value="Utilities">Utilities</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Marketing">Marketing</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Amount (₹) <span class="required">*</span></label>
                        <input type="number" class="form-input" id="expenseAmount" min="0" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Notes</label>
                        <textarea class="form-textarea" id="expenseNotes" rows="3" placeholder="Optional details..."></textarea>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="window.closeAddExpenseModal()">Cancel</button>
                <button class="btn btn-primary" onclick="window.submitExpense()">Save Expense</button>
            </div>
        </div>
    </div>

    <script src="config/feature-registry.js" type="module"></script>
    <script src="config/api.js" type="module"></script>
    <script src="scripts/global-auth-guard.js" type="module"></script>
    <script src="scripts/logout.js" type="module"></script>
    <script src="scripts/expenses.js" type="module"></script>
    <script>
        feather.replace();
    </script>
</body>
</html>`;

// Also update the active class in the sidebar so overview is not active, but expenses is
let finalHeader = headerContent.replace(
    '<li><a href="overview.html" class="submenu-link active">', 
    '<li><a href="overview.html" class="submenu-link">'
);

finalHeader = finalHeader.replace(
    '<li><a href="expenses.html" class="submenu-link" data-feature="analytics_expenses">',
    '<li><a href="expenses.html" class="submenu-link active" data-feature="analytics_expenses">'
);

fs.writeFileSync(filepath, finalHeader + expensesContent);
console.log('expenses.html regenerated.');
