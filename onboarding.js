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

// ----------------------------------------------------------------
// API MOCK LOGIC
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

    // Mock API delays
    
    // 1. Create Company Request
    setTimeout(() => {
        btn.textContent = 'Creating Branch...';
        
        // 2. Create Branch Request
        setTimeout(() => {
            btn.textContent = 'Success! Redirecting...';
            btn.style.backgroundColor = '#10b981';
            
            // 3. Complete and redirect
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
            
        }, 1200);

    }, 1000);
    
    /* 
    REAL API IMPLEMENTATION EXAMPLE:
    
    const token = localStorage.getItem('auth_token');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // 1. Create Company
    fetch('https://api.bharathbots.com/v1/companies', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            name: document.getElementById('salonName').value,
            business_type: document.getElementById('businessType').value,
            phone: document.getElementById('salonPhone').value,
            country: document.getElementById('country').value,
            timezone: document.getElementById('timezone').value,
            plan: localStorage.getItem('selected_plan')
        })
    })
    .then(companyRes => companyRes.json())
    .then(companyData => {
        const companyId = companyData.id;

        // 2. Create Branch
        return fetch('https://api.bharathbots.com/v1/branches', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                company_id: companyId,
                name: document.getElementById('locationName').value,
                address: document.getElementById('address').value,
                city: document.getElementById('city').value,
                state: document.getElementById('state').value,
                pincode: document.getElementById('pincode').value,
                phone: document.getElementById('locationPhone').value
            })
        });
    })
    .then(branchRes => {
        if (!branchRes.ok) throw new Error('Failed to create branch');
        // Success
        window.location.href = 'dashboard.html';
    })
    .catch(error => {
        // Reset UI
        btn.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
        
        // Show error
        errDiv.textContent = error.message || 'An error occurred during setup.';
        errDiv.style.display = 'block';
    });
    */
}
