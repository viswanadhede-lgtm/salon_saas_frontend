import { API } from '../config/api.js';
import { supabase } from './lib/supabase.js';document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Check
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.warn("No auth token found. User should theoretically be redirected to login.");
        // window.location.href = 'signin.html';
    }

    // Plan check
    const plan = localStorage.getItem('selected_plan') || 'None Selected (Error)';
    document.getElementById('summaryPlan').textContent = plan;

});

// ----------------------------------------------------------------
// UI WIZARD LOGIC
// ----------------------------------------------------------------

function nextStep(stepNumber) {
    // Basic validation before allowing next step
    if (stepNumber === 2 && !validateStep1()) return;
    
    updateWizardUI(stepNumber);
}

function prevStep(stepNumber) {
    updateWizardUI(stepNumber);
}

function updateWizardUI(targetStep) {
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
    });

    // Show target step
    document.getElementById(`step${targetStep}`).classList.add('active');

    // Update progress indicator
    document.querySelectorAll('.progress-step').forEach(indicator => {
        const stepVal = parseInt(indicator.getAttribute('data-step'));
        
        // Reset classes
        indicator.classList.remove('active', 'completed');
        
        if (stepVal < targetStep) {
            indicator.classList.add('completed');
        } else if (stepVal === targetStep) {
            indicator.classList.add('active');
        }
    });

    // Update lines between steps
    const lines = document.querySelectorAll('.progress-line');
    lines.forEach((line, index) => {
        line.classList.remove('completed');
        // Line 0 connects step 1 and 2. Line 1 connects step 2 and 3.
        if (index < targetStep - 1) {
            line.classList.add('completed');
        }
    });
}

function validateStep1() {
    const name = document.getElementById('salonName').value;
    const type = document.getElementById('businessType').value;
    
    if (!name || name.trim() === '') {
        alert('Please enter a Salon Name.');
        return false;
    }
    if (!type) {
        alert('Please select a Business Type.');
        return false;
    }
    return true;
}

function prepareConfirmation() {
    // Validate Step 2
    const locName = document.getElementById('locationName').value;
    const city = document.getElementById('city').value;
    const pincode = document.getElementById('pincode').value;
    
    if (!locName || locName.trim() === '') {
        alert('Please enter a Branch name.');
        return;
    }
    
    // Populate summary fields
    document.getElementById('summarySalon').textContent = document.getElementById('salonName').value;
    document.getElementById('summaryType').textContent = document.getElementById('businessType').value;
    document.getElementById('summaryLocation').textContent = locName;
    document.getElementById('summaryCity').textContent = city || 'N/A';
    document.getElementById('summaryPincode').textContent = pincode || 'N/A';
    
    // Move to step 3
    nextStep(3);
}

window.nextStep = nextStep;
window.prevStep = prevStep;
window.prepareConfirmation = prepareConfirmation;
window.submitOnboarding = submitOnboarding;

// ----------------------------------------------------------------
// API LOGIC
// ----------------------------------------------------------------

