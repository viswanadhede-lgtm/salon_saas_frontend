// scripts/reports/report-modules/misc.js
// Shared utilities import
import { formatCurrency, updateKPIs, renderTrendChart, renderDistributionChart, updateTable } from './shared.js';

async function renderMembership(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR MEMBERSHIPS ---
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');

        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            // Fetch purchases and plans in parallel
            const [purchasesRes, plansRes] = await Promise.all([
                supabase
                    .from('membership_purchases')
                    .select('*')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .order('purchase_date', { ascending: false }),
                supabase
                    .from('memberships')
                    .select('membership_id, plan_name, price, duration_months, status')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .neq('status', 'deleted')
            ]);

            if (purchasesRes.error) throw purchasesRes.error;

            const purchases = purchasesRes.data || [];
            const plans     = plansRes.data  || [];

            // Deduplicate plans by membership_id (since the table has one row per service)
            const seenPlanIds = new Set();
            const uniquePlans = plans.filter(p => {
                if (seenPlanIds.has(p.membership_id)) return false;
                seenPlanIds.add(p.membership_id);
                return true;
            });

            // KPI calculations
            const now = new Date();
            const activeMembers   = purchases.filter(p => p.status === 'active').length;
            const cancelledCount  = purchases.filter(p => p.status === 'cancelled').length;
            const totalMRR        = purchases
                .filter(p => p.status === 'active')
                .reduce((sum, p) => sum + (Number(p.price || 0) / Math.max(Number(p.duration || 1), 1)), 0);
            const activePlansCount = uniquePlans.filter(p => p.status === 'active').length;

            // Format rows from membership_purchases
            const formattedRows = purchases.map(p => {
                const memberName   = p.customer_name || 'â€”';
                const planName     = p.plan_name || p.membership_name || 'â€”';
                const joinDate     = p.purchase_date  ? new Date(p.purchase_date).toLocaleDateString()  : 'â€”';
                const renewalDate  = p.expiry_date    ? new Date(p.expiry_date).toLocaleDateString()    : 'â€”';
                const monthlyFee   = p.duration && Number(p.duration) > 0
                    ? formatCurrency(Number(p.price || 0) / Number(p.duration))
                    : formatCurrency(p.price || 0);
                const totalValue   = formatCurrency(p.price || 0);

                let statusHtml = '<span class="status-pill pending">Expired</span>';
                if (p.status === 'active')    statusHtml = '<span class="status-pill active">Active</span>';
                if (p.status === 'cancelled') statusHtml = '<span class="status-pill cancelled">Cancelled</span>';

                return [memberName, planName, joinDate, renewalDate, monthlyFee, totalValue, statusHtml];
            });

            // Update headers
            data.headers = ['Member Name', 'Plan', 'Join Date', 'Renewal Date', 'Monthly Fee', 'Total Value', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Active Members';
            data.kpi1.value = activeMembers.toString();
            data.kpi2.label = 'Active Plans';
            data.kpi2.value = activePlansCount.toString();
            data.kpi3.label = 'Monthly MRR';
            data.kpi3.value = formatCurrency(Math.round(totalMRR));
            data.kpi4.label = 'Cancellations';
            data.kpi4.value = cancelledCount.toString();

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading membership report data:', err);
            updateTable(data.headers, []);
        }
}

async function renderMarketing(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR MARKETING (OFFERS + COUPONS) ---
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');

        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            // Fetch offers and coupons in parallel
            const [offersRes, couponsRes] = await Promise.all([
                supabase
                    .from('offers')
                    .select('offer_id, offer_name, discount_type, discount_value, valid_from, valid_to, status, current_usage_count, total_usage_limit')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .neq('status', 'deleted')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('coupons')
                    .select('coupon_id, coupon_code, discount_type, discount_value, valid_from, valid_to, status, current_usage_count, total_usage_limit')
                    .eq('company_id', companyId)
                    .eq('branch_id', branchId)
                    .neq('status', 'deleted')
                    .order('created_at', { ascending: false })
            ]);

            // Deduplicate offers by offer_id (flattened table has one row per service)
            const seenOfferIds = new Set();
            const offers = (offersRes.data || []).filter(o => {
                if (seenOfferIds.has(o.offer_id)) return false;
                seenOfferIds.add(o.offer_id);
                return true;
            });
            const coupons = couponsRes.data || [];

            const now = new Date();

            // Helper to determine if an item is currently active
            const isCurrentlyActive = item => {
                if (item.status !== 'active') return false;
                if (item.valid_to && new Date(item.valid_to) < now) return false;
                return true;
            };

            // KPIs
            const activeOffers  = offers.filter(isCurrentlyActive).length;
            const activeCoupons = coupons.filter(isCurrentlyActive).length;
            const totalActive   = activeOffers + activeCoupons;
            const totalItems    = offers.length + coupons.length;

            const totalUsage = [
                ...offers.map(o  => Number(o.current_usage_count  || 0)),
                ...coupons.map(c => Number(c.current_usage_count || 0))
            ].reduce((sum, v) => sum + v, 0);

            // Build unified rows: offers + coupons together
            const offerRows = offers.map(o => {
                const name       = o.offer_name || 'â€”';
                const type       = 'Offer';
                const discount   = o.discount_type === 'percentage' ? `${o.discount_value}% OFF` : `â‚¹${o.discount_value} OFF`;
                const startDate  = o.valid_from ? new Date(o.valid_from).toLocaleDateString() : 'Always';
                const endDate    = o.valid_to   ? new Date(o.valid_to).toLocaleDateString()   : 'No Expiry';
                const usage      = `${o.current_usage_count || 0} / ${o.total_usage_limit || 'âˆž'}`;
                const statusHtml = isCurrentlyActive(o)
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';
                return [name, type, discount, startDate, endDate, usage, statusHtml];
            });

            const couponRows = coupons.map(c => {
                const name       = c.coupon_code || 'â€”';
                const type       = 'Coupon';
                const discount   = c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `â‚¹${c.discount_value} OFF`;
                const startDate  = c.valid_from ? new Date(c.valid_from).toLocaleDateString() : 'Always';
                const endDate    = c.valid_to   ? new Date(c.valid_to).toLocaleDateString()   : 'No Expiry';
                const usage      = `${c.current_usage_count || 0} / ${c.total_usage_limit || 'âˆž'}`;
                const statusHtml = isCurrentlyActive(c)
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';
                return [name, type, discount, startDate, endDate, usage, statusHtml];
            });

            const formattedRows = [...offerRows, ...couponRows];

            // Update headers
            data.headers = ['Name / Code', 'Type', 'Discount', 'Start Date', 'End Date', 'Usage', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Active Promotions';
            data.kpi1.value = totalActive.toString();
            data.kpi2.label = 'Total Offers';
            data.kpi2.value = offers.length.toString();
            data.kpi3.label = 'Total Coupons';
            data.kpi3.value = coupons.length.toString();
            data.kpi4.label = 'Total Redemptions';
            data.kpi4.value = totalUsage.toString();

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading marketing report data:', err);
            updateTable(data.headers, []);
        }
}

