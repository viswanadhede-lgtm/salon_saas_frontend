/**
 * config/plan-limits-manager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAN LIMITS & USAGE COUNTER ENFORCEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 *   Enforces plan-tier capacity ceilings (max_branches, max_users, max_staff)
 *   before creation modals open or records are submitted.
 *
 * ARCHITECTURAL ROLE:
 *   - Part of Gate 3: Quantitative resource gating (in contrast to qualitative page access).
 *   - Checks both `public.plan_limits` (for allowed ceiling) and real-time database counts
 *     (for accurate capacity measurement, updating `public.usage_counters`).
 *   - When limit is reached, blocks action and opens the Plan Upgrade modal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase.js';

// Fallback limits if plan_limits row has not been seeded in DB yet
const FALLBACK_PLAN_LIMITS = {
    Growth: {
        max_branches: 1,
        max_users: 2,
        max_staff: 10
    },
    Advance: {
        max_branches: 3,
        max_users: 5,
        max_staff: 20
    },
    Pro: {
        max_branches: 10,
        max_users: 10,
        max_staff: 50
    }
};

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
 * Resolves current company_id, plan_id, and plan_name from localStorage / appContext.
 */
function resolveCompanyAndPlan() {
    let companyId = null;
    let planId = null;
    let planName = null;

    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        companyId = ctx.company?.id || ctx.company?.company_id || null;
        planId = ctx.company?.plan_id || null;
        planName = ctx.company?.plan_name || null;
    } catch (_) {}

    if (!companyId) companyId = localStorage.getItem('company_id');
    if (!planId) planId = localStorage.getItem('plan_id');
    if (!planName) planName = localStorage.getItem('plan_name');

    planName = planName || 'Growth';
    planName = planName.charAt(0).toUpperCase() + planName.slice(1).toLowerCase();

    return { companyId, planId, planName };
}

/**
 * Checks if the company is within its plan allowance for a given resource.
 *
 * @param {'max_branches' | 'max_users' | 'max_staff'} resourceKey
 * @returns {Promise<{ allowed: boolean, currentCount: number, maxLimit: number, planName: string, meta: Object }>}
 */
export async function checkResourceLimit(resourceKey) {
    const meta = RESOURCE_META[resourceKey] || {
        singular: 'item',
        plural: 'items',
        title: 'Plan Limit Reached',
        table: null
    };

    try {
        let { companyId, planId, planName } = resolveCompanyAndPlan();

        if (!companyId) {
            console.warn('[PlanLimits] No company_id found, allowing action by default.');
            return { allowed: true, currentCount: 0, maxLimit: 9999, planName, meta };
        }

        // Try looking up company subscription if planId is missing
        if (!planId) {
            try {
                const { data: sub } = await supabase
                    .from('company_subscriptions')
                    .select('plan_id, plan_name')
                    .eq('company_id', companyId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (sub) {
                    if (sub.plan_id) planId = sub.plan_id;
                    if (sub.plan_name) {
                        planName = sub.plan_name.charAt(0).toUpperCase() + sub.plan_name.slice(1).toLowerCase();
                    }
                }
            } catch (_) {}
        }

        // 1. Fetch Plan Max Limit from plan_limits table
        let maxLimit = null;
        if (planId) {
            const { data: limitRow } = await supabase
                .from('plan_limits')
                .select('limit_value')
                .eq('plan_id', planId)
                .eq('limit_key', resourceKey)
                .maybeSingle();

            if (limitRow && limitRow.limit_value !== null && limitRow.limit_value !== undefined) {
                maxLimit = parseInt(limitRow.limit_value, 10);
            }
        }

        // If not found by plan_id, try by plan_name
        if ((maxLimit === null || isNaN(maxLimit)) && planName) {
            const { data: limitRowByName } = await supabase
                .from('plan_limits')
                .select('limit_value')
                .ilike('plan_name', planName)
                .eq('limit_key', resourceKey)
                .maybeSingle();

            if (limitRowByName && limitRowByName.limit_value !== null && limitRowByName.limit_value !== undefined) {
                maxLimit = parseInt(limitRowByName.limit_value, 10);
            }
        }

        // Fallback to configured defaults if not found in DB
        if (maxLimit === null || isNaN(maxLimit)) {
            const planFallback = FALLBACK_PLAN_LIMITS[planName] || FALLBACK_PLAN_LIMITS['Growth'];
            maxLimit = planFallback[resourceKey] ?? 9999;
        }

        // 2. Fetch Real-time Current Count directly from table (excluding soft-deleted)
        let currentCount = 0;
        if (meta.table) {
            const { count, error } = await supabase
                .from(meta.table)
                .select('id', { count: 'exact', head: true })
                .eq('company_id', companyId)
                .neq('status', 'deleted');

            if (!error && count !== null) {
                currentCount = count;
            }
        }

        // 3. Asynchronously sync usage_counters in background
        syncUsageCounterDb(companyId, planId, resourceKey, currentCount, maxLimit).catch(e => {
            console.warn('[PlanLimits] Non-blocking usage_counters sync notice:', e.message);
        });

        const allowed = currentCount < maxLimit;

        return {
            allowed,
            currentCount,
            maxLimit,
            planName,
            meta
        };
    } catch (err) {
        console.error('[PlanLimits] Error checking resource limit:', err);
        // Fail open so an error never locks a paying customer out of legitimate work
        return { allowed: true, currentCount: 0, maxLimit: 9999, planName: 'Current', meta };
    }
}

/**
 * Background helper to keep usage_counters table up to date.
 */
async function syncUsageCounterDb(companyId, planId, resourceKey, currentCount, maxLimit) {
    if (!companyId) return;

    try {
        const { data: existing } = await supabase
            .from('usage_counters')
            .select('id')
            .eq('company_id', companyId)
            .eq('resource_key', resourceKey)
            .maybeSingle();

        if (existing) {
            await supabase
                .from('usage_counters')
                .update({
                    current_count: currentCount,
                    max_limit: maxLimit,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
        } else {
            const branchId = localStorage.getItem('active_branch_id') || null;
            await supabase
                .from('usage_counters')
                .insert({
                    company_id: companyId,
                    branch_id: branchId,
                    plan_id: planId,
                    resource_key: resourceKey,
                    current_count: currentCount,
                    max_limit: maxLimit
                });
        }
    } catch (_) {}
}

/**
 * Displays a modal when a plan capacity limit is reached.
 *
 * @param {Object} limitDetails - Result returned from checkResourceLimit()
 */
export function showPlanLimitModal(limitDetails) {
    const { currentCount, maxLimit, planName, meta } = limitDetails;

    // Remove any existing modal
    const existing = document.getElementById('plan-limit-upgrade-modal');
    if (existing) existing.remove();

    const isGrowth = planName.toLowerCase().includes('growth');
    const isAdvance = planName.toLowerCase().includes('advance');
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
