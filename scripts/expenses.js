import { supabase } from '../lib/supabase.js';

// ─── State ────────────────────────────────────────────────────────────────────
let allExpenses      = [];
let editingExpenseId = null; // null = create mode, string = edit mode
let currentPage      = 1;
const PAGE_SIZE      = 25;
let searchQuery      = '';

// ─── Context Resolvers ────────────────────────────────────────────────────────
const getCompanyId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch {
        return localStorage.getItem('company_id') || null;
    }
};

const getBranchId = () => {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return localStorage.getItem('active_branch_id') || ctx.current_branch_id || document.getElementById('branchSelect')?.value || null;
    } catch {
        return localStorage.getItem('active_branch_id') || null;
    }
};

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

// ─── Date Helper ──────────────────────────────────────────────────────────────
const parseDateParts = (dateStr) => {
    if (!dateStr) return null;
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split('-');
    if (parts.length < 3) return null;
    const year  = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day   = parseInt(parts[2], 10);
    return {
        year,
        month,
        day,
        dateObj: new Date(year, month, day, 12, 0, 0)
    };
};

// ─── Forward Declarations for Clean Hoisting ─────────────────────────────────
export function renderExpenses() {
    renderExpensesTable();
}
window.renderExpenses = renderExpenses;

// ─── Date Filter Formatting & Selection ───────────────────────────────────────
window.formatExCustomDate = (dateStr) => {
    if (!dateStr) return '...';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '...';
        const day = d.getDate();
        const suffix = ["th", "st", "nd", "rd"][((day % 100) - 20) % 10] || ["th", "st", "nd", "rd"][day % 100] || "th";
        const month = d.toLocaleString('en-US', { month: 'short' });
        const year = d.getFullYear();
        return `${day}${suffix} ${month} ${year}`;
    } catch { return '...'; }
};

window.formatExCustomRange = () => {
    const start = document.getElementById('expensesCustomStart')?.value;
    const end = document.getElementById('expensesCustomEnd')?.value;
    if (!start && !end) return 'Custom Range';
    
    const badgeStyle = "background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:2px 8px; font-weight:600; color:#475569; font-size:0.8rem;";
    return `<span style="${badgeStyle}">${window.formatExCustomDate(start)}</span> <span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">to</span> <span style="${badgeStyle}">${window.formatExCustomDate(end)}</span>`;
};

window.setExpensesDateFilter = (val) => {
    const select = document.getElementById('expensesDateRange');
    if (select) {
        select.value = val;
    }
    
    const labelEl = document.getElementById('exDateLabel');
    const now = new Date();
    const currentMonthLong = now.toLocaleString('en-US', { month: 'long' });
    const currentMonthShort = now.toLocaleString('en-US', { month: 'short' });
    const currentYear = now.getFullYear();

    if (labelEl) {
        if (val === 'this_month') {
            labelEl.innerText = `This Month - ${currentMonthLong} ${currentYear}`;
        } else if (val === 'last_month') {
            const lastM = new Date(currentYear, now.getMonth() - 1, 1);
            labelEl.innerText = `Last Month - ${lastM.toLocaleString('en-US', { month: 'long' })} ${lastM.getFullYear()}`;
        } else if (val === '3months') {
            const past = new Date(currentYear, now.getMonth() - 3, 1);
            labelEl.innerText = `Last 3 Months - ${past.toLocaleString('en-US', { month: 'short' })} ${past.getFullYear()} to ${currentMonthShort} ${currentYear}`;
        } else if (val === '6months') {
            const past = new Date(currentYear, now.getMonth() - 6, 1);
            labelEl.innerText = `Last 6 Months - ${past.toLocaleString('en-US', { month: 'short' })} ${past.getFullYear()} to ${currentMonthShort} ${currentYear}`;
        } else if (val === '12months') {
            const past = new Date(currentYear - 1, now.getMonth(), 1);
            labelEl.innerText = `Last 12 Months - ${past.toLocaleString('en-US', { month: 'short' })} ${past.getFullYear()} to ${currentMonthShort} ${currentYear}`;
        } else if (val === 'all') {
            labelEl.innerText = 'All Time';
        } else if (val === 'custom') {
            labelEl.innerHTML = window.formatExCustomRange();
        }
    }
    
    const menu = document.getElementById('exDateMenu');
    if (menu) menu.style.display = 'none';

    currentPage = 1;
    renderExpenses();
};

