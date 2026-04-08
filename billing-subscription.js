// billing-subscription.js — Live data loader for Billing & Subscription page
import { supabase } from './lib/supabase.js';

(async function () {

    // ── Helpers ────────────────────────────────────────────────────
    const getCompanyId = () => {
        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            return ctx.company?.id || localStorage.getItem('company_id') || null;
        } catch { return localStorage.getItem('company_id') || null; }
    };

    const fmt = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const fmtAmount = (n) => {
        if (n == null) return '—';
        return '₹' + Number(n).toLocaleString('en-IN');
    };

    // ── Plan features map ───────────────────────────────────────────
    const PLAN_FEATURES = {
        'Basic':      { icon: 'zap',         included: ['1 Branch', 'Up to 5 staff members', 'Basic bookings', 'Customer database', 'Payment tracking'], excluded: ['Multi-branch support', 'Marketing tools', 'Priority support', 'Dedicated account manager'] },
        'Advance':    { icon: 'trending-up', included: ['Up to 3 branches', 'Up to 12 staff accounts', 'POS & Product sales', 'Offers & coupons', 'Advanced reports'], excluded: ['Unlimited staff', 'Dedicated account manager', 'Custom API integrations'] },
        'Pro':        { icon: 'award',       included: ['Up to 10 branches', 'Unlimited staff accounts', 'Membership programs', 'Online booking page', 'Deep analytics dashboard'], excluded: [] },
        'Enterprise': { icon: 'briefcase',   included: ['Unlimited branches', 'AI receptionist included', 'WhatsApp booking automation', 'Custom integrations', 'Dedicated support & SLA'], excluded: [] }
    };

    // ── DOM refs ───────────────────────────────────────────────────
    const planBadgeEl      = document.querySelector('.billing-plan-card--compact .plan-badge');
    const planPriceEl      = document.querySelector('.plan-price');
    const planPeriodEl     = document.querySelector('.plan-period');
    const planStatusEl     = document.querySelector('.meta-value.status-active');
    const planMetaItems    = document.querySelectorAll('.plan-meta-item .meta-value');
    const payHistoryBody   = document.querySelector('.payment-table tbody');
    const featureCardTitle = document.querySelector('.billing-card--features .section-sub');
    const featuresGrid     = document.querySelector('.features-grid');
    const featuresCountBadge = document.querySelector('.features-count-badge');
    const featuresExGrid   = document.querySelector('.features-grid--excluded');
    const headerPlanBadge  = document.getElementById('headerPlanBadge');

    // ── Fetch subscription ─────────────────────────────────────────
    const cid = getCompanyId();
    if (!cid) {
        console.warn('[billing] No company_id found.');
        return;
    }

    const { data: subs, error: subErr } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('company_id', cid)
        .order('created_at', { ascending: false });

    if (subErr) {
        console.error('[billing] subscriptions fetch error:', subErr);
        return;
    }

    const sub = subs?.[0]; // Most recent active subscription

    if (sub) {
        // ── Read plan_name directly from subscriptions row ─────────────
        const rawPlanName = sub.plan_name || 'Unknown';
        const featureKey  = Object.keys(PLAN_FEATURES).find(k => rawPlanName.toLowerCase().includes(k.toLowerCase())) || rawPlanName;
        const plan = {
            name: rawPlanName,
            icon: (PLAN_FEATURES[featureKey] || {}).icon || 'zap'
        };

        const isAnnual = sub.billing_cycle === 'annual';
        const price = sub.billing_amount || (isAnnual ? plan.annual : plan.monthly);
        const period = isAnnual ? '/ year' : '/ month';

        // ── Plan card ──────────────────────────────────────────────
        if (planBadgeEl) {
            planBadgeEl.innerHTML = `<i data-feather="${plan.icon}"></i> ${plan.name} Plan`;
        }
        if (planPriceEl) planPriceEl.textContent = fmtAmount(price);
        if (planPeriodEl) planPeriodEl.textContent = period;
        if (headerPlanBadge) headerPlanBadge.textContent = plan.name;

        // Status
        const isActive = sub.status === 'active';
        const isTrial  = sub.status === 'trialing' || sub.subscription_type === 'trial';
        let statusLabel = isActive ? (isTrial ? 'Trial Active' : 'Active') : (sub.status || 'Unknown');
        let statusColor = isActive ? '#166534' : '#92400e';
        let statusBg    = isActive ? '#dcfce7' : '#fef3c7';
        let dotColor    = isActive ? '#22c55e' : '#f59e0b';

        if (planStatusEl) {
            planStatusEl.style.background = statusBg;
            planStatusEl.style.color = statusColor;
            planStatusEl.querySelector('.status-dot').style.background = dotColor;
            planStatusEl.lastChild.textContent = statusLabel;
        }

        // Meta grid: Status | Start Date | Next Renewal | Next Billing
        if (planMetaItems && planMetaItems.length >= 4) {
            // planMetaItems[0] is status — already handled above
            planMetaItems[1].textContent = fmt(sub.current_period_start);
            planMetaItems[2].textContent = fmt(sub.current_period_end);
            planMetaItems[3].textContent = fmtAmount(price);
        }

        // Upgrade button link
        const upgradeBtn = document.querySelector('.btn-billing-primary');
        const changeBtn  = document.querySelector('.btn-billing-secondary');
        if (upgradeBtn) upgradeBtn.onclick = () => window.location.href = `plans.html?current=${plan.name.toLowerCase()}`;
        if (changeBtn)  changeBtn.onclick  = () => window.location.href = `plans.html?current=${plan.name.toLowerCase()}`;

        // ── Plan Features ──────────────────────────────────────────
        // Match plan name loosely (e.g. "Advance" matches "Advance")
        const features = PLAN_FEATURES[featureKey] || { included: ['Standard features included'], excluded: [] };
        if (featureCardTitle) featureCardTitle.textContent = `Everything included in your ${plan.name} plan`;
        if (featuresCountBadge) featuresCountBadge.textContent = `${features.included.length} included`;

        if (featuresGrid) {
            featuresGrid.innerHTML = features.included.map(f => `
                <div class="feature-row feature-row--included">
                    <span class="feature-check"><i data-feather="check"></i></span>
                    <span class="feature-label">${f}</span>
                </div>`).join('');
        }
        if (featuresExGrid) {
            featuresExGrid.innerHTML = features.excluded.length
                ? features.excluded.map(f => `
                    <div class="feature-row feature-row--excluded">
                        <span class="feature-check feature-check--no"><i data-feather="x"></i></span>
                        <span class="feature-label">${f}</span>
                    </div>`).join('')
                : '<p style="color:#64748b;font-size:0.85rem;padding:0.5rem 0;">All features included! 🎉</p>';

            // Hide the "Not included" divider if nothing excluded
            const divider = document.querySelector('.features-divider');
            if (divider) divider.style.display = features.excluded.length ? '' : 'none';
        }
    } else {
        // No subscription found
        if (planBadgeEl) planBadgeEl.innerHTML = `<i data-feather="alert-circle"></i> No Active Plan`;
        if (planPriceEl) planPriceEl.textContent = '—';
        if (headerPlanBadge) headerPlanBadge.textContent = 'No Plan';
    }

    // ── Fetch payment history ──────────────────────────────────────
    const { data: payments, error: payErr } = await supabase
        .from('payments')
        .select('*')
        .eq('company_id', cid)
        .order('created_at', { ascending: false });

    if (payErr) {
        console.error('[billing] payments fetch error:', payErr);
    }

    if (payHistoryBody) {
        if (!payments || payments.length === 0) {
            payHistoryBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;padding:2.5rem;color:#94a3b8;font-size:0.875rem;">
                        <i data-feather="inbox" style="display:block;margin:0 auto 8px;width:28px;height:28px;"></i>
                        No payment history yet.
                    </td>
                </tr>`;
        } else {
            payHistoryBody.innerHTML = payments.map(p => {
                const isPaid = p.status === 'active' || p.status === 'charged' || p.status === 'captured';
                const isDue  = p.status === 'pending' || p.status === 'due';
                const statusHtml = isPaid
                    ? `<span class="status-pill status-pill--paid">Paid</span>`
                    : isDue
                    ? `<span class="status-pill status-pill--due">Payment Due</span>`
                    : `<span class="status-pill" style="background:#f1f5f9;color:#475569;">${p.status || 'Unknown'}</span>`;

                const actionHtml = isDue
                    ? `<button class="btn-invoice btn-pay-now" onclick="alert('Redirecting to payment...')">
                            <i data-feather="alert-circle" style="width:14px;height:14px;"></i> Pay Now
                       </button>`
                    : `<button class="btn-invoice" title="Invoice ${p.payment_id || ''}">
                            <i data-feather="download" style="width:14px;height:14px;"></i> Download
                       </button>`;

                const desc = `${p.plan_name || 'Subscription'} Plan${p.billing_cycle === 'annual' ? ' (Annual)' : ''}`;

                return `
                    <tr>
                        <td class="td-date">${fmt(p.created_at)}</td>
                        <td class="td-desc">${desc}</td>
                        <td class="td-amount">${fmtAmount(p.amount)}</td>
                        <td>${statusHtml}</td>
                        <td>${actionHtml}</td>
                    </tr>`;
            }).join('');
        }
    }

    // ── Re-render Feather icons ────────────────────────────────────
    if (window.feather) feather.replace();

})();
