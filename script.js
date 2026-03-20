document.addEventListener('DOMContentLoaded', () => {
    // Password visibility toggle
    const togglePasswordBtn = document.querySelector('.btn-toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Toggle the eye icon SVG
            const svg = togglePasswordBtn.querySelector('svg');
            if (type === 'text') {
                // Eye-off icon
                svg.innerHTML = `
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                `;
            } else {
                // Eye icon
                svg.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `;
            }
        });
    }

    // Signup form submission
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const fullname = document.getElementById('fullname').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;
            
            const signupData = {
                full_name: fullname,
                email: email,
                phone: phone,
                password: password
            };
            localStorage.setItem('signup_data', JSON.stringify(signupData));
            
            const btn = signupForm.querySelector('.btn-primary');
            const originalText = btn.textContent;
            
            // Simple visual feedback for the user
            btn.textContent = 'Creating account...';
            btn.style.opacity = '0.8';
            btn.style.cursor = 'wait';
            btn.disabled = true;

            // Simulate API call
            setTimeout(() => {
                btn.textContent = 'Welcome to BharathBots!';
                // Briefly flash a success color (green)
                btn.style.backgroundColor = '#10b981'; 
                
                setTimeout(() => {
                    // Redirect to plans page for onboarding
                    window.location.href = 'plans.html';
                }, 1500);
            }, 1200);
        });
    }

    // Signin form submission
    const signinForm = document.getElementById('signin-form');
    if (signinForm) {
        signinForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const btn = signinForm.querySelector('.btn-primary');
            const originalText = btn.textContent;
            
            // Simple visual feedback for the user
            btn.textContent = 'Signing in...';
            btn.style.opacity = '0.8';
            btn.style.cursor = 'wait';
            btn.disabled = true;

            // Simulate API call
            setTimeout(() => {
                btn.textContent = 'Welcome back!';
                // Briefly flash a success color (green)
                btn.style.backgroundColor = '#10b981'; 
                
                setTimeout(() => {
                    // Redirect to plans page for onboarding
                    window.location.href = 'plans.html';
                }, 2500);
            }, 1200);
        });
    }

    // Add subtle intersection observer animation for the form wrapper
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    const formWrapper = document.querySelector('.form-wrapper');
    if (formWrapper) {
        // Initial state before animation triggers (if JS is loaded)
        formWrapper.style.opacity = '0';
        formWrapper.style.transform = 'translateY(20px)';
        formWrapper.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(formWrapper);
    }
});
