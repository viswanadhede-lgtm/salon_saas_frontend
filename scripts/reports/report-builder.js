import { supabase } from '../lib/supabase.js';

function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch { return localStorage.getItem('company_id') || null; }
}

function getBranchId() {
    return localStorage.getItem('active_branch_id') || 'all';
}

function formatCurrency(val) {
    return '₹' + Number(val || 0).toLocaleString('en-IN');
}

function getMonthLabel(dateString) {
    const d = new Date(dateString);
    return d.toLocaleString('en-US', { month: 'short' }); // "Jan", "Feb"
}

// Ensure "Deleted" rows stand out.
function styleRowValue(val, index, type) {
    let style = '';
    if (val === 'Completed' || val === 'Active') style = 'color: #10b981; font-weight: 600;';
    if (val === 'VIP') style = 'color: #8b5cf6; font-weight: 700;';
    if (val === 'Refunded' || val === 'Inactive' || val === 'deleted') style = 'color: #f43f5e; font-weight: 600;';
    if (val === 'Pending') style = 'color: #f59e0b; font-weight: 600;';
    if (val === 'Cancelled' || val === 'no-show' || val === 'No-show') style = 'color: #94a3b8; font-weight: 600;';
    if (val === 'Confirmed') style = 'color: #6366f1; font-weight: 600;';
    if (String(val).startsWith('+')) style = 'color: #10b981; font-weight: 600;';
    if (String(val).startsWith('-')) style = 'color: #f43f5e;';
    return `<td style="${style}">${String(val).toUpperCase() === 'DELETED' ? '<span style="background:#fee2e2;color:#ef4444;padding:2px 6px;border-radius:4px;font-size:0.75rem;">DELETED</span>' : val}</td>`;
}


document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reportType = urlParams.get('type') || 'financial';
    
    // Apply Filters Button
    const filterBtn = document.querySelector('.filter-bar .btn-primary');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => loadReport(reportType));
    }
    
    await loadReport(reportType);
});

async function loadReport(reportType) {
    const companyId = getCompanyId();
    if (!companyId) return;

    // Show loading
    document.getElementById('tableBody').innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 40px; color: #64748b;">Loading report data...</td></tr>`;

    let data = null;
    try {
        switch (reportType) {
            case 'financial': data = await buildFinancialReport(companyId); break;
            case 'bookings': data = await buildBookingsReport(companyId); break;
            case 'customers': data = await buildCustomersReport(companyId); break;
            case 'services': data = await buildServicesReport(companyId); break;
            case 'products': data = await buildProductsReport(companyId); break;
            case 'staff': data = await buildStaffReport(companyId); break;
            case 'branch': data = await buildBranchReport(companyId); break;
            case 'marketing': data = await buildMarketingReport(companyId); break;
            case 'membership': data = await buildMembershipReport(companyId); break;
            default: data = await buildFinancialReport(companyId); break;
        }
        renderReport(data, reportType);
    } catch (err) {
        console.error(err);
        document.getElementById('tableBody').innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 40px; color: #ef4444;">Error loading data: ${err.message}</td></tr>`;
    }
}