// ─── Search Handlers ─────────────────────────────────────────────────────────
window.onExpenseSearch = (val) => {
    searchQuery = (val || '').trim().toLowerCase();
    const clearBtn = document.getElementById('expenseSearchClear');
    if (clearBtn) {
        clearBtn.style.display = searchQuery ? 'block' : 'none';
    }
    currentPage = 1;
    renderExpensesTable();
};

window.clearExpenseSearch = () => {
    const input = document.getElementById('expenseSearch');
    if (input) input.value = '';
    searchQuery = '';
    const clearBtn = document.getElementById('expenseSearchClear');
    if (clearBtn) clearBtn.style.display = 'none';
    currentPage = 1;
    renderExpensesTable();
    if (input) input.focus();
};

// ─── Modal Helpers ────────────────────────────────────────────────────────────
window.openAddExpenseModal = () => {
    editingExpenseId = null;

    // Reset form
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('expenseDate');
    if (dateInput) {
        dateInput.value = todayStr;
        dateInput.max   = todayStr;
    }
    const catInput = document.getElementById('expenseCategory');
    if (catInput) catInput.value = '';
    const amtInput = document.getElementById('expenseAmount');
    if (amtInput) amtInput.value = '';
    const notesInput = document.getElementById('expenseNotes');
    if (notesInput) notesInput.value = '';

    // Set modal to "Create" mode
    const modal = document.getElementById('addExpenseModal');
    if (modal) {
        const title = modal.querySelector('.modal-header h2');
        if (title) title.textContent = 'Add New Expense';
        const saveBtn = modal.querySelector('.btn-primary');
        if (saveBtn) saveBtn.innerHTML = 'Save Expense';
        modal.classList.add('active');
    }
};

window.editExpense = (expenseId) => {
    const expense = allExpenses.find(e => (e.id || e.expense_id) === expenseId || String(e.id || e.expense_id) === String(expenseId));
    if (!expense) return;

    editingExpenseId = expenseId;

    // Pre-fill the form
    const dateInput = document.getElementById('expenseDate');
    if (dateInput) {
        dateInput.value = expense.date ? expense.date.split('T')[0] : '';
        dateInput.max   = new Date().toISOString().split('T')[0];
    }
    const catInput = document.getElementById('expenseCategory');
    if (catInput) catInput.value = expense.category || '';
    const amtInput = document.getElementById('expenseAmount');
    if (amtInput) amtInput.value = expense.amount || '';
    const notesInput = document.getElementById('expenseNotes');
    if (notesInput) notesInput.value = expense.notes || '';

    // Set modal to "Edit" mode
    const modal = document.getElementById('addExpenseModal');
    if (modal) {
        const title = modal.querySelector('.modal-header h2');
        if (title) title.textContent = 'Edit Expense';
        const saveBtn = modal.querySelector('.btn-primary');
        if (saveBtn) saveBtn.innerHTML = 'Update Expense';
        modal.classList.add('active');
    }
};

window.closeAddExpenseModal = () => {
    editingExpenseId = null;
    document.getElementById('addExpenseModal')?.classList.remove('active');
};

window.viewExpenseNotes = (expenseId) => {
    const expense = allExpenses.find(e => (e.id || e.expense_id) === expenseId || String(e.id || e.expense_id) === String(expenseId));
    if (!expense) return;
    
    const content = document.getElementById('expenseNotesContent');
    if (content) content.textContent = expense.notes || 'No notes provided.';
    document.getElementById('viewExpenseNotesModal')?.classList.add('active');
};

window.closeExpenseNotesModal = () => {
    document.getElementById('viewExpenseNotesModal')?.classList.remove('active');
};