async function renderProducts(data, supabase) {
        // --- LIVE SUPABASE INTEGRATION FOR PRODUCTS (INVENTORY) ---
        const companyId = localStorage.getItem('company_id');
        const branchId  = localStorage.getItem('active_branch_id');

        if (!companyId || !branchId) {
            updateTable(data.headers, []);
            return;
        }

        try {
            const { data: dbProducts, error } = await supabase
                .from('products')
                .select('*')
                .eq('company_id', companyId)
                .eq('branch_id', branchId)
                .order('product_name', { ascending: true });

            if (error) throw error;

            const productsList = (dbProducts || []).filter(p =>
                (p.status || '').toLowerCase() !== 'deleted'
            );

            // KPI calculations
            const activeProducts  = productsList.filter(p => (p.status || '').toLowerCase() === 'active').length;
            const outOfStock      = productsList.filter(p => Number(p.stock_quantity || 0) === 0).length;
            const lowStock        = productsList.filter(p => {
                const qty = Number(p.stock_quantity || 0);
                return qty > 0 && qty <= 5;
            }).length;
            const totalStockValue = productsList.reduce((sum, p) =>
                sum + (Number(p.price || 0) * Number(p.stock_quantity || 0)), 0
            );

            const formattedRows = productsList.map(p => {
                const name     = p.product_name || 'â€”';
                const category = p.category_name || 'Uncategorized';
                const price    = p.price != null ? formatCurrency(p.price) : 'â€”';
                const qty      = Number(p.stock_quantity || 0);
                const value    = formatCurrency(Number(p.price || 0) * qty);

                // Stock badge
                let stockHtml;
                if (qty === 0) {
                    stockHtml = '<span class="status-pill cancelled">Out of Stock</span>';
                } else if (qty <= 5) {
                    stockHtml = `<span class="status-pill pending">Low (${qty})</span>`;
                } else {
                    stockHtml = `<span class="status-pill active">In Stock (${qty})</span>`;
                }

                const statusHtml = (p.status || '').toLowerCase() === 'active'
                    ? '<span class="status-pill active">Active</span>'
                    : '<span class="status-pill cancelled">Inactive</span>';

                return [name, category, price, stockHtml, value, statusHtml];
            });

            // Update headers
            data.headers = ['Product Name', 'Category', 'Unit Price', 'Stock Status', 'Stock Value', 'Status'];

            // Override KPIs
            data.kpi1.label = 'Total Products';
            data.kpi1.value = activeProducts.toString();
            data.kpi2.label = 'Out of Stock';
            data.kpi2.value = outOfStock.toString();
            data.kpi3.label = 'Low Stock';
            data.kpi3.value = lowStock.toString();
            data.kpi4.label = 'Total Stock Value';
            data.kpi4.value = formatCurrency(totalStockValue);

            updateKPIs(data.kpi1, data.kpi2, data.kpi3, data.kpi4);
            updateTable(data.headers, formattedRows);

        } catch (err) {
            console.error('Error loading products report data:', err);
            updateTable(data.headers, []);
        }
}

const handlers = {
    'membership': renderMembership,
    'marketing': renderMarketing,
    'products': renderProducts
};

export async function render(data, supabase, type = data?.type) {
    const handler = handlers[type];
    if (handler) {
        return await handler(data, supabase);
    }
    updateTable(data.headers, data.rows || []);
}