// ----------------------------------------------------
// 1. FINANCIAL REPORT
// ----------------------------------------------------
async function buildFinancialReport(companyId) {
    const { data: sales, error } = await supabase.from('sales').select('*').eq('company_id', companyId).order('created_at', { ascending: true });
    if (error) throw error;

    let totalRev = 0;
    let totalDiscounts = 0;
    const transactions = new Set();
    const payMethods = { 'upi': 0, 'card': 0, 'cash': 0, 'other': 0 };
    const monthData = {};

    const tableRows = [];

    // Grouping for calculations
    const groupedSales = {};
    sales.forEach(row => {
        const saleId = row.sale_id;
        if (!groupedSales[saleId]) {
            groupedSales[saleId] = {
                id: saleId,
                date: row.created_at,
                customer: row.customer_name || 'Walk-in',
                method: (row.payment_method || 'other').toLowerCase(),
                status: row.status || 'completed',
                discount: Number(row.discount) || 0,
                total: 0
            };
        }
        groupedSales[saleId].total += Number(row.total_amount) || 0;
    });

    Object.values(groupedSales).forEach(sale => {
        if (sale.status !== 'refunded') {
            totalRev += sale.total;
            totalDiscounts += sale.discount;
            transactions.add(sale.id);
            if (payMethods[sale.method] !== undefined) {
                payMethods[sale.method] += sale.total;
            } else {
                payMethods['other'] += sale.total;
            }

            const month = getMonthLabel(sale.date);
            monthData[month] = (monthData[month] || 0) + sale.total;
        }

        tableRows.push({
            date: new Date(sale.date).toLocaleDateString(),
            id: sale.id,
            customer: sale.customer,
            total: formatCurrency(sale.total),
            payment: sale.method.toUpperCase(),
            status: sale.status.toUpperCase()
        });
    });

    tableRows.sort((a,b) => new Date(b.date) - new Date(a.date));

    // Construct 6 month trend array
    const trendLabels = Object.keys(monthData).slice(-6);
    const trendData = trendLabels.map(l => monthData[l]);

    return {
        title: 'Financial Reports',
        subtitle: 'Revenue, payments, and discounts analysis (Live)',
        kpis: ['Total Revenue', 'Total Transactions', 'Avg. Ticket', 'Discounts Given'],
        values: [formatCurrency(totalRev), transactions.size.toLocaleString(), formatCurrency(transactions.size ? totalRev/transactions.size : 0), formatCurrency(totalDiscounts)],
        headers: ['Date', 'Transaction ID', 'Customer', 'Total', 'Payment', 'Status'],
        rows: tableRows,
        charts: {
            left: { title: 'Revenue Trend', type: 'line', labels: trendLabels.length ? trendLabels : ['N/A'], datasets: [{ label: 'Revenue', data: trendData.length ? trendData : [0], color: '#6366f1' }] },
            right: { title: 'Payment Methods', type: 'doughnut', labels: ['UPI', 'Card', 'Cash', 'Other'], datasets: [{ data: [payMethods.upi, payMethods.card, payMethods.cash, payMethods.other], colors: ['#6366f1', '#ec4899', '#10b981', '#f59e0b'] }] }
        },
        infographic: {
            heroValue: transactions.size > 0 ? payMethods.upi >= payMethods.card ? 'UPI' : 'Card' : 'N/A',
            heroLabel: 'Top Payment Method',
            heroInsight: 'This method drives the highest volume of transactions.',
            icons: ['📱', '💳', '💵', '🔄'],
            trends: ['UPI', 'Card', 'Cash', 'Other']
        }
    };
}

// ----------------------------------------------------
// 2. BOOKINGS REPORT
// ----------------------------------------------------
async function buildBookingsReport(companyId) {
    const { data: bookings, error } = await supabase.from('bookings').select('*').eq('company_id', companyId).order('created_at', { ascending: true });
    if (error) throw error;

    let completed = 0, cancelled = 0, noshow = 0, pending = 0;
    const monthData = {};

    bookings.forEach(b => {
        const s = (b.status || 'pending').toLowerCase();
        if (s === 'completed') completed++;
        else if (s === 'cancelled') cancelled++;
        else if (s === 'no-show') noshow++;
        else pending++;

        if (s !== 'cancelled' && s !== 'deleted') {
            const m = getMonthLabel(b.created_at);
            monthData[m] = (monthData[m] || 0) + 1;
        }
    });

    const rows = bookings.map(b => ({
        date: new Date(b.created_at).toLocaleDateString(),
        customer: b.customer_name,
        service: b.service_name || 'N/A',
        staff: b.staff_name || 'Unassigned',
        status: b.status || 'Pending'
    })).reverse();

    const trendLabels = Object.keys(monthData).slice(-6);
    const trendData = trendLabels.map(l => monthData[l]);

    return {
        title: 'Booking & Appointment Reports',
        subtitle: 'Appointments, cancellations, and peak hours (Live)',
        kpis: ['Total Bookings', 'Completion Rate', 'Cancellations', 'No-shows'],
        values: [bookings.length, bookings.length ? Math.round((completed/bookings.length)*100)+'%' : '0%', cancelled, noshow],
        headers: ['Date', 'Customer', 'Service', 'Staff', 'Status'],
        rows: rows,
        charts: {
            left: { title: 'Booking Trend', type: 'line', labels: trendLabels.length ? trendLabels : ['N/A'], datasets: [{ label: 'Bookings', data: trendData.length ? trendData : [0], color: '#8b5cf6' }] },
            right: { title: 'Booking Outcomes', type: 'doughnut', labels: ['Completed', 'Pending', 'Cancelled', 'No-Show'], datasets: [{ data: [completed, pending, cancelled, noshow], colors: ['#10b981', '#f59e0b', '#f43f5e', '#94a3b8'] }] }
        },
        infographic: { heroValue: Math.round((completed/(bookings.length||1))*100)+'%', heroLabel: 'Completion', heroInsight: 'Live metrics calculated strictly from your bookings table.', icons: ['✅', '⏳', '❌', '🚫'], trends: ['Done', 'Wait', 'Cancel', 'Miss'] }
    };
}

