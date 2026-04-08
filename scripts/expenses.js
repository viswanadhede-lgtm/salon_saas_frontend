import { supabase } from '../lib/supabase.js';

// ─── State ────────────────────────────────────────────────────────────────────
let allExpenses     = [];
let editingExpenseId = null; // null = create mode, string = edit mode

// ─── Context ──────────────────────────────────────────────────────────────────
const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
};

const getBranchId = () =>
    localStorage.getItem('active_branch_id') ||
    document.getElementById('branchSelect')?.value ||
    null;

const getUserInfo = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return {
            id:   ctx.user?.id || ctx.user?.user_id || null,
            name: ctx.user?.name || (ctx.user?.first_name
                ? `${ctx.user.first_name} ${ctx.user.last_name || ''}`.trim()
                : 'Admin')
        };
    } catch { return { id: null, name: 'Admin' }; }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
console.log('Expenses module loaded (Supabase)');
feather.replace();

document.getElementById('expensesDateRange').addEventListener('change', renderExpenses);
document.getElementById('filterCategory').addEventListener('change', renderExpenses);

document.getElementById('addExpenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    window.submitExpense();
});

document.getElementById('addExpenseModal').addEventListener('click', (e) => {
    if (e.target.id === 'addExpenseModal') window.closeAddExpenseModal();
});

// ─── Modal helpers ─────────────────────────────────────────────────────────────
window.openAddExpenseModal = () => {
    editingExpenseId = null;

    // Reset form
    document.getElementById('expenseDate').value     = new Date().toISOString().split('T')[0];
    document.getElementById('expenseCategory').value = '';
    document.getElementById('expenseAmount').value   = '';
    document.getElementById('expenseNotes').value    = '';

    // Set modal to "Create" mode
    const modal = document.getElementById('addExpenseModal');
    modal.querySelector('.modal-header h2').textContent = 'Add New Expense';
    modal.querySelector('.btn-primary').innerHTML       = 'Save Expense';

    modal.classList.add('active');
};

window.editExpense = (expenseId) => {
    const expense = allExpenses.find(e => (e.id || e.expense_id) === expenseId || String(e.id || e.expense_id) === String(expenseId));
    if (!expense) return;

    editingExpenseId = expenseId;

    // Pre-fill the form
    document.getElementById('expenseDate').value     = expense.date ? expense.date.split('T')[0] : '';
    document.getElementById('expenseCategory').value = expense.category || '';
    document.getElementById('expenseAmount').value   = expense.amount || '';
    document.getElementById('expenseNotes').value    = expense.notes || '';

    // Set modal to "Edit" mode
    const modal = document.getElementById('addExpenseModal');
    modal.querySelector('.modal-header h2').textContent = 'Edit Expense';
    modal.querySelector('.btn-primary').innerHTML       = 'Update Expense';

    modal.classList.add('active');
};

window.closeAddExpenseModal = () => {
    editingExpenseId = null;
    document.getElementById('addExpenseModal').classList.remove('active');
};