async function submitOnboarding() {
    const btn = document.getElementById('btnSubmit');
    const errDiv = document.getElementById('apiError');
    const originalText = btn.textContent;
    
    btn.textContent = 'Creating Salon...';
    btn.style.opacity = '0.8';
    btn.style.cursor = 'wait';
    btn.disabled = true;
    errDiv.style.display = 'none';

    try {
        const data = JSON.parse(localStorage.getItem("signup_data") || '{}');
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        const user_id = data.user_id;

        if (!token || !user_id) {
            throw new Error("Authentication missing! Please sign up again.");
        }

        const companyName = document.getElementById('salonName').value;
        const businessType = document.getElementById('businessType').value;
        const businessPhone = document.getElementById('salonPhone').value;
        const country = document.getElementById('country').value;
        const timezone = document.getElementById('timezone').value;

        const branchName = document.getElementById('locationName').value;
        const branchAddress = document.getElementById('branchAddress').value;
        const branchCity = document.getElementById('city').value;
        const branchState = document.getElementById('state').value;
        const branchPincode = document.getElementById('pincode').value;
        const branchPhone = document.getElementById('locationPhone').value;

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

        // 1. Insert Company — subscription details set later (on Free Trial / Pay & Activate)
        const { data: compData, error: compErr } = await supabase.from('companies').insert({
            company_name: companyName,
            owner_user_id: user_id,
            plan_id: planId,
            plan_name: planName,
            status: 'active',
            subscription_status: 'pending'
        });

        if (compErr || !compData || !compData.length) throw new Error("Failed to create Company: " + (compErr?.message || "Unknown db error"));
        const company_id = compData[0].company_id || compData[0].id;
        const company_created_at = compData[0].created_at || subscriptionStart;

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

        if (bErr || !bData || !bData.length) throw new Error("Failed to create Branch: " + (bErr?.message || "Unknown db error"));
        const branch_id = bData[0].branch_id || bData[0].id;

        // 3. Insert Role
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
                    // Fallback just in case plan has no features assigned yet (prevent lockout)
                    console.warn("No plan features found. Inserting fallback 'ALL' key.");
                    await supabase.from('role_permissions').insert({
                        company_id, branch_id, role_id, role_name: 'Owner', permission_key: 'ALL', status: 'active'
                    });
                }
            } catch (permException) {
                console.error("Error setting up role permissions:", permException);
            }
        }

        // 5. Insert User with SHA-256 password hash
        await supabase.from('users').insert({
            user_id,
            company_id,
            branch_id,
            name: data.full_name,
            email: data.email,
            phone: data.phone,
            password_hash: data.password_hash || '',
            role_id,
            role_name: 'Owner',
            status: 'active'
        });

        // 6. Fetch plan_limits and insert one usage_counter row per resource
        console.log('[usage_counters] Fetching plan_limits for plan_id:', planId);

        // Default limits used as fallback when plan_limits has no rows for this plan
        const DEFAULT_LIMITS = [
            { limit_key: 'max_branches', limit_value: 1 },
            { limit_key: 'max_users',    limit_value: 5 },
            { limit_key: 'max_staff',    limit_value: 10 },
            { limit_key: 'max_services', limit_value: 20 }
        ];

        const { data: planLimits, error: plErr } = await supabase
            .from('plan_limits')
            .select('*')
            .eq('plan_id', planId);

        console.log('[usage_counters] plan_limits result:', planLimits, plErr);

        const limitsToUse = (Array.isArray(planLimits) && planLimits.length > 0)
            ? planLimits
            : DEFAULT_LIMITS;

        if (!Array.isArray(planLimits) || planLimits.length === 0) {
            console.warn('[usage_counters] plan_limits empty or missing for plan_id:', planId, '— using defaults:', DEFAULT_LIMITS);
        }

        for (const limit of limitsToUse) {
            const resourceKey = limit.limit_key;
            const currentCount = resourceKey === 'max_branches' ? 1 : 0;
            console.log(`[usage_counters] Inserting: resource_key=${resourceKey}, current=${currentCount}, max=${limit.limit_value}`);

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
        await supabase.from('profiles').insert({
            user_id,
            company_id,
            branch_id,
            first_name,
            last_name,
            phone: data.phone,
            email: data.email,
            role_id,
            role_name: 'Owner',
            joined_on: company_created_at
        });

        // Save context to localStorage
        localStorage.setItem('company_id', company_id);
        localStorage.setItem('active_branch_id', branch_id);
        if (role_id) localStorage.setItem('role_id', role_id);

        btn.textContent = 'Success! Setting up payments...';
        btn.style.backgroundColor = '#10b981';

        setTimeout(() => {
            window.location.href = `payments.html?company_id=${company_id}`;
        }, 1000);

    } catch (err) {
        console.error("Onboarding Error:", err);
        btn.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
        errDiv.textContent = err.message || 'An error occurred during database setup.';
        errDiv.style.display = 'block';
    }
}