// ─── CREATE / UPDATE Expense (Supabase) ───────────────────────────────────────
window.submitExpense = async () => {
    const date     = document.getElementById('expenseDate')?.value;
    const category = document.getElementById('expenseCategory')?.value;
    const amount   = parseFloat(document.getElementById('expenseAmount')?.value);
    const notes    = document.getElementById('expenseNotes')?.value?.trim() || null;

    if (!date || !category || isNaN(amount)) {
        showToast('Please fill in all required fields.');
        return;
    }

    const btn = document.querySelector('#addExpenseModal .btn-primary');
    const originalText = btn ? btn.innerHTML : 'Save';
    if (btn) {
        btn.innerHTML = editingExpenseId ? 'Updating...' : 'Saving...';
        btn.disabled  = true;
    }

    try {
        if (editingExpenseId) {
            // ── UPDATE ──
            const updatePayload = {
                date,
                category,
                amount,
                notes,
                status:     'active',
                updated_at: new Date().toISOString()
            };

            let { error } = await supabase
                .from('expenses')
                .update(updatePayload)
                .eq('expense_id', editingExpenseId);

            if (error) {
                // Fallback for id if expense_id is not mapped
                ({ error } = await supabase
                    .from('expenses')
                    .update(updatePayload)
                    .eq('id', editingExpenseId));
            }

            if (error) throw error;
            showToast('Expense updated successfully!');
        } else {
            // ── CREATE ──
            const user = getUserInfo();
            const rawBranch = getBranchId();
            const branchId = rawBranch && rawBranch !== 'all' ? rawBranch : null;

            const { error } = await supabase
                .from('expenses')
                .insert({
                    company_id: getCompanyId(),
                    branch_id:  branchId,
                    date,
                    category,
                    amount,
                    notes,
                    staff_id:   user.id,
                    staff_name: user.name || user.first_name || 'Admin',
                    status:     'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            showToast('Expense saved successfully!');
        }

        window.closeAddExpenseModal();
        await loadAllExpenseData();
    } catch (err) {
        console.error('submitExpense error:', err);
        showToast('Failed to save expense: ' + (err.message || ''));
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled  = false;
        }
    }
};

// ─── Confirm Delete Modal Logic ───────────────────────────────────────────────
let expenseToDeleteId = null;

function injectDeleteModal() {
    if (document.getElementById('deleteExpenseBackdrop')) return;
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

    document.getElementById('delExpCancelBtn')?.addEventListener('click', closeDeleteModal);
    document.getElementById('delExpConfirmBtn')?.addEventListener('click', performDeleteExpense);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDeleteModal(); });
}

function closeDeleteModal() {
    document.getElementById('deleteExpenseBackdrop')?.classList.remove('active');
    expenseToDeleteId = null;
}

window.deleteExpense = function (id) {
    if (!document.getElementById('deleteExpenseBackdrop')) injectDeleteModal();
    expenseToDeleteId = id;
    document.getElementById('deleteExpenseBackdrop')?.classList.add('active');
};

async function performDeleteExpense() {
    const id = expenseToDeleteId;
    if (!id) return;
    closeDeleteModal();
    
    try {
        let { error } = await supabase
            .from('expenses')
            .update({ status: 'deleted', updated_at: new Date().toISOString() })
            .eq('expense_id', id);

        if (error) {
            ({ error } = await supabase
                .from('expenses')
                .update({ status: 'deleted', updated_at: new Date().toISOString() })
                .eq('id', id));
        }

        if (error) throw error;

        showToast('Expense has been removed.');
        await loadAllExpenseData();
    } catch (err) {
        console.error("Error deleting expense:", err);
        showToast("Failed to delete expense");
    }
}

// ─── READ Stat Cards (PostgreSQL RPC: get_expenses_stat_cards) ───────────────
async function fetchExpenseStatCards() {
    try {
        const companyId = getCompanyId();
        if (!companyId) return;

        const rawBranchId = getBranchId();
        const branchId = rawBranchId && rawBranchId !== 'all' ? rawBranchId : null;

        const { data, error } = await supabase.rpc('get_expenses_stat_cards', {
            p_company_id: companyId,
            p_branch_id:  branchId
        });

        if (error) {
            console.warn('get_expenses_stat_cards RPC error, using client fallback:', error);
            computeAndRenderStatCardsClientSide();
            return;
        }

        renderStatCardsFromData(data);
    } catch (err) {
        console.warn('get_expenses_stat_cards RPC exception, using client fallback:', err);
        computeAndRenderStatCardsClientSide();
    }
}

