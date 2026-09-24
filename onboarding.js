import { API } from '../config/api.js';
import { supabase } from './lib/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) {
        console.warn("No auth token found. User should theoretically be redirected to login.");
    }

    // Plan check
    const signupData = JSON.parse(localStorage.getItem('signup_data') || '{}');
    const planName = signupData.plan_name || localStorage.getItem('selected_plan') || 'Free Trial';
    const planEl = document.getElementById('summaryPlan');
    if (planEl) {
        planEl.textContent = planName;
    }
});

// Helper for displaying validation/API errors
function displayError(msg, focusFieldId = null) {
    const errDiv = document.getElementById('apiError');
    if (errDiv) {
        errDiv.textContent = msg;
        errDiv.style.display = 'block';
    }
    if (focusFieldId) {
        const el = document.getElementById(focusFieldId);
        if (el) {
            el.focus();
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// ----------------------------------------------------------------
// SUBMIT ONBOARDING (Unified Salon + Branch Creation)
// ----------------------------------------------------------------

async function submitOnboarding() {
    const btn = document.getElementById('btnSubmit');
    const errDiv = document.getElementById('apiError');
    const originalContent = btn.innerHTML;
    
    if (errDiv) errDiv.style.display = 'none';

    // 1. Validate Form Fields
    const companyName = document.getElementById('salonName')?.value.trim();
    const businessType = document.getElementById('businessType')?.value;
    const businessPhone = document.getElementById('salonPhone')?.value.trim();
    const country = document.getElementById('country')?.value || 'IN';
    const timezone = document.getElementById('timezone')?.value || 'Asia/Kolkata';

    const branchName = document.getElementById('locationName')?.value.trim();
    const branchAddress = document.getElementById('branchAddress')?.value.trim();
    const branchCity = document.getElementById('city')?.value.trim();
    const branchState = document.getElementById('state')?.value.trim();
    const branchPincode = document.getElementById('pincode')?.value.trim();
    const branchPhone = document.getElementById('locationPhone')?.value.trim();

    if (!companyName) return displayError("Please enter your Salon / Company Name.", 'salonName');
    if (!businessType) return displayError("Please select a Business Type.", 'businessType');
    if (!businessPhone) return displayError("Please enter your Business Phone number.", 'salonPhone');
    if (!branchName) return displayError("Please enter a Branch Name.", 'locationName');
    if (!branchAddress) return displayError("Please enter the Branch Street Address.", 'branchAddress');
    if (!branchCity) return displayError("Please enter the Branch City.", 'city');
    if (!branchState) return displayError("Please enter the Branch State / Province.", 'state');
    if (!branchPincode) return displayError("Please enter the Branch Pincode / Zip Code.", 'pincode');
    if (!branchPhone) return displayError("Please enter the Branch Phone number.", 'locationPhone');

    // 2. Set Button Loading State
    btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>Setting up your workspace...</span>
    `;
    btn.disabled = true;

    try {
        const data = JSON.parse(localStorage.getItem("signup_data") || '{}');
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        const user_id = data.user_id;

        if (!token || !user_id) {
            throw new Error("Authentication session missing! Please sign up or sign in again.");
        }

        // Map legacy string ids to correct Supabase UUIDs
        const planIdMapping = {
            'plan_01': 'd0d4cc8f-3498-4da1-b5e5-2887b9b39dce',
            'plan_02': 'b42bcd41-217a-4ddb-9451-20e040984277',
            'plan_03': 'b32fe38d-a715-4166-acf1-b970bd845c21',
            'trial':   '7e0af07f-b57b-40e7-a23a-6e8104c8033c'
        };

        const activePlanId = data.plan_id || 'trial';
        const planId = planIdMapping[activePlanId] || activePlanId;
        const planName = data.plan_name || 'Free Trial';
        const nowIso = new Date().toISOString();

        // 1. Insert Company
        const { data: compData, error: compErr } = await supabase.from('companies').insert({
            company_name: companyName,
            owner_user_id: user_id,
            plan_id: planId,
            plan_name: planName,
            status: 'active',
            subscription_status: 'pending'
        });

        if (compErr || !compData || !compData.length) {
            throw new Error("Failed to create Company: " + (compErr?.message || "Unknown database error"));
        }
        const company_id = compData[0].company_id || compData[0].id;
        const company_created_at = compData[0].created_at || nowIso;

        // 2. Insert Branch
        const { data: bData, error: bErr } = await supabase.from('branches').insert({
            company_id,
            branch_name: branchName,
            branch_phone: branchPhone,
            branch_address: branchAddress,
            branch_email: data.email,
            manager_user_id: user_id,
            status: 'active'
        });

        if (bErr || !bData || !bData.length) {
            throw new Error("Failed to create Branch: " + (bErr?.message || "Unknown database error"));
        }
        const branch_id = bData[0].branch_id || bData[0].id;

        // 3. Insert Role (Default Owner Role)
        const { data: roleData, error: rErr } = await supabase.from('roles').insert({
            company_id,
            branch_id,
            role_name: 'Owner',
            is_default: true,
            description: 'System Owner Role',
            status: 'active'
        });

        let role_id = null;
        if (!rErr && roleData && roleData.length) {
            role_id = roleData[0].role_id || roleData[0].id;

            // 4. Role Permissions (Granular based on Plan Features)
            try {
                const [planFeatsRes, planSubFeatsRes] = await Promise.all([
                    supabase.from('plan_features').select('feature_key').eq('plan_id', planId),
                    supabase.from('plan_sub_features').select('sub_feature_key').eq('plan_id', planId)
                ]);
                
                const featureKeys = (planFeatsRes.data || []).map(f => f.feature_key).filter(Boolean);
                const subFeatureKeys = (planSubFeatsRes.data || []).map(s => s.sub_feature_key).filter(Boolean);
                const allAllowedKeys = [...new Set([...featureKeys, ...subFeatureKeys])];

                if (allAllowedKeys.length > 0) {
                    const permissionRows = allAllowedKeys.map(key => ({
                        company_id,
                        branch_id,
                        role_id,
                        role_name: 'Owner',
                        permission_key: key,
                        status: 'active'
                    }));
                    const { error: permErr } = await supabase.from('role_permissions').insert(permissionRows);
                    if (permErr) console.warn("Failed to insert granular owner permissions:", permErr.message);
                } else {
                    console.warn("No plan features found. Inserting fallback 'ALL' key.");
                    await supabase.from('role_permissions').insert({
                        company_id, branch_id, role_id, role_name: 'Owner', permission_key: 'ALL', status: 'active'
                    });
                }
            } catch (permException) {
                console.error("Error setting up role permissions:", permException);
            }
        }

        // 5. Insert User
        const { error: userErr } = await supabase.from('users').insert({
            user_id,
            company_id,
            branch_id,
            name: data.full_name,
            email: data.email,
            phone: data.phone || null,
            password_hash: data.password_hash || null,
            role_id,
            role_name: 'Owner',
            status: 'active'
        });
        if (userErr) throw new Error('Failed to create User record: ' + userErr.message);

        // 6. Fetch plan_limits and insert usage_counters
        const DEFAULT_LIMITS = [
            { limit_key: 'max_branches', limit_value: 1 },
            { limit_key: 'max_users',    limit_value: 5 },
            { limit_key: 'max_staff',    limit_value: 10 },
            { limit_key: 'max_services', limit_value: 20 }
        ];

        const { data: planLimits } = await supabase
            .from('plan_limits')
            .select('*')
            .eq('plan_id', planId);

        const limitsToUse = (Array.isArray(planLimits) && planLimits.length > 0)
            ? planLimits
            : DEFAULT_LIMITS;

        for (const limit of limitsToUse) {
            const resourceKey = limit.limit_key;
            const currentCount = resourceKey === 'max_branches' ? 1 : 0;

            const { error: ucErr } = await supabase.from('usage_counters').insert({
                company_id,
                branch_id,
                plan_id: planId,
                resource_key: resourceKey,
                current_count: currentCount,
                max_limit: limit.limit_value
            });
            if (ucErr) console.error('[usage_counters] Insert error:', ucErr);
        }

        // 7. Insert Profile
        const nameParts = (data.full_name || '').split(' ');
        const first_name = nameParts[0];
        const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        const { error: profileErr } = await supabase.from('profiles').insert({
            user_id,
            company_id,
            branch_id,
            first_name,
            last_name,
            phone: data.phone || null,
            email: data.email,
            role_id,
            role_name: 'Owner',
            joined_on: company_created_at
        });
        if (profileErr) throw new Error('Failed to create Profile record: ' + profileErr.message);

        // 8. Save context to localStorage
        localStorage.setItem('company_id', company_id);
        localStorage.setItem('active_branch_id', branch_id);
        if (role_id) localStorage.setItem('role_id', role_id);

        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Workspace Created! Redirecting...</span>
        `;
        btn.style.backgroundColor = '#10b981';

        setTimeout(() => {
            window.location.href = `payments.html?company_id=${company_id}`;
        }, 800);

    } catch (err) {
        console.error("Onboarding Error:", err);
        btn.innerHTML = originalContent;
        btn.disabled = false;
        displayError(err.message || 'An error occurred during database setup. Please try again.');
    }
}

// Attach to window so inline onclick or form submit triggers it
window.submitOnboarding = submitOnboarding;