// ----------------------------------------------------
// 3. CUSTOMER REPORT
// ----------------------------------------------------
async function buildCustomersReport(companyId) {
    const { data: customers, error } = await supabase.from('customers').select('*').eq('company_id', companyId).order('created_at', { ascending: true });
    if (error) throw error;

    const rows = customers.map(c => ({
        joined: new Date(c.created_at).toLocaleDateString(),
        name: c.name,
        phone: c.phone || 'N/A',
        email: c.email || 'N/A',
        status: c.status || 'active'
    })).reverse();

    const activeCount = customers.filter(c => c.status !== 'deleted').length;

    return {
        title: 'Customer Reports',
        subtitle: 'New vs returning, retention, and acquisition (Live)',
        kpis: ['Total Customers', 'Active Customers', 'Deleted', 'Avg. Spend'],
        values: [customers.length, activeCount, customers.length - activeCount, 'Data pending'],
        headers: ['Joined', 'Name', 'Phone', 'Email', 'Status'],
        rows: rows,
        charts: {
            left: { title: 'Acquisition', type: 'bar', labels: ['Last Month', 'This Month'], datasets: [{ label: 'Signups', data: [0, customers.length], color: '#0ea5e9' }] },
            right: { title: 'Status', type: 'polarArea', labels: ['Active', 'Deleted'], datasets: [{ data: [activeCount, customers.length - activeCount], colors: ['#10b981', '#f43f5e'] }] }
        },
        infographic: { heroValue: activeCount, heroLabel: 'Active Base', heroInsight: 'Total customers registered without a deleted status.', icons: ['✅', '🗑️'], trends: ['Active', 'Deleted'] }
    };
}

// ----------------------------------------------------

// ----------------------------------------------------
// 4. SERVICES REPORT
// ----------------------------------------------------
async function buildServicesReport(companyId) {
    const { data: sales, error } = await supabase.from('sales').select('*').eq('company_id', companyId);
    if (error) throw error;
    
    // Group by category/product to simulate "Service" stats, as salon SaaS stores them as products in sales.
    const sMap = {};
    sales.forEach(s => {
        if (s.status === 'deleted' || s.status === 'refunded') return;
        const name = s.product_name || s.service_name || 'Unknown';
        if (!sMap[name]) sMap[name] = { name, count: 0, revenue: 0 };
        sMap[name].count += Number(s.quantity || 1);
        sMap[name].revenue += Number(s.total_amount || 0);
    });

    const arr = Object.values(sMap).sort((a,b) => b.revenue - a.revenue);
    const topRevenue = arr.reduce((acc, curr) => acc + curr.revenue, 0);

    const rows = arr.map(s => ({
        name: s.name,
        count: s.count,
        revenue: formatCurrency(s.revenue),
        avgTicket: formatCurrency(s.revenue / (s.count || 1))
    }));

    const top5 = arr.slice(0, 5);

    return {
        title: 'Service Performance',
        subtitle: 'Most popular services and revenue share (Live)',
        kpis: ['Total Services Sold', 'Unique Services', 'Avg Service Price', 'Top Performer'],
        values: [arr.reduce((a,c) => a + c.count, 0), arr.length, formatCurrency(topRevenue / (arr.reduce((a,c)=>a+c.count,0)||1)), top5[0]?.name || 'N/A'],
        headers: ['Service Name', 'Times Sold', 'Revenue', 'Avg. Ticket'],
        rows: rows,
        charts: {
            left: { title: 'Revenue by Service', type: 'bar', labels: top5.map(s=>s.name), datasets: [{ label: 'Revenue', data: top5.map(s=>s.revenue), color: '#8b5cf6' }] },
            right: { title: 'Service Share', type: 'doughnut', labels: top5.map(s=>s.name), datasets: [{ data: top5.map(s=>s.count), colors: ['#8b5cf6', '#6366f1', '#10b981', '#f59e0b', '#ec4899'] }] }
        },
        infographic: { heroValue: top5[0] ? top5[0].count : '0', heroLabel: 'Top Service Bookings', heroInsight: 'This service is driving the most volume.', icons: ['✂️', '🧴', '💈', '💅', '💆'], trends: top5.map(s=>s.name) }
    };
}