// ─── CREATE / UPDATE Expense (Supabase) ───────────────────────────────────────
window.submitExpense = async () => {
    const date     = document.getElementById('expenseDate').value;
    const category = document.getElementById('expenseCategory').value;
    const amount   = parseFloat(document.getElementById('expenseAmount').value);
    const notes    = document.getElementById('expenseNotes').value.trim();

    if (!date || !category || isNaN(amount)) {
        showToast('Please fill in all required fields.');
        return;
    }

    const btn = document.querySelector('#addExpenseModal .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = editingExpenseId ? 'Updating...' : 'Saving...';
    btn.disabled  = true;

    try {
        if (editingExpenseId) {
            // ── UPDATE ──
            // Try id first, fallback to expense_id
            let updateError;
            ({ error: updateError } = await supabase
                .from('expenses')
                .eq('id', editingExpenseId)
                .update({
                    date,
                    category,
                    amount,
                    notes:      notes || null,
                    status:     'active',
                    updated_at: new Date().toISOString()
                }));

            if (updateError) {
                ({ error: updateError } = await supabase
                    .from('expenses')
                    .eq('expense_id', editingExpenseId)
                    .update({
                        date,
                        category,
                        amount,
                        notes:      notes || null,
                        status:     'active',
                        updated_at: new Date().toISOString()
                    }));
            }
            const error = updateError;

            if (error) throw error;
            showToast('Expense updated successfully!');
        } else {
            // ── CREATE ──
            const user = getUserInfo();
            const { error } = await supabase
                .from('expenses')
                .insert({
                    company_id: getCompanyId(),
                    branch_id:  getBranchId(),
                    date,
                    category,
                    amount,
                    notes:      notes || null,
                    added_by:   user.id,
                    status:     'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            showToast('Expense saved successfully!');
        }

        window.closeAddExpenseModal();
        await fetchExpenses();
    } catch (err) {
        console.error('submitExpense error:', err);
        showToast('Failed to save expense: ' + (err.message || ''));
    } finally {
        btn.innerHTML = originalText;
        btn.disabled  = false;
    }
};

// ── Confirm Delete Modal Logic ──────────────────────────────────────────
let expenseToDeleteId = null;

function injectDeleteModal() {
    const style = document.createElement('style');
    style.textContent = `
        #deleteExpenseBackdrop { display: none; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px); z-index: 99999; align-items: center; justify-content: center; }
        #deleteExpenseBackdrop.active { display: flex; }
        #deleteExpenseBox { background: #fff; border-radius: 16px; padding: 2rem 2rem 1.5rem; width: 100%; max-width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); text-align: center; animation: logoutFadeIn 0.2s ease; }
        #deleteExpenseBox .delete-icon { width: 52px; height: 52px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; }
        #deleteExpenseBox .delete-icon svg { color: #ef4444; width: 24px; height: 24px; }
        #deleteExpenseBox h3 { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin: 0 0 0.4rem; }
        #deleteExpenseBox p { font-size: 0.875rem; color: #64748b; margin: 0 0 1.5rem; line-height: 1.4; }
        #deleteExpenseBox .delete-actions { display: flex; gap: 0.75rem; }
        #deleteExpenseBox .btn-cancel-delete { flex: 1; padding: 0.65rem 1rem; border-radius: 8px; border: 1.5px solid #e2e8f0; background: #fff; font-size: 0.875rem; font-weight: 600; color: #475569; cursor: pointer; transition: background 0.15s; }
        #deleteExpenseBox .btn-cancel-delete:hover { background: #f8fafc; }
        #deleteExpenseBox .btn-confirm-delete { flex: 1; padding: 0.65rem 1rem; border-radius: 8px; border: none; background: #ef4444; font-size: 0.875rem; font-weight: 600; color: #fff; cursor: pointer; transition: background 0.15s; }
        #deleteExpenseBox .btn-confirm-delete:hover { background: #dc2626; }
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'deleteExpenseBackdrop';
    backdrop.innerHTML = `
        <div id="deleteExpenseBox">
            <div class="delete-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </div>
            <h3>Delete Expense</h3>
            <p>Are you sure you want to delete this expense?<br>This action cannot be undone.</p>
            <div class="delete-actions">
                <button class="btn-cancel-delete" id="delExpCancelBtn">Cancel</button>
                <button class="btn-confirm-delete" id="delExpConfirmBtn">Yes, Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);

    document.getElementById('delExpCancelBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('delExpConfirmBtn').addEventListener('click', performDeleteExpense);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDeleteModal(); });
}

function closeDeleteModal() {
    document.getElementById('deleteExpenseBackdrop').classList.remove('active');
    expenseToDeleteId = null;
}

window.deleteExpense = function (id) {
    if (!document.getElementById('deleteExpenseBackdrop')) injectDeleteModal();
    expenseToDeleteId = id;
    document.getElementById('deleteExpenseBackdrop').classList.add('active');
};

async function performDeleteExpense() {
    const id = expenseToDeleteId;
    if (!id) return;
    closeDeleteModal();
    
    try {
        let error;
        ({ error } = await supabase
            .from('expenses')
            .eq('expense_id', id)
            .update({ status: 'deleted', updated_at: new Date().toISOString() }));

        if (error) {
            // Fallback for ID if standard expense_id fails
            ({ error } = await supabase
                .from('expenses')
                .eq('id', id)
                .update({ status: 'deleted', updated_at: new Date().toISOString() }));
        }

        if (error) throw error;

        showToast('Expense has been removed.');
        await fetchExpenses();
    } catch (err) {
        console.error("Error deleting expense:", err);
        showToast("Failed to delete expense", 'error');
    }
}

// ─── READ Expenses (Supabase) — excludes soft-deleted rows ───────────────────
async function fetchExpenses() {
    try {
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('company_id', getCompanyId())
            .neq('status', 'deleted')
            .order('date', { ascending: false });

        if (error) throw error;
        allExpenses = data || [];
    } catch (err) {
        console.error('fetchExpenses error:', err);
        showToast('Failed to load expenses: ' + (err.message || ''));
        allExpenses = [];
    }

    renderExpenses();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderExpenses() {
    const tbody           = document.getElementById('expensesTableBody');
    const dateRangeFilter = document.getElementById('expensesDateRange').value;
    const categoryFilter  = document.getElementById('filterCategory').value;

    const now             = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let filtered = allExpenses.filter(expense => {
        const expDate = new Date(expense.date);

        if (categoryFilter !== 'All' && expense.category !== categoryFilter) return false;

        if (dateRangeFilter === 'this_month') {
            if (expDate < startOfCurrentMonth || expDate > now) return false;
        } else if (dateRangeFilter === 'last_month') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            if (expDate < startOfLastMonth || expDate > endOfLastMonth) return false;
        } else if (dateRangeFilter === '30days') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);
            if (expDate < thirtyDaysAgo) return false;
        } else if (dateRangeFilter === '3months') {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(now.getMonth() - 3);
            if (expDate < threeMonthsAgo) return false;
        } else if (dateRangeFilter === '6months') {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            if (expDate < sixMonthsAgo) return false;
        } else if (dateRangeFilter === '12months') {
            const twelveMonths = new Date();
            twelveMonths.setFullYear(now.getFullYear() - 1);
            if (expDate < twelveMonths) return false;
        }
        // 'all' — no date filter

        return true;
    });

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    let totalSelectedRange = 0;
    let thisMonthTotal     = 0;

    allExpenses.forEach(exp => {
        if (new Date(exp.date) >= startOfCurrentMonth) {
            thisMonthTotal += parseFloat(exp.amount || 0);
        }
    });

    const badgeMap = {
        'Rent':        'bg-indigo-light text-indigo',
        'Salary':      'bg-emerald-light text-emerald',
        'Products':    'bg-blue-light text-blue',
        'Utilities':   'bg-amber-light text-amber',
        'Maintenance': 'bg-rose-light text-rose',
        'Marketing':   'bg-purple-light text-purple'
    };

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No expenses found for the selected criteria.</td></tr>`;
    } else {
        tbody.innerHTML = filtered.map(exp => {
            const amt        = parseFloat(exp.amount || 0);
            totalSelectedRange += amt;
            const badgeClass = badgeMap[exp.category] || 'bg-gray-100 text-gray-800';
            const expId      = exp.id || exp.expense_id;

            return `
                <tr>
                    <td>${new Date(exp.date).toLocaleDateString()}</td>
                    <td><span class="status-badge ${badgeClass}">${exp.category || 'Other'}</span></td>
                    <td style="font-weight: 600;">₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td class="text-muted" style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${exp.notes || ''}">${exp.notes || '-'}</td>
                    <td>${exp.added_by || 'Admin'}</td>
                    <td class="text-right">
                        <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
                            <button class="icon-btn" title="Edit Expense"
                                onclick="window.editExpense('${expId}')"
                                style="color:#3b82f6; border:1px solid #e2e8f0; border-radius:6px; padding:5px; background:#fff;">
                                <i data-feather="edit-2" style="width:15px;height:15px;"></i>
                            </button>
                            <button class="icon-btn text-danger" title="Delete Expense"
                                onclick="window.deleteExpense('${expId}')"
                                style="border:1px solid #e2e8f0; border-radius:6px; padding:5px; background:#fff;">
                                <i data-feather="trash-2" style="width:15px;height:15px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('cardTotalExpenses').innerText     = `₹${totalSelectedRange.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('cardThisMonthExpenses').innerText = `₹${thisMonthTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    feather.replace();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) { console.warn(msg); return; }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
fetchExpenses();
