import { API } from '../config/api.js';

document.addEventListener('DOMContentLoaded', () => {
    
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

function submitOnboarding() {
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
        const companyName = document.getElementById('salonName').value;
        const businessType = document.getElementById('businessType').value;
        const businessPhone = document.getElementById('salonPhone').value;
        const country = document.getElementById('country').value;
        const timezone = document.getElementById('timezone').value;

        const branchName = document.getElementById('locationName').value;
        const branchAddress = document.getElementById('address').value;
        const branchCity = document.getElementById('city').value;
        const branchState = document.getElementById('state').value;
        const branchPincode = document.getElementById('pincode').value;
        const branchPhone = document.getElementById('locationPhone').value;

        const payload = {
            full_name: data.full_name,
            email: data.email,
            phone: data.phone,
            password: data.password,
            plan_id: data.plan_id,
            plan_name: data.plan_name,
            role: "owner",

            company: {
                name: companyName,
                business_type: businessType,
                phone: businessPhone,
                country: country,
                timezone: timezone
            },

            branch: {
                name: branchName,
                address: branchAddress,
                city: branchCity,
                state: branchState,
                pincode: branchPincode,
                phone: branchPhone
            }
        };

        fetch(API.AUTH_REGISTER_COMPANY, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(respData => {
            console.log("Register response:", respData);

            // Unwrap array response e.g. [{ "token": "...", "company_id": "..." }]
            const resp = Array.isArray(respData) ? respData[0] : respData;

            // Store session token immediately after successful registration
            const token = resp.token || (resp.data && resp.data.token) || '';
            if (token) {
                localStorage.setItem('token', token);
                console.log('[onboarding] Session token stored:', token.substring(0, 10) + '...');
            } else {
                console.warn('[onboarding] No token in registration response.');
            }

            btn.textContent = 'Success! Redirecting to setup payments...';
            btn.style.backgroundColor = '#10b981';
            
            setTimeout(() => {
                const companyId = resp.company_id || (resp.data && resp.data.company_id) || '';
                window.location.href = `payments.html?company_id=${companyId}`;
            }, 1000);
        })
        .catch(err => {
            console.error("Error:", err);
            btn.textContent = originalText;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.disabled = false;
            errDiv.textContent = err.message || 'An error occurred during setup.';
            errDiv.style.display = 'block';
        });
    } catch (e) {
        console.error(e);
        errDiv.textContent = 'Failed to parse signup data or missing fields.';
        errDiv.style.display = 'block';
        btn.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}