// ----------------------------------------------------
// 5. PRODUCTS REPORT
// ----------------------------------------------------
async function buildProductsReport(companyId) {
    const { data: products, error } = await supabase.from('products').select('*').eq('company_id', companyId);
    if (error) throw error;
    const { data: sales } = await supabase.from('sales').select('*').eq('company_id', companyId);

    // Calculate Units Sold from sales
    const pMap = {};
    (sales||[]).forEach(s => {
        if(s.status === 'deleted' || s.status === 'refunded') return;
        const name = s.product_name;
        if(name) {
            pMap[name] = (pMap[name] || 0) + Number(s.quantity || 1);
        }
    });

    let lowStock = 0;
    const rows = products.map(p => {
        if (Number(p.stock) < 10 && p.status !== 'deleted') lowStock++;
        return {
            name: p.name,
            brand: p.brand || 'N/A',
            price: formatCurrency(p.price),
            sold: pMap[p.name] || 0,
            stock: Number(p.stock) || 0,
            status: p.status || 'Active'
        };
    }).sort((a,b) => b.sold - a.sold);

    const activeProducts = products.filter(p => p.status !== 'deleted');

    return {
        title: 'Product & Retail',
        subtitle: 'Inventory, stock alerts, and retail sales (Live)',
        kpis: ['Total Products', 'Total Brands', 'Low Stock Items', 'Deleted'],
        values: [activeProducts.length, new Set(activeProducts.map(p=>p.brand)).size, lowStock, products.length - activeProducts.length],
        headers: ['Product Name', 'Brand', 'Price', 'Units Sold', 'Stock', 'Status'],
        rows: rows,
        charts: {
            left: { title: 'Top Selling Products', type: 'bar', labels: rows.slice(0,5).map(r=>r.name), datasets: [{ label: 'Units Sold', data: rows.slice(0,5).map(r=>r.sold), color: '#10b981' }] },
            right: { title: 'Inventory Health', type: 'pie', labels: ['Healthy', 'Low Stock'], datasets: [{ data: [activeProducts.length - lowStock, lowStock], colors: ['#10b981', '#f43f5e'] }] }
        },
        infographic: { heroValue: lowStock, heroLabel: 'Low Stock Alerts', heroInsight: 'Items under 10 units require reordering.', icons: ['📦', '⚠️'], trends: ['Healthy', 'Low'] }
    };
}