// ─── Render Stat Cards from RPC Data ─────────────────────────────────────────
function renderStatCardsFromData(data) {
    if (!data) return;

    const elTodayAmt        = document.getElementById('cardTodayExpenses');
    const elTodayTrend      = document.getElementById('cardTodayTrend');
    const elThisMonthAmt    = document.getElementById('cardThisMonthExpenses');
    const elThisMonthTrend  = document.getElementById('cardThisMonthTrend');
    const elTotalAmt        = document.getElementById('cardTotalExpenses');
    const elTopCatName      = document.getElementById('cardTopCategoryName');
    const elTopCatDetails   = document.getElementById('cardTopCategoryDetails');

    // 1. Today's Expenses
    if (elTodayAmt) {
        const todayAmt = parseFloat(data.today_expenses || 0);
        elTodayAmt.innerHTML = `&#8377;${todayAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (elTodayTrend) {
        const pct = Math.abs(parseFloat(data.today_trend_pct || 0));
        const dir = data.today_trend_direction || 'flat';
        if (dir === 'up') {
            elTodayTrend.innerHTML = `<span style="color: #ef4444; display: inline-flex; align-items: center; gap: 4px;"><i data-feather="trending-up" style="width: 14px; height: 14px;"></i> ${pct}% vs yesterday</span>`;
        } else if (dir === 'down') {
            elTodayTrend.innerHTML = `<span style="color: #10b981; display: inline-flex; align-items: center; gap: 4px;"><i data-feather="trending-down" style="width: 14px; height: 14px;"></i> ${pct}% vs yesterday</span>`;
        } else {
            elTodayTrend.innerHTML = `<span style="color: #64748b; font-weight: 500;">0% vs yesterday</span>`;
        }
    }

    // 2. This Month's Expenses
    if (elThisMonthAmt) {
        const monthAmt = parseFloat(data.this_month_expenses || 0);
        elThisMonthAmt.innerHTML = `&#8377;${monthAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (elThisMonthTrend) {
        const pct = Math.abs(parseFloat(data.this_month_trend_pct || 0));
        const dir = data.this_month_trend_direction || 'flat';
        if (dir === 'up') {
            elThisMonthTrend.innerHTML = `<span style="color: #ef4444; display: inline-flex; align-items: center; gap: 4px;"><i data-feather="trending-up" style="width: 14px; height: 14px;"></i> ${pct}% vs last month</span>`;
        } else if (dir === 'down') {
            elThisMonthTrend.innerHTML = `<span style="color: #10b981; display: inline-flex; align-items: center; gap: 4px;"><i data-feather="trending-down" style="width: 14px; height: 14px;"></i> ${pct}% vs last month</span>`;
        } else {
            elThisMonthTrend.innerHTML = `<span style="color: #64748b; font-weight: 500;">0% vs last month</span>`;
        }
    }

    // 3. Total Expenses (Lifetime)
    if (elTotalAmt) {
        const totalAmt = parseFloat(data.total_expenses || 0);
        elTotalAmt.innerHTML = `&#8377;${totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // 4. Top Expense Category
    if (elTopCatName) {
        const catName = data.top_category_name && data.top_category_name !== 'None' ? data.top_category_name : 'None';
        elTopCatName.innerText = catName;
        elTopCatName.title = catName;
    }
    if (elTopCatDetails) {
        const topAmt = parseFloat(data.top_category_amount || 0);
        const topPct = parseFloat(data.top_category_pct || 0);
        if (topAmt > 0) {
            elTopCatDetails.innerHTML = `&#8377;${topAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &middot; ${topPct}% of total`;
        } else {
            elTopCatDetails.innerHTML = `&#8377;0.00 &middot; 0% of total`;
        }
    }

    if (window.feather) feather.replace();
}

