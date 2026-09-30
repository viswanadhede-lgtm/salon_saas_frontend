// scripts/support/platform-support.js
// Fetches platform_support_settings using the anon key only.
// Evaluates company subscription entitlement for email support.
//
// SUBSCRIPTION SOURCE OF TRUTH:
//   Subscription entitlement reads exclusively from the authoritative
//   subscriptions table via the authenticated Supabase JS client.
//   The companies table is NOT used for subscription state.
//   localStorage is used only for company identity resolution.

import { supabase } from '../../lib/supabase.js';

(async function loadPlatformSupportSettings() {
    const SUPABASE_URL  = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
    const SUPABASE_ANON = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

    const $ = id => document.getElementById(id);

    // ── Card State Helpers ─────────────────────────────────────────────
    function disableCard(cardEl) {
        if (!cardEl) return;
        cardEl.style.opacity = '0.5';
        cardEl.style.cursor  = 'not-allowed';
        cardEl.dataset.disabled = 'true';
    }

    function enableCard(cardEl) {
        if (!cardEl) return;
        cardEl.style.opacity = '1';
        cardEl.style.cursor  = 'pointer';
        delete cardEl.dataset.disabled;
    }

    function renderUnavailable() {
        const emailText = $('scEmailText');
        const emailLink = $('scEmailLink');
        const copyBtn   = $('scCopyEmailBtn');
        if (emailText) emailText.textContent = 'Currently unavailable';
        if (emailLink) {
            emailLink.removeAttribute('href');
            emailLink.style.color = '#94a3b8';
            emailLink.style.pointerEvents = 'none';
        }
        if (copyBtn) copyBtn.style.display = 'none';
        disableCard($('scEmailCard'));

        const btn = $('scChatBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Unavailable';
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
        disableCard($('scChatCard'));

        const phoneText = $('scPhoneText');
        const phoneLink = $('scPhoneLink');
        if (phoneText) phoneText.textContent = 'Currently unavailable';
        if (phoneLink) {
            phoneLink.removeAttribute('href');
            phoneLink.style.color = '#94a3b8';
            phoneLink.style.pointerEvents = 'none';
        }
        disableCard($('scPhoneCard'));

        if (typeof feather !== 'undefined') feather.replace();
    }

    // ── Plan & Subscription Entitlement Check ──────────────────────────
    // Reads exclusively from the authoritative subscriptions table.
    // localStorage is used only to resolve company identity, not subscription state.
    async function verifyCompanyPlanEntitlement() {
        // ── 1. Company identity resolution ────────────────────────────
        let companyId = null;

        try {
            const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
            if (ctx.company) {
                companyId = ctx.company.company_id || ctx.company.id || null;
            }
        } catch (_) {}

        if (!companyId) {
            companyId = localStorage.getItem('company_id') ||
                        localStorage.getItem('current_company_id') ||
                        localStorage.getItem('tenant_id') || null;
        }

        // If no company context at all, cannot verify availability
        if (!companyId) {
            console.warn('[Support] No company context found. Email support disabled.');
            return { allowed: false, reason: 'unauthenticated' };
        }

        // ── 2. Authoritative subscription query ───────────────────────
        // Uses the authenticated Supabase JS client (subscriptions = SSOT).
        let subscription = null;

        try {
            const { data: subRows, error } = await supabase
                .from('subscriptions')
                .select(`
                    subscription_id,
                    company_id,
                    plan_id,
                    plan_name,
                    status,
                    subscription_start_date,
                    subscription_end_date,
                    billing_cycle,
                    auto_renew,
                    created_at
                `)
                .eq('company_id', companyId)
                .order('created_at', { ascending: false });

            if (error) {
                // Query error → fail closed; do NOT fall back to localStorage
                console.warn('[Support] Subscription query error:', error.message || error);
                return { allowed: false, reason: 'inactive_subscription' };
            }

            if (!subRows || subRows.length === 0) {
                // No subscription record for this company
                console.warn('[Support] No subscription found for company:', companyId);
                return { allowed: false, reason: 'inactive_subscription' };
            }

            // ── Pick-best subscription: prefer unexpired active/trial/trialing rows ──
            const VALID_STATUSES = ['active', 'trial', 'trialing'];
            const today = new Date();

            const validSubs = subRows.filter(sub => {
                const st = (sub.status || '').toLowerCase().trim();
                if (!VALID_STATUSES.includes(st)) return false;
                const endDate = sub.subscription_end_date ? new Date(sub.subscription_end_date) : null;
                return endDate && !isNaN(endDate.getTime()) && endDate > today;
            });

            if (validSubs.length > 0) {
                // Most recent unexpired valid subscription
                subscription = validSubs[0];
            } else {
                // No unexpired valid row — use the most recent row so we can
                // determine the correct inactive/expired result below
                subscription = subRows[0];
            }
        } catch (err) {
            // Unexpected runtime error → fail closed
            console.error('[Support] Unexpected subscription error:', err);
            return { allowed: false, reason: 'inactive_subscription' };
        }

        // ── 3. Status check ───────────────────────────────────────────
        const ENTITLEMENT_STATUSES = ['active', 'trial', 'trialing'];
        const normStatus = (subscription.status || '').trim().toLowerCase();
        if (!ENTITLEMENT_STATUSES.includes(normStatus)) {
            return { allowed: false, reason: 'inactive_subscription' };
        }

        // ── 4. Expiry check ───────────────────────────────────────────
        // Null, missing, or invalid end date is treated as expired.
        const endDateStr = subscription.subscription_end_date || null;
        if (!endDateStr) {
            return { allowed: false, reason: 'expired_subscription' };
        }
        const endDate = new Date(endDateStr);
        if (isNaN(endDate.getTime())) {
            return { allowed: false, reason: 'expired_subscription' };
        }
        if (endDate <= new Date()) {
            return { allowed: false, reason: 'expired_subscription' };
        }

        // ── 5. Plan allowlist check ───────────────────────────────────
        // Known Plan UUIDs & Names that permit Email Support
        // Basic, Advance, Pro all permit Email Support
        const allowedPlanNames = ['basic', 'advance', 'pro', 'enterprise'];
        const allowedPlanIds = [
            'd0d4cc8f-3498-4da1-b5e5-2887b9b39dce', // basic
            'b42bcd41-217a-4ddb-9451-20e040984277', // advance
            'b32fe38d-a715-4166-acf1-b970bd845c21', // pro
            '2e86d143-72aa-4ae4-a925-ded2b8475dc8', // enterprise
            '7e0af07f-b57b-40e7-a23a-6e8104c8033c'  // enterprise/trial
        ];

        const planName  = subscription.plan_name || null;
        const planId    = subscription.plan_id   || null;
        const cleanName = (planName || '').trim().toLowerCase();
        const cleanId   = (planId   || '').trim().toLowerCase();

        const isNameAllowed = allowedPlanNames.some(p => cleanName.includes(p));
        const isIdAllowed   = cleanId ? allowedPlanIds.includes(cleanId) : false;

        if (!isNameAllowed && !isIdAllowed) {
            return { allowed: false, reason: 'plan_not_permitted' };
        }

        return { allowed: true, planName };
    }

    // ── Apply Settings ─────────────────────────────────────────────────
    function applySettings(s, planCheck) {
        const hours = (s.support_hours && s.support_hours.trim()) ? s.support_hours.trim() : null;

        // ── 1. Email Support Card ───────────────────────────────────────
        const emailCard = $('scEmailCard');
        const emailLink = $('scEmailLink');
        const emailText = $('scEmailText');
        const copyBtn   = $('scCopyEmailBtn');
        const copyText  = $('scCopyEmailText');

        const isEmailPermitted = planCheck.allowed && s.email_enabled && s.support_email && s.support_email.trim();

        if (isEmailPermitted) {
            const addr = s.support_email.trim();
            emailText.textContent = addr;

            // mailto link with pre-populated recipient & subject
            const mailtoUrl = 'mailto:' + encodeURIComponent(addr) + '?subject=' + encodeURIComponent('BharatBots Support Request');
            emailLink.href = mailtoUrl;
            emailLink.style.color = '#4f46e5';
            emailLink.style.textDecoration = 'none';
            emailLink.style.pointerEvents = '';
            enableCard(emailCard);

            // Copy Email action fallback
            if (copyBtn) {
                copyBtn.style.display = 'flex';
                copyBtn.onclick = function(e) {
                    e.stopPropagation();
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(addr).then(() => {
                            showCopied();
                        }).catch(() => {
                            copyExecCommand(addr);
                        });
                    } else {
                        copyExecCommand(addr);
                    }
                };
            }

            function showCopied() {
                if (copyText) copyText.textContent = 'Copied!';
                setTimeout(() => {
                    if (copyText) copyText.textContent = 'Copy email address';
                }, 2000);
            }

            function copyExecCommand(text) {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    showCopied();
                } catch (_) {}
                document.body.removeChild(ta);
            }

            // Card click opens mailto: link (without opening blank tab)
            if (emailCard) {
                emailCard.onclick = function(e) {
                    if (e.target.closest('#scCopyEmailBtn')) return;
                    if (emailCard.dataset.disabled === 'true') return;
                    window.location.href = mailtoUrl;
                };
            }

            if (hours) $('scEmailHours').textContent = hours;
        } else {
            // Disabled / Unavailable state
            let statusLabel = 'Currently unavailable';
            if (!planCheck.allowed) {
                if (planCheck.reason === 'plan_not_permitted')         statusLabel = 'Not included in plan';
                else if (planCheck.reason === 'inactive_subscription') statusLabel = 'Subscription inactive';
                else if (planCheck.reason === 'expired_subscription')  statusLabel = 'Subscription expired';
                else if (planCheck.reason === 'unauthenticated')       statusLabel = 'Sign in to access';
            } else if (!s.email_enabled) {
                statusLabel = 'Currently unavailable';
            } else if (!s.support_email) {
                statusLabel = 'Address not configured';
            }

            emailText.textContent = statusLabel;
            emailLink.removeAttribute('href');
            emailLink.style.color = '#94a3b8';
            emailLink.style.pointerEvents = 'none';
            if (copyBtn) copyBtn.style.display = 'none';
            if (emailCard) emailCard.onclick = null;
            disableCard(emailCard);
        }

        // ── 2. Live Chat Card (untouched scope) ─────────────────────────
        const chatBtn = $('scChatBtn');
        if (s.live_chat_enabled) {
            chatBtn.disabled = false;
            chatBtn.style.opacity = '';
            chatBtn.style.cursor = '';
            $('scChatHours').textContent = hours
                ? 'Chat directly with an agent. ' + hours
                : 'Chat directly with an agent.';
        } else {
            chatBtn.disabled = true;
            chatBtn.textContent = 'Currently unavailable';
            chatBtn.style.opacity = '0.5';
            chatBtn.style.cursor = 'not-allowed';
            $('scChatHours').textContent = hours
                ? 'Live chat is currently unavailable. ' + hours
                : 'Live chat is currently unavailable.';
            disableCard($('scChatCard'));
        }

        // ── 3. Phone Support Card (untouched scope) ─────────────────────
        const phoneLink = $('scPhoneLink');
        const phoneText = $('scPhoneText');
        if (s.phone_enabled && s.support_phone) {
            const num = s.support_phone.trim();
            phoneText.textContent = num;
            phoneLink.href = 'tel:' + num.replace(/[\s\-().]/g, '');
            phoneLink.style.color = '#4f46e5';
            phoneLink.style.textDecoration = 'none';
            phoneLink.style.pointerEvents = '';
            if (hours) $('scPhoneHours').textContent = hours;
        } else {
            phoneText.textContent = s.phone_enabled ? 'Number not configured' : 'Currently unavailable';
            phoneLink.removeAttribute('href');
            phoneLink.style.color = '#94a3b8';
            phoneLink.style.pointerEvents = 'none';
            disableCard($('scPhoneCard'));
        }

        if (typeof feather !== 'undefined') feather.replace();
    }

    // ── Fetch settings and verify entitlement in parallel ──────────────
    try {
        const settingsUrl = SUPABASE_URL + '/rest/v1/platform_support_settings'
            + '?select=support_email,email_enabled,support_phone,phone_enabled,live_chat_enabled,support_hours,timezone'
            + '&id=eq.1&limit=1';

        const [settingsRes, planCheck] = await Promise.all([
            fetch(settingsUrl, {
                headers: {
                    'apikey':        SUPABASE_ANON,
                    'Authorization': 'Bearer ' + SUPABASE_ANON
                }
            }),
            verifyCompanyPlanEntitlement()
        ]);

        if (!settingsRes.ok) {
            console.error('[Support] platform_support_settings fetch failed:', settingsRes.status);
            renderUnavailable();
            return;
        }

        const rows = await settingsRes.json().catch(() => null);
        if (!Array.isArray(rows) || rows.length === 0) {
            console.warn('[Support] platform_support_settings row not found.');
            renderUnavailable();
            return;
        }

        applySettings(rows[0], planCheck);

    } catch (err) {
        console.error('[Support] Unexpected error loading support settings:', err);
        renderUnavailable();
    }
})();
