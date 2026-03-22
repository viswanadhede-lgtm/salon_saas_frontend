document.addEventListener('DOMContentLoaded', () => {
    const formInputs = document.querySelectorAll('.settings-form .form-input, .settings-form .form-select, .settings-form .form-textarea');
    const stickyFooter = document.querySelector('.sticky-footer');
    let hasChanges = false;

    // Show sticky footer when any input changes
    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            if (!hasChanges) {
                hasChanges = true;
                stickyFooter.classList.add('show');
            }
        });
        
        // Also catch change events for selects
        if (input.tagName === 'SELECT') {
            input.addEventListener('change', () => {
                if (!hasChanges) {
                    hasChanges = true;
                    stickyFooter.classList.add('show');
                }
            });
        }
    });

    // Handle logo upload preview
    const logoInput = document.getElementById('companyLogo');
    const logoPreview = document.getElementById('logoPreview');

    if (logoInput) {
        logoInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    logoPreview.innerHTML = `<img src="${e.target.result}" alt="Company Logo" style="width: 100%; height: 100%; object-fit: cover;">`;
                    if (!hasChanges) {
                        hasChanges = true;
                        stickyFooter.classList.add('show');
                    }
                }
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }
});

function saveSettings() {
    // Collect settings data (simulation)
    const companyName = document.getElementById('companyName').value;
    const currency = document.getElementById('currency').value;
    
    // Show toast
    const toast = document.getElementById('toastNotification');
    if (toast) {
        toast.textContent = 'Company settings saved successfully!';
        toast.className = 'toast-notification show';
        
        setTimeout(() => {
            toast.className = toast.className.replace('show', '');
            // Simulate page refresh to clear unsaved state
            setTimeout(() => {
                window.location.reload();
            }, 300);
        }, 3000);
        
        // Hide footer immediately on save
        document.querySelector('.sticky-footer').classList.remove('show');
    }
}