// ─── Client-side Fallback Computation ─────────────────────────────────────────
function computeAndRenderStatCardsClientSide() {
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

    const yesterdayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStr = `${yesterdayObj.getFullYear()}-${pad2(yesterdayObj.getMonth() + 1)}-${pad2(yesterdayObj.getDate())}`;

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const lastMonthObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonthObj.getFullYear();
    const lastMonthNum = lastMonthObj.getMonth();

    let todayTotal = 0;
    let yesterdayTotal = 0;
    let thisMonthTotal = 0;
    let lastMonthTotal = 0;
    let lifetimeTotal = 0;
    const lifetimeCategoryTotals = {};

    allExpenses.forEach(exp => {
        const amt = parseFloat(exp.amount || 0);
        if (isNaN(amt) || amt <= 0) return;

        lifetimeTotal += amt;
        const cat = exp.category || 'Other';
        lifetimeCategoryTotals[cat] = (lifetimeCategoryTotals[cat] || 0) + amt;

        if (exp.date) {
            const expDateStr = String(exp.date).slice(0, 10);
            if (expDateStr === todayStr) {
                todayTotal += amt;
            } else if (expDateStr === yesterdayStr) {
                yesterdayTotal += amt;
            }

            const parts = expDateStr.split('-');
            if (parts.length >= 2) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                if (y === currentYear && m === currentMonth) {
                    thisMonthTotal += amt;
                } else if (y === lastMonthYear && m === lastMonthNum) {
                    lastMonthTotal += amt;
                }
            }
        }
    });

    let topCatName = 'None';
    let topCatMax = 0;
    for (const [cat, total] of Object.entries(lifetimeCategoryTotals)) {
        if (total > topCatMax) {
            topCatMax = total;
            topCatName = cat;
        }
    }
    const topCatPercent = lifetimeTotal > 0 && topCatMax > 0
        ? ((topCatMax / lifetimeTotal) * 100).toFixed(1)
        : '0.0';

    const calcTrend = (cur, prev) => {
        if (prev === 0 && cur === 0) return { pct: 0, dir: 'flat' };
        if (prev === 0 && cur > 0) return { pct: 100, dir: 'up' };
        if (cur === 0 && prev > 0) return { pct: 100, dir: 'down' };
        const change = ((cur - prev) / prev) * 100;
        return {
            pct: Math.abs(Math.round(change)),
            dir: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
        };
    };

    const todayTrend = calcTrend(todayTotal, yesterdayTotal);
    const monthTrend = calcTrend(thisMonthTotal, lastMonthTotal);

    renderStatCardsFromData({
        today_expenses: todayTotal,
        yesterday_expenses: yesterdayTotal,
        today_trend_pct: todayTrend.pct,
        today_trend_direction: todayTrend.dir,
        this_month_expenses: thisMonthTotal,
        last_month_expenses: lastMonthTotal,
        this_month_trend_pct: monthTrend.pct,
        this_month_trend_direction: monthTrend.dir,
        total_expenses: lifetimeTotal,
        top_category_name: topCatName,
        top_category_amount: topCatMax,
        top_category_pct: topCatPercent
    });
}

