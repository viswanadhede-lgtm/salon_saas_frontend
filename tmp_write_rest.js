const fs = require('fs');
const path = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/reports/report-builder.js';
let content = fs.readFileSync(path, 'utf8');

const replacement = `
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
`;

const startIndex = content.indexOf('// (Stubs for remaining ones');

if (startIndex !== -1) {
    const startOfFunction = content.indexOf('let leftChartInstance', startIndex);
    
    content = content.substring(0, startIndex) + replacement + '\n\n// ----------------------------------------------------\n// UI RENDERER\n// ----------------------------------------------------\n' + content.substring(startOfFunction);
    
    fs.writeFileSync(path, content);
    console.log("Stubs successfully replaced with real implementations.");
} else {
    console.log("Could not find stubs start index.");
}
