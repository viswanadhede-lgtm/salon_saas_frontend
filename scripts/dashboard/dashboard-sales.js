// scripts/dashboard/dashboard-sales.js
// Dashboard top product sales fetcher and renderer.
// Powered by RPC 2: dashboard_top_products.

import { supabase } from '../../lib/supabase.js';
import { getCompanyId } from './dashboard-state.js';

export async function fetchAndRenderProductSales(currentBranchId) {
    const listContainer = document.getElementById('productSalesList');
    if (!listContainer) return;

    try {
        const companyId = getCompanyId();
        if (!companyId) {
            listContainer.className = 'service-list';
            listContainer.innerHTML = '<li class="centered-placeholder" style="color:#94a3b8;">No company session found.</li>';
            return;
        }

        const now = new Date();
        const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        // Sanitize branch UUID (if invalid or 'all', leave null to query company-wide)
        const validBranchId = (currentBranchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentBranchId))
            ? currentBranchId
            : null;

        const { data: products, error } = await supabase.rpc('dashboard_top_products', {
            p_branch_id: validBranchId,
            p_company_id: companyId,
            p_today: today
        });

        if (error) throw error;

        if (!products || products.length === 0) {
            listContainer.className = 'service-list';
            listContainer.innerHTML = '<li class="centered-placeholder">No product sales today.</li>';
            return;
        }

        const maxCount = Math.max(...products.map(p => Number(p.count) || 0), 1);
        const colors = ['#6366f1', '#10b981', '#3b82f6', '#f59e0b', '#ec4899']; // Indigo, emerald, blue, amber, pink

        listContainer.className = 'services-today-list';

        listContainer.innerHTML = products.map((p, idx) => {
            const count = Number(p.count) || 0;
            const revenue = Number(p.revenue) || 0;
            const percentage = Math.round((count / maxCount) * 100);
            const color = colors[idx % colors.length];

            return `
                <li class="services-today-item" style="padding-top: 14px; padding-bottom: 14px;">
                    <div class="sti-info" style="flex: 0 0 auto;">
                        <div style="width:30px; height:30px; border-radius:8px; background:${color}15; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i data-feather="package" style="width:14px; height:14px; color:${color};"></i>
                        </div>
                        <span class="sti-name" style="font-weight:600;">${p.product_name}</span>
                    </div>
                    <div class="sti-right" style="flex:1.2; justify-content:flex-end; gap:12px;">
                        <span style="background:${color}15; color:${color}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:700; white-space:nowrap;">${count} sold</span>
                        <div class="sti-bar-track" style="flex:1; max-width:80px;">
                            <div class="sti-bar" style="width:${percentage}%; background:${color}"></div>
                        </div>
                        <span style="font-weight:700; color:#059669; font-size:0.9rem; min-width:60px; text-align:right;">₹${revenue.toLocaleString('en-IN')}</span>
                    </div>
                </li>
            `;
        }).join('');

        if (window.feather) feather.replace();

    } catch (err) {
        console.error("Error fetching Product Sales:", err);
        listContainer.className = 'service-list';
        listContainer.innerHTML = '<li class="centered-placeholder" style="color:#ef4444;">Error loading sales.</li>';
    }
}