// ----------------------------------------------------
// 6. STAFF REPORT
// ----------------------------------------------------
async function buildStaffReport(companyId) {
    const { data: staff, error } = await supabase.from('staff').select('*').eq('company_id', companyId);
    if (error) throw error;
    const { data: bookings } = await supabase.from('bookings').select('*').eq('company_id', companyId);

    const sMap = {};
    staff.forEach(s => sMap[s.name] = { name: s.name, role: s.role || 'Stylist', bookings: 0, status: s.status });

    (bookings||[]).forEach(b => {
        if(b.status !== 'deleted' && b.status !== 'cancelled' && b.staff_name && sMap[b.staff_name]) {
            sMap[b.staff_name].bookings++;
        }
    });

    const rows = Object.values(sMap).map(s => ({
        name: s.name,
        role: s.role,
        bookings: s.bookings,
        status: s.status || 'Active'
    })).sort((a,b) => b.bookings - a.bookings);

    return {
        title: 'Staff Performance',
        subtitle: 'Staff bookings, utilization, and activity (Live)',
        kpis: ['Total Staff', 'Active Staff', 'Total Bookings', 'Avg Bookings/Staff'],
        values: [staff.length, staff.filter(s=>s.status!=='deleted').length, (bookings||[]).length, Math.round((bookings||[]).length / (staff.length||1))],
        headers: ['Staff Name', 'Role', 'Completed Bookings', 'Status'],
        rows: rows,
        charts: {
            left: { title: 'Bookings by Staff', type: 'bar', labels: rows.map(r=>r.name), datasets: [{ label: 'Bookings', data: rows.map(r=>r.bookings), color: '#3b82f6' }] },
            right: { title: 'Staff Role Mix', type: 'polarArea', labels: [...new Set(rows.map(r=>r.role))], datasets: [{ data: [...new Set(rows.map(r=>r.role))].map(role => rows.filter(r=>r.role===role).length), colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'] }] }
        },
        infographic: { heroValue: rows[0] ? rows[0].name : 'N/A', heroLabel: 'Top Performer', heroInsight: 'Driving the highest booking volume.', icons: ['👑', '⭐', '✨', '👍'], trends: rows.slice(0,4).map(r=>r.name) }
    };
}

// ----------------------------------------------------
// 7. BRANCH REPORT
// ----------------------------------------------------
async function buildBranchReport(companyId) {
    const { data: branches, error } = await supabase.from('branches').select('*').eq('company_id', companyId);
    if (error) throw error;
    const { data: sales } = await supabase.from('sales').select('*').eq('company_id', companyId);

    const bMap = {};
    branches.forEach(b => bMap[b.id] = { name: b.name, city: b.city, revenue: 0, status: b.status || 'Active' });

    (sales||[]).forEach(s => {
        if(s.status !== 'deleted' && s.status !== 'refunded' && s.branch_id && bMap[s.branch_id]) {
            bMap[s.branch_id].revenue += Number(s.total_amount || 0);
        }
    });

    const rows = Object.values(bMap).map(b => ({
        name: b.name,
        city: b.city,
        revenue: formatCurrency(b.revenue),
        status: b.status
    })).sort((a,b) => Number(b.revenue.replace(/[^0-9.-]+/g,"")) - Number(a.revenue.replace(/[^0-9.-]+/g,"")));

    return {
        title: 'Branch Performance Report',
        subtitle: 'Comparative analysis across salon locations (Live)',
        kpis: ['Total Branches', 'Active Branches', 'Avg Revenue/Branch', 'Top Branch'],
        values: [branches.length, branches.filter(b=>b.status!=='deleted').length, formatCurrency(rows.reduce((sum,r)=>sum+Number(r.revenue.replace(/[^0-9.-]+/g,"")),0)/ (branches.length||1)), rows[0]?.name || 'N/A'],
        headers: ['Branch Name', 'City', 'Revenue', 'Status'],
        rows: rows,
        charts: {
            left: { title: 'Revenue by Branch', type: 'bar', labels: rows.map(r=>r.name), datasets: [{ label: 'Revenue', data: rows.map(r=>Number(r.revenue.replace(/[^0-9.-]+/g,""))), color: '#6366f1' }] },
            right: { title: 'Revenue Distribution', type: 'pie', labels: rows.map(r=>r.name), datasets: [{ data: rows.map(r=>Number(r.revenue.replace(/[^0-9.-]+/g,""))), colors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'] }] }
        },
        infographic: { heroValue: rows[0]?.name || 'N/A', heroLabel: 'Leading Branch', heroInsight: 'Consistently outperforming other zones.', icons: ['📍', '🏢', '🗺️', '🏠'], trends: rows.slice(0,4).map(r=>r.name) }
    };
}

// ----------------------------------------------------
// 8. MARKETING REPORT
// ----------------------------------------------------
async function buildMarketingReport(companyId) {
    const { data: coupons, error } = await supabase.from('coupons').select('*').eq('company_id', companyId);
    if (error) throw error;
    
    const rows = coupons.map(c => ({
        code: c.code,
        type: c.type === 'percentage' ? c.discount_value + '%' : '₹' + c.discount_value,
        usage: c.usage_count || 0,
        limit: c.usage_limit || 'Unlimited',
        status: new Date(c.end_date) < new Date() ? 'expired' : (c.status || 'Active')
    })).sort((a,b) => b.usage - a.usage);

    const active = coupons.filter(c => c.status !== 'deleted' && new Date(c.end_date) >= new Date()).length;

    return {
        title: 'Marketing & Promotions Report',
        subtitle: 'Analysis of campaign effectiveness and redemptions (Live)',
        kpis: ['Total Coupons', 'Active Coupons', 'Total Redemptions', 'Top Coupon'],
        values: [coupons.length, active, rows.reduce((a,c)=>a+c.usage,0), rows[0]?.code || 'N/A'],
        headers: ['Coupon Code', 'Discount', 'Redemptions', 'Usage Limit', 'Status'],
        rows: rows,
        charts: {
            left: { title: 'Top Coupons by Usage', type: 'bar', labels: rows.slice(0,5).map(r=>r.code), datasets: [{ label: 'Redemptions', data: rows.slice(0,5).map(r=>r.usage), color: '#ec4899' }] },
            right: { title: 'Coupon Status Mix', type: 'doughnut', labels: ['Active', 'Expired/Deleted'], datasets: [{ data: [active, coupons.length - active], colors: ['#ec4899', '#94a3b8'] }] }
        },
        infographic: { heroValue: rows.reduce((a,c)=>a+c.usage,0), heroLabel: 'Total Uses', heroInsight: 'Redemptions drive customer retention.', icons: ['🎁', '🏷️', '🥇', '📣'], trends: rows.slice(0,4).map(r=>r.code) }
    };
}

// ----------------------------------------------------
// 9. MEMBERSHIP REPORT
// ----------------------------------------------------
async function buildMembershipReport(companyId) {
    const { data: memberships, error } = await supabase.from('memberships').select('*').eq('company_id', companyId);
    if (error) throw error;
    const { data: purchases } = await supabase.from('membership_purchases').select('*').eq('company_id', companyId);

    const mMap = {};
    memberships.forEach(m => mMap[m.id] = { name: m.plan_name || m.name, price: m.price || 0, active: 0, status: m.status });

    (purchases||[]).forEach(p => {
        if(p.status === 'active' && p.membership_id && mMap[p.membership_id]) {
            mMap[p.membership_id].active++;
        }
    });

    const rows = Object.values(mMap).map(m => ({
        name: m.name,
        price: formatCurrency(m.price),
        activeBase: m.active,
        status: m.status || 'Active'
    })).sort((a,b) => b.activeBase - a.activeBase);

    return {
        title: 'Membership Performance Report',
        subtitle: 'Subscription metrics and member engagement (Live)',
        kpis: ['Total Plans', 'Active Subscriptions', 'Avg Plan Price', 'Most Popular'],
        values: [memberships.length, rows.reduce((a,c)=>a+c.activeBase,0), formatCurrency(memberships.reduce((a,c)=>a+Number(c.price||0),0)/(memberships.length||1)), rows[0]?.name || 'N/A'],
        headers: ['Plan Name', 'Price', 'Active Subscribers', 'Status'],
        rows: rows,
        charts: {
            left: { title: 'Subscribers by Plan', type: 'bar', labels: rows.map(r=>r.name), datasets: [{ label: 'Subscribers', data: rows.map(r=>r.activeBase), color: '#f59e0b' }] },
            right: { title: 'Plan Adoption Mix', type: 'polarArea', labels: rows.map(r=>r.name), datasets: [{ data: rows.map(r=>r.activeBase), colors: ['#f59e0b', '#94a3b8', '#6366f1', '#8b5cf6'] }] }
        },
        infographic: { heroValue: rows.reduce((a,c)=>a+c.activeBase,0), heroLabel: 'Active Members', heroInsight: 'Memberships guarantee recurring business.', icons: ['👑', '🥈', '💎', '⭐'], trends: rows.slice(0,4).map(r=>r.name) }
    };
}


// ----------------------------------------------------
// UI RENDERER
// ----------------------------------------------------
let leftChartInstance = null;
let rightChartInstance = null;

function renderReport(data, reportType) {
    if (!data) return;
    
    document.getElementById('reportTitle').innerText = data.title;
    document.getElementById('reportSubtitle').innerText = data.subtitle;
    
    for(let i=1; i<=4; i++) {
        document.getElementById(`kpiLabel${i}`).innerText = data.kpis[i-1];
        document.getElementById(`kpiValue${i}`).innerText = data.values[i-1];
    }

    const head = document.getElementById('tableHead');
    const body = document.getElementById('tableBody');
    
    if (data.headers) {
        head.innerHTML = `<tr>${data.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    }

    if (data.rows) {
        body.innerHTML = data.rows.map(row => {
            const rowValues = Object.values(row);
            const cells = rowValues.map((val, index) => styleRowValue(val, index, reportType)).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
    }

    if (data.infographic) {
        document.getElementById('heroMetricValue').innerText = data.infographic.heroValue;
        document.getElementById('heroMetricLabel').innerText = data.infographic.heroLabel;
        document.getElementById('heroMetricInsight').innerText = data.infographic.heroInsight;
        const legend = document.getElementById('infographicLegend');
        if (legend && data.charts && data.charts.right) {
            legend.innerHTML = data.charts.right.labels.map((label, i) => `
                <div class="metric-item">
                    <div class="metric-icon-wrap" style="background: ${data.charts.right.datasets[0].colors[i]}20; color: ${data.charts.right.datasets[0].colors[i]};">
                        <span style="font-size: 1rem;">${data.infographic.icons[i] || '•'}</span>
                    </div>
                    <div class="metric-info">
                        <h4>${label}</h4>
                        <p>${data.infographic.trends[i] || ''}</p>
                    </div>
                </div>
            `).join('');
        }
    }

    // Render Charts
    if (data.charts) {
        document.getElementById('leftChartTitle').innerText = data.charts.left.title;
        document.getElementById('rightChartTitle').innerText = data.charts.right.title;

        const ctxLeft = document.getElementById('trendChart').getContext('2d');
        if (leftChartInstance) leftChartInstance.destroy();
        leftChartInstance = new Chart(ctxLeft, {
            type: data.charts.left.type,
            data: {
                labels: data.charts.left.labels,
                datasets: data.charts.left.datasets.map(ds => ({
                    label: ds.label,
                    data: ds.data,
                    borderColor: ds.color,
                    backgroundColor: data.charts.left.type === 'line' ? `${ds.color}10` : ds.color,
                    borderWidth: 2,
                    tension: 0.4,
                    fill: data.charts.left.type === 'line',
                    borderRadius: data.charts.left.type === 'bar' ? 6 : 0
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: data.charts.left.type !== 'doughnut' && data.charts.left.type !== 'polarArea' ? {
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }
                } : {}
            }
        });

        const ctxRight = document.getElementById('distributionChart').getContext('2d');
        if (rightChartInstance) rightChartInstance.destroy();
        rightChartInstance = new Chart(ctxRight, {
            type: data.charts.right.type,
            data: {
                labels: data.charts.right.labels,
                datasets: data.charts.right.datasets.map(ds => ({
                    data: ds.data,
                    backgroundColor: ds.colors.map(c => c + 'D9'),
                    borderColor: '#ffffff',
                    borderWidth: 2, hoverOffset: 15, hoverBackgroundColor: ds.colors
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 400, easing: 'easeOutQuart' },
                layout: { padding: 10 },
                scales: { r: { display: false, grid: { display: false }, ticks: { display: false }, startAngle: -90 } },
                circumference: 180, plugins: { legend: { display: false }, tooltip: { enabled: false } },
            }
        });
    }
}
