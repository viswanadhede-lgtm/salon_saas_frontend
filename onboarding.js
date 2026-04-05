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
    
    // UI Loading state
    btn.textContent = 'Creating Salon...';
    btn.style.opacity = '0.8';
    btn.style.cursor = 'wait';
    btn.disabled = true;
    errDiv.style.display = 'none';

    try {
        const data = JSON.parse(localStorage.getItem("signup_data") || '{}');
        const token = localStorage.getItem('token');
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

        const planId = data.plan_id || 'trial';
        const planName = data.plan_name || 'Free Trial';

        // 1. Insert Company
        const { data: compData, error: compErr } = await supabase.from('companies').insert({
            company_name: companyName,
            owner_user_id: user_id,
            plan_id: planId,
            plan_name: planName,
            status: 'active',
            subscription_status: 'trial'
        }).select();

        if (compErr || !compData || !compData.length) throw new Error("Failed to create Company: " + (compErr?.message || "Unknown db error"));
        const company_id = compData[0].company_id || compData[0].id;

        // 2. Insert Branch
        const { data: bData, error: bErr } = await supabase.from('branches').insert({
            company_id: company_id,
            branch_name: branchName,
            branch_phone: branchPhone,
            branch_address: branchAddress,
            manager_user_id: user_id,
            status: 'active'
        }).select();

        if (bErr || !bData || !bData.length) throw new Error("Failed to create Branch: " + (bErr?.message || "Unknown db error"));
        
        // Use either the standard 'id' or explicit 'branch_id' depending on exactly how it returns
        const branch_id = bData[0].branch_id || bData[0].id; 

        // 3. Insert Role
        const { data: roleData, error: rErr } = await supabase.from('roles').insert({
            company_id,
            branch_id,
            role_name: 'Owner',
            is_default: true,
            description: 'System Owner Role',
            status: 'active'
        }).select();

        let role_id = null;
        if (!rErr && roleData && roleData.length) {
            role_id = roleData[0].role_id || roleData[0].id;
            
            // 4. Role Permissions
            await supabase.from('role_permissions').insert({
                company_id, branch_id, role_id, role_name: 'Owner', permission_key: 'ALL', status: 'active'
            });
        }

        // 5. Insert explicit mapped User
        await supabase.from('users').insert({
            user_id: user_id,
            company_id,
            branch_id,
            name: data.full_name,
            email: data.email,
            phone: data.phone,
            role_id,
            role_name: 'Owner',
            status: 'active'
        });

        // 6. Init Usage Counters
        await supabase.from('usage_counters').insert({
            company_id, branch_id, plan_id: planId, resource_key: 'services', current_count: 0
        });

        // 7. Init Profile
        const nameParts = (data.full_name || '').split(' ');
        const first_name = nameParts[0];
        const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        await supabase.from('profiles').insert({
            user_id: user_id,
            company_id,
            branch_id,
            first_name,
            last_name,
            phone: data.phone,
            email: data.email,
            role_id,
            role_name: 'Owner'
        });

        // Mapping is complete! Keep important context in localStorage.
        localStorage.setItem('company_id', company_id);
        localStorage.setItem('active_branch_id', branch_id);
        if (role_id) localStorage.setItem('role_id', role_id);

        btn.textContent = 'Success! Redirecting to setup payments...';
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
