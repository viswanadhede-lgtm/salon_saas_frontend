/**
 * config/plan-limits-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DYNAMIC PLAN LIMITS & USAGE MANAGER (Zero-Trust Backend Thin Client)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURAL ROLE:
 *   - Quota Enforcement: Governed authoritatively in PostgreSQL via `shared.check_quota()`.
 *   - Quota limits are stored in `public.plan_limits` and usage in `public.usage_counters`.
 *   - The database procedures `create_branch_atomic`, `create_user_atomic`, and
 *     `create_staff_atomic` perform mandatory server-side quota verification before INSERT.
 *   - This file provides client-side pre-flight checks (`checkResourceLimit`) and
 *     renders the upgrade modal (`showPlanLimitModal`) when limits are reached.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase.js';

const RESOURCE_META = {
    max_branches: {
        singular: 'branch',
        plural: 'branches',
        title: 'Branch Limit Reached',
        table: 'branches'
    },
    max_users: {
        singular: 'user',
        plural: 'users',
        title: 'User Account Limit Reached',
        table: 'users'
    },
    max_staff: {
        singular: 'staff member',
        plural: 'staff members',
        title: 'Staff Capacity Limit Reached',
        table: 'staff'
    }
};

/**
 * Checks if the company is within its plan allowance for a given resource.
 * Reads authoritative ceiling and current count directly from backend RPC `get_session_context`.
 *
 * @param {'max_branches' | 'max_users' | 'max_staff'} limitKey
 * @returns {Promise<{ allowed: boolean, currentCount: number, maxLimit: number, planName: string, meta: Object }>}
 */
export async function checkResourceLimit(limitKey) {
    const meta = RESOURCE_META[limitKey] || {
        singular: 'item',
        plural: 'items',
        title: 'Plan Limit Reached',
        table: null
    };

    try {
        const { data: sessionCtx, error: ctxErr } = await supabase.rpc('get_session_context');
        if (!ctxErr && sessionCtx) {
            const maxVal = sessionCtx.plan_limits?.[limitKey];
            const curVal = sessionCtx.usage?.[limitKey];
            const planName = sessionCtx.company?.plan_name || 'Standard Plan';

            if (maxVal !== undefined && maxVal !== null) {
                const maxLimit = parseInt(maxVal, 10);
                const currentCount = parseInt(curVal || 0, 10);

                return {
                    allowed: currentCount < maxLimit,
                    currentCount,
                    maxLimit,
                    planName,
                    meta
                };
            }
        }
    } catch (err) {
        console.warn('[PlanLimits] Error querying session context:', err);
    }

    // Optimistic fallback: allow UI action to proceed; backend RPC enforces quota strictly
    return {
        allowed: true,
        currentCount: 0,
        maxLimit: 9999,
        planName: 'Standard Plan',
        meta
    };
}

/**
 * Lightweight helper to sync or refresh usage counters.
 */
export async function syncUsageCounterDb(companyId, planId, limitKey, currentCount, maxLimit = null) {
    // Database triggers and atomic RPCs automatically manage usage counters
    return { success: true };
}

/**
 * Invalidates local session cache to force fresh lookup on next action.
 */
export async function refreshUsageCounter(limitKey) {
    try {
        sessionStorage.removeItem('salon_subscription_access_cache');
    } catch (_) {}
}

/**
 * Displays modal when resource limit is reached, prompting user to upgrade plan.
 *
 * @param {Object} limitDetails - Result returned from checkResourceLimit()
 */
export function showPlanLimitModal(limitDetails) {
    const { currentCount, maxLimit, planName, meta } = limitDetails;

    // Remove any existing modal
    const existing = document.getElementById('plan-limit-upgrade-modal');
    if (existing) existing.remove();

    const isGrowth = (planName || '').toLowerCase().includes('growth');
    const isAdvance = (planName || '').toLowerCase().includes('advance');
    const nextPlan = isGrowth ? 'Advance' : (isAdvance ? 'Pro' : 'Enterprise');
    const targetUrl = nextPlan === 'Enterprise' ? 'support.html' : 'plans.html?flow=upgrade';
    const ctaText = nextPlan === 'Enterprise' ? 'Contact Support →' : `Upgrade to ${nextPlan} →`;

    const overlay = document.createElement('div');
    overlay.id = 'plan-limit-upgrade-modal';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.72);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000; backdrop-filter: blur(6px); animation: fadeIn 0.2s ease;
        font-family: 'Inter', -apple-system, sans-serif;
    `;

    overlay.innerHTML = `
        <div style="background: #ffffff; border-radius: 16px; max-width: 460px; width: 92%; padding: 32px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #e2e8f0; position: relative;">
            <div style="width: 60px; height: 60px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; font-size: 28px;">
                ⚡
            </div>
            
            <span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 9999px; display: inline-block; margin-bottom: 10px;">
                ${planName} Plan Limit
            </span>
            
            <h3 style="margin: 0 0 10px; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                ${meta.title}
            </h3>
            
            <p style="margin: 0 0 20px; font-size: 14px; color: #64748b; line-height: 1.55;">
                Your <strong>${planName} Plan</strong> allows a maximum of <strong>${maxLimit} ${maxLimit === 1 ? meta.singular : meta.plural}</strong>.<br/>
                You currently have <strong>${currentCount} of ${maxLimit}</strong> active.
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; text-align: left; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <div style="font-size: 12px; color: #64748b; font-weight: 500;">Current Usage</div>
                    <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${currentCount} / ${maxLimit} ${meta.plural}</div>
                </div>
                <span style="background: #fee2e2; color: #dc2626; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
                    100% Used
                </span>
            </div>

            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="btnCloseLimitGateModal" style="padding: 11px 20px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">
                    Dismiss
                </button>
                <a href="${targetUrl}" style="padding: 11px 22px; border-radius: 8px; border: none; background: #6366f1; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);">
                    ${ctaText}
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('btnCloseLimitGateModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => overlay.remove());
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}
