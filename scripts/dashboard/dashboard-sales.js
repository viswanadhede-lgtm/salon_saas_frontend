// scripts/dashboard/dashboard-sales.js
// Dashboard top product sales fetcher and renderer.
// Queries Supabase table: sales.

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderProductSales(currentBranchId) {
    const listContainer = document.getElementById('productSalesList');
    if (!listContainer || !currentBranchId) return;

    try {
        const companyId = getCompanyId();

        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // Fetch paid/completed product sales for today
        let query = supabase
            .from('sales')
            .select('product_name, quantity, total_amount, price, status')
            .eq('branch_id', currentBranchId)
            .in('status', ['paid', 'completed', 'Paid', 'Completed'])
            .gte('created_at', `${today}T00:00:00`)
            .lte('created_at', `${today}T23:59:59`);

        if (companyId) {
            query = query.eq('company_id', companyId);
        }

        const { data: sales, error } = await query;

        if (error) throw error;

        if (!sales || sales.length === 0) {
            listContainer.className = 'service-list';
            listContainer.innerHTML = '<li class="centered-placeholder">No product sales today.</li>';
            return;
        }

        // Aggregate data
        const productMap = {};
        sales.forEach(sale => {
            const name = (sale.product_name || 'Unnamed Product').trim();
            if (!productMap[name]) {
                productMap[name] = { name, count: 0, revenue: 0 };
            }
            const qty = Number(sale.quantity) || 1;
            const amt = Number(sale.total_amount ?? (Number(sale.price || 0) * qty) ?? 0);
            productMap[name].count += qty;
            productMap[name].revenue += amt;
        });

        const aggregated = Object.values(productMap)
            .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
            .slice(0, 5);

        if (aggregated.length > 0) {
            const maxCount = Math.max(...aggregated.map(p => p.count), 1); // Used for progress bar max width
            const colors = ['#6366f1', '#10b981', '#3b82f6', '#f59e0b', '#ec4899']; // Indigo, emerald, blue, amber, pink
            
            listContainer.className = 'services-today-list'; // Match the styling used in top services
            
            listContainer.innerHTML = aggregated.map((p, idx) => {
                const percentage = Math.round((p.count / maxCount) * 100);
                const color = colors[idx % colors.length];
                return `
                    <li class="services-today-item" style="padding-top: 14px; padding-bottom: 14px;">
                        <div class="sti-info" style="flex: 0 0 auto;">
                            <div style="width:30px; height:30px; border-radius:8px; background:${color}15; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                <i data-feather="package" style="width:14px; height:14px; color:${color};"></i>
                            </div>
                            <span class="sti-name" style="font-weight:600;">${p.name}</span>
                        </div>
                        <div class="sti-right" style="flex:1.2; justify-content:flex-end; gap:12px;">
                            <span style="background:${color}15; color:${color}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700; white-space:nowrap;">${p.count} sold</span>
                            <div class="sti-bar-track" style="flex:1; max-width:80px;">
                                <div class="sti-bar" style="width:${percentage}%; background:${color}"></div>
                            </div>
                            <span style="font-weight:700; color:#059669; font-size:0.9rem; min-width:60px; text-align:right;">₹${p.revenue.toLocaleString('en-IN')}</span>
                        </div>
                    </li>
                `;
            }).join('');

            if (window.feather) feather.replace();
        } else {
            listContainer.className = 'service-list';
            listContainer.innerHTML = '<li class="centered-placeholder">No product sales today.</li>';
        }

    } catch (err) {
        console.error("Error fetching Product Sales:", err);
        listContainer.className = 'service-list';
        listContainer.innerHTML = '<li class="centered-placeholder" style="color:#ef4444;">Error loading sales.</li>';
    }
}
