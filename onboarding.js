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

    // Attach event listeners for form submission & button click
    const form = document.getElementById('onboardingForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitOnboarding();
        });
    }

    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', (e) => {
            const formEl = document.getElementById('onboardingForm');
            if (formEl && formEl.checkValidity && !formEl.checkValidity()) {
                // Let native browser form validation highlight invalid inputs
                return;
            }
            e.preventDefault();
            submitOnboarding();
        });
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
// SUBMIT ONBOARDING (Atomic Workspace Creation via RPC)
// ----------------------------------------------------------------

async function submitOnboarding() {
    const btn = document.getElementById('btnSubmit');
    const errDiv = document.getElementById('apiError');
    const originalContent = btn ? btn.innerHTML : '<span>Create My Salon & Continue</span>';
    
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
    if (btn) {
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10"></path>
            </svg>
            <span>Setting up your workspace...</span>
        `;
        btn.disabled = true;
    }

    try {
        const data = JSON.parse(localStorage.getItem("signup_data") || '{}');
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        let user_id = data.user_id;

        // Fallback: check active Supabase Auth session if user_id wasn't in signup_data
        if (!user_id) {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData?.session?.user?.id) {
                user_id = sessionData.session.user.id;
                data.user_id = user_id;
            }
        }

        if (!user_id) {
            throw new Error("Authentication session missing! Please sign up or sign in again.");
        }

        if (!data.phone) {
            data.phone = businessPhone || branchPhone || '';
            localStorage.setItem("signup_data", JSON.stringify(data));
        }

        // Resolve the plan_id for the workspace RPC.
        //
        // Priority:
        // 1. plan_id already stored in signup_data (UUID from dynamic DB fetch in plans.js)
        // 2. Fallback: fetch from public.plans by plan_name (handles cases where plans.js
        //    could not reach the DB during plan selection)
        // 3. Last resort: send the name as-is and let the RPC handle it gracefully.
        //
        // NOTE: The old hardcoded UUID mapping is removed. Those UUIDs were stale and
        //       no longer match the live database records.
        let activePlanId   = data.plan_id   || null;
        const activePlanName = data.plan_name || localStorage.getItem('selected_plan') || 'growth';
        let planName = activePlanName || 'Growth';

        // If no UUID was stored, attempt a live fetch from public.plans
        if (!activePlanId || String(activePlanId).length < 30) {
            try {
                const { data: planRow, error: planFetchErr } = await supabase
                    .from('plans')
                    .select('plan_id, plan_name')
                    .ilike('plan_name', activePlanName.replace(/^plan_0?[123]$/i, 'growth'))
                    .eq('status', 'active')
                    .maybeSingle();

                if (!planFetchErr && planRow) {
                    activePlanId = planRow.plan_id;
                    planName     = planRow.plan_name;
                } else {
                    console.warn('[onboarding] Live plan fetch failed, using name only:', planFetchErr?.message);
                    activePlanId = null; // RPC will receive null and should use its own default
                }
            } catch (fetchErr) {
                console.warn('[onboarding] Could not fetch plan from DB:', fetchErr);
                activePlanId = null;
            }
        } else {
            // UUID was already present from plans.js dynamic fetch — use it directly
            planName = data.plan_name || planName;
        }

        const planId = activePlanId;

        const countryNameMap = {
            'IN': 'India',
            'US': 'United States',
            'UK': 'United Kingdom',
            'AE': 'UAE'
        };
        const countryName = countryNameMap[country] || country || 'India';

        // 3. Prepare Payload for Atomic Onboarding RPC
        const rpcPayload = {
            user_id: user_id,
            full_name: data.full_name || '',
            email: data.email || '',
            phone: data.phone || businessPhone || branchPhone || '',
            password_hash: data.password_hash || null,
            company_name: companyName,
            business_category: businessType,
            business_structure: 'single_location',
            business_phone: businessPhone,
            plan_id: planId,
            plan_name: planName,
            branch_name: branchName,
            branch_phone: branchPhone,
            branch_address: branchAddress,
            city: branchCity,
            state: branchState,
            pin_code: branchPincode,
            country: countryName
        };

        // 4. Execute Atomic Single-Transaction Onboarding
        const { data: res, error: rpcErr } = await supabase.rpc('onboard_company_workspace', {
            p_data: rpcPayload
        });

        if (rpcErr) {
            throw new Error(rpcErr.message || 'Database error during workspace creation.');
        }

        if (!res || res.success === false) {
            throw new Error(res?.error || res?.message || 'Failed to initialize workspace.');
        }

        // 5. Save Workspace Context
        const company_id = res.company_id;
        const branch_id  = res.branch_id;
        const role_id    = res.role_id;

        localStorage.setItem('company_id', company_id);
        localStorage.setItem('active_branch_id', branch_id);
        if (role_id) localStorage.setItem('role_id', role_id);
        localStorage.setItem('plan_id', planId);
        localStorage.setItem('plan_name', planName);

        const appContext = {
            company: {
                id: company_id,
                company_id: company_id,
                company_name: companyName,
                plan_id: planId,
                plan_name: planName
            },
            branch: {
                id: branch_id,
                branch_id: branch_id,
                name: branchName
            },
            user: {
                id: user_id,
                name: data.full_name || '',
                email: data.email || '',
                role_id: role_id,
                role_name: 'Owner'
            }
        };
        localStorage.setItem('appContext', JSON.stringify(appContext));

        // 6. Success Feedback & Redirect
        if (btn) {
            btn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Workspace Created! Redirecting...</span>
            `;
            btn.style.backgroundColor = '#10b981';
        }

        setTimeout(() => {
            window.location.href = `payments.html?company_id=${company_id}&plan_id=${planId}&plan_name=${encodeURIComponent(planName)}`;
        }, 800);

    } catch (err) {
        console.error("Onboarding Error:", err);
        if (btn) {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
        displayError(err.message || 'An error occurred during database setup. Please try again.');
    }
}

// Attach to window so inline onclick or form submit triggers it
window.submitOnboarding = submitOnboarding;