// ─── READ Expenses Table Data (Supabase) ─────────────────────────────────────
async function fetchExpenses() {
    try {
        const companyId = getCompanyId();
        if (!companyId) {
            console.warn('fetchExpenses: companyId not ready yet');
            return;
        }

        const rawBranchId = getBranchId();
        const branchId = rawBranchId && rawBranchId !== 'all' ? rawBranchId : null;

        let query = supabase
            .from('expenses')
            .select('*')
            .eq('company_id', companyId)
            .neq('status', 'deleted')
            .order('date', { ascending: false });

        if (branchId) {
            query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        allExpenses = data || [];
        console.log('fetchExpenses: loaded', allExpenses.length, 'records for company', companyId);
    } catch (err) {
        console.error('fetchExpenses error:', err);
        showToast('Failed to load expenses: ' + (err.message || ''));
        allExpenses = [];
    }

    renderExpensesTable();

    // Fallback: if stat cards are still showing 0 and records exist, compute client-side
    const totalCard = document.getElementById('cardTotalExpenses');
    if (totalCard && (totalCard.innerText === '₹0.00' || totalCard.innerText === '₹0' || totalCard.innerText.includes('0.00')) && allExpenses.length > 0) {
        computeAndRenderStatCardsClientSide();
    }
}

// ─── Master Loader ────────────────────────────────────────────────────────────
async function loadAllExpenseData() {
    await Promise.allSettled([
        fetchExpenseStatCards(),
        fetchExpenses()
    ]);
}

// ─── Render Table & Pagination ────────────────────────────────────────────────
function renderExpensesTable() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    const dateRangeFilter = document.getElementById('expensesDateRange')?.value || 'this_month';
    const categoryFilter  = document.getElementById('filterCategory')?.value || 'All';

    const now          = new Date();
    const currentYear  = now.getFullYear();
    const currentMonth = now.getMonth();

    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthNum  = lastMonthDate.getMonth();

    let filtered = allExpenses.filter(expense => {
        if (categoryFilter !== 'All' && expense.category !== categoryFilter) return false;

        const dParts = parseDateParts(expense.date);
        if (!dParts) return false;

        // Search text filter
        if (searchQuery) {
            const cat = (expense.category || '').toLowerCase();
            const notes = (expense.notes || '').toLowerCase();
            const staff = (expense.staff_name || 'Admin').toLowerCase();
            const amt = String(expense.amount || '');
            const rawDate = String(expense.date || '').toLowerCase();
            const formattedDate = `${String(dParts.day).padStart(2, '0')}-${String(dParts.month + 1).padStart(2, '0')}-${dParts.year}`;

            const matchesSearch = cat.includes(searchQuery) ||
                                  notes.includes(searchQuery) ||
                                  staff.includes(searchQuery) ||
                                  amt.includes(searchQuery) ||
                                  rawDate.includes(searchQuery) ||
                                  formattedDate.includes(searchQuery);
            if (!matchesSearch) return false;
        }

        if (dateRangeFilter === 'this_month') {
            if (dParts.year !== currentYear || dParts.month !== currentMonth) return false;
        } else if (dateRangeFilter === 'last_month') {
            if (dParts.year !== lastMonthYear || dParts.month !== lastMonthNum) return false;
        } else if (dateRangeFilter === '30days') {
            const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0);
            if (dParts.dateObj < thirtyDaysAgo) return false;
        } else if (dateRangeFilter === '3months') {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0);
            if (dParts.dateObj < threeMonthsAgo) return false;
        } else if (dateRangeFilter === '6months') {
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1, 0, 0, 0);
            if (dParts.dateObj < sixMonthsAgo) return false;
        } else if (dateRangeFilter === '12months') {
            const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1, 0, 0, 0);
            if (dParts.dateObj < twelveMonthsAgo) return false;
        } else if (dateRangeFilter === 'custom') {
            const startVal = document.getElementById('expensesCustomStart')?.value;
            const endVal = document.getElementById('expensesCustomEnd')?.value;
            if (startVal) {
                const s = parseDateParts(startVal);
                if (s && dParts.dateObj < s.dateObj) return false;
            }
            if (endVal) {
                const e = parseDateParts(endVal);
                if (e && dParts.dateObj > e.dateObj) return false;
            }
        }
        // 'all' — no date filter

        return true;
    });

    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // ── Pagination Calculation ──
    const totalRecords     = filtered.length;
    const paginationFooter = document.getElementById('expensesPaginationFooter');
    const pageShowing      = document.getElementById('expPageShowing');
    const pageInfo         = document.getElementById('expPageInfo');
    const btnPrev          = document.getElementById('expBtnPrev');
    const btnNext          = document.getElementById('expBtnNext');

    let displayRows = filtered;

    if (totalRecords <= 25) {
        if (paginationFooter) paginationFooter.style.display = 'none';
        currentPage = 1;
        displayRows = filtered;
    } else {
        if (paginationFooter) paginationFooter.style.display = 'flex';
        const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx   = Math.min(startIdx + PAGE_SIZE, totalRecords);

        displayRows = filtered.slice(startIdx, endIdx);

        if (pageShowing) pageShowing.textContent = `Showing ${startIdx + 1}-${endIdx} of ${totalRecords} expenses`;
        if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        if (btnPrev) btnPrev.disabled = (currentPage <= 1);
        if (btnNext) btnNext.disabled = (currentPage >= totalPages);
    }

    const badgeMap = {
        'Rent':        'bg-indigo-light text-indigo',
        'Salary':      'bg-emerald-light text-emerald',
        'Products':    'bg-blue-light text-blue',
        'Utilities':   'bg-amber-light text-amber',
        'Maintenance': 'bg-rose-light text-rose',
        'Marketing':   'bg-purple-light text-purple'
    };

    if (displayRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2.5rem; color: #64748b; font-size: 0.9rem;">No expenses found for the selected criteria.</td></tr>`;
    } else {
        tbody.innerHTML = displayRows.map(exp => {
            const amt        = parseFloat(exp.amount || 0);
            const badgeClass = badgeMap[exp.category] || 'bg-gray-100 text-gray-800';
            const expId      = exp.id || exp.expense_id;
            
            const expParts = parseDateParts(exp.date);
            const formattedDate = expParts
                ? `${String(expParts.day).padStart(2, '0')}-${String(expParts.month + 1).padStart(2, '0')}-${expParts.year}`
                : (exp.date || '-');

            const fullName = exp.staff_name || 'Admin';
            const firstName = fullName.split(' ')[0];

            return `
                <tr>
                    <td>${formattedDate}</td>
                    <td><span class="status-badge ${badgeClass}">${exp.category || 'Other'}</span></td>
                    <td style="font-weight: 600;">&#8377;${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td class="text-center" style="text-align: center; vertical-align: middle;">
                        ${exp.notes ? `
                        <button class="icon-btn mx-auto" title="View Notes" onclick="window.viewExpenseNotes('${expId}')" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px; margin: 0 auto; display: block;">
                            <i data-feather="file-text" style="width:16px;height:16px;color:#64748b;"></i>
                        </button>
                        ` : '<span class="text-muted" style="font-weight:500; display:block; text-align:center; width:100%;">N/A</span>'}
                    </td>
                    <td><span title="${fullName}" style="cursor:help;">${firstName}</span></td>
                    <td style="text-align: center;">
                        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                            <button data-sub-feature="expenses_update"
                                onclick="window.editExpense('${expId}')"
                                style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding:5px 10px; background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; border-radius:7px; font-size:0.7rem; font-weight:600; cursor:pointer; min-width:44px;">
                                <i data-feather="edit-2" style="width:13px;height:13px;"></i>
                                <span>Edit</span>
                            </button>
                            <button data-sub-feature="expenses_delete"
                                onclick="window.deleteExpense('${expId}')"
                                style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding:5px 10px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; border-radius:7px; font-size:0.7rem; font-weight:600; cursor:pointer; min-width:44px;">
                                <i data-feather="trash-2" style="width:13px;height:13px;"></i>
                                <span>Delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (window.feather) feather.replace();
    
    if (window.applySubFeatureGates) {
        window.applySubFeatureGates();
    }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) { console.warn(msg); return; }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Event Setup ──────────────────────────────────────────────────────────────
function setupExpensesEvents() {
    // Pagination buttons
    document.getElementById('expBtnPrev')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderExpensesTable();
        }
    });

    document.getElementById('expBtnNext')?.addEventListener('click', () => {
        currentPage++;
        renderExpensesTable();
    });

    // Date range selects
    document.getElementById('expensesDateRange')?.addEventListener('change', () => {
        currentPage = 1;
        renderExpenses();
    });

    document.getElementById('expensesCustomStart')?.addEventListener('change', () => {
        currentPage = 1;
        renderExpenses();
    });

    document.getElementById('expensesCustomEnd')?.addEventListener('change', () => {
        currentPage = 1;
        renderExpenses();
    });

    // Category filter
    document.getElementById('filterCategory')?.addEventListener('change', () => {
        currentPage = 1;
        renderExpenses();
    });

    // Search input event fallback
    document.getElementById('expenseSearch')?.addEventListener('input', (e) => {
        window.onExpenseSearch(e.target.value);
    });

    // Date dropdown toggle
    document.getElementById('exDateBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('exDateMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }
    });

    // Close date menu on outside click
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('exDateMenu');
        const btn = document.getElementById('exDateBtn');
        if (menu && menu.style.display === 'block') {
            if (!menu.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
                menu.style.display = 'none';
            }
        }
    });

    // Modal submit & backdrop close
    document.getElementById('addExpenseForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        window.submitExpense();
    });

    document.getElementById('addExpenseModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'addExpenseModal') window.closeAddExpenseModal();
    });

    // Branch switch detection across the app
    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'branchSelect') {
            localStorage.setItem('active_branch_id', e.target.value);
            currentPage = 1;
            loadAllExpenseData();
        }
    });
}

// ─── Module Initialization ────────────────────────────────────────────────────
function initExpensesModule() {
    console.log('Expenses module initializing (Supabase)');
    setupExpensesEvents();
    window.setExpensesDateFilter('this_month');
    loadAllExpenseData();

    // In case auth guard is still finalizing localStorage tokens / appContext
    setTimeout(loadAllExpenseData, 300);
    setTimeout(loadAllExpenseData, 800);
    setTimeout(loadAllExpenseData, 1500);

    if (window.feather) feather.replace();
}

// Safe boot whether DOM is already loaded or still parsing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExpensesModule);
} else {
    initExpensesModule();
}

// Listen for storage changes from other tabs or active branch switch
window.addEventListener('storage', (e) => {
    if (e.key === 'active_branch_id' || e.key === 'appContext' || e.key === 'company_id') {
        currentPage = 1;
        loadAllExpenseData();
    }
});

window.addEventListener('app-shell:ready', () => {
    loadAllExpenseData();
});
