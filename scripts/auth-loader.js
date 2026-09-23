(function() {
    // 1. Identify current path
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/')) || '/';
    
    // 2. Define public routes that don't require auth
    const PUBLIC_ROUTES = [
        '/', 
        '/index.html', 
        '/signin.html',
        '/pricing.html',
        '/plans.html',
        '/onboarding.html',
        '/payment-result.html',
        '/payments.html'
    ];
    
    if (PUBLIC_ROUTES.includes(filename)) return;

    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.replace('signin.html');
    } else {
        // Hide page immediately to prevent FOUC
        document.documentElement.style.display = 'none';

        // Inject branded loading spinner overlay directly into <head> via a style + body injection
        // We do this via DOMContentLoaded so <body> is available
        document.addEventListener('DOMContentLoaded', function() {
            // Don't inject if the page has already been revealed (auth guard responded quickly)
            if (document.documentElement.style.display !== 'none') return;

            const spinnerStyle = document.createElement('style');
            spinnerStyle.id = 'bbLoaderStyle';
            spinnerStyle.textContent = `
                #bbAuthLoader {
                    position: fixed;
                    inset: 0;
                    z-index: 2147483646;
                    background: #0f172a;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1.5rem;
                    font-family: Inter, -apple-system, sans-serif;
                }
                #bbAuthLoader .bb-logo {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    color: #ffffff;
                    font-size: 1.5rem;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                #bbAuthLoader .bb-logo svg {
                    color: #818cf8;
                }
                #bbAuthLoader .bb-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(129, 140, 248, 0.2);
                    border-top-color: #818cf8;
                    border-radius: 50%;
                    animation: bbSpin 0.8s linear infinite;
                }
                #bbAuthLoader .bb-label {
                    font-size: 0.875rem;
                    color: #64748b;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                @keyframes bbSpin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(spinnerStyle);

            const loader = document.createElement('div');
            loader.id = 'bbAuthLoader';
            loader.innerHTML = `
                <div class="bb-logo">
                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="2" y="6" width="28" height="20" rx="4" stroke="currentColor" stroke-width="2"/>
                        <path d="M8 12C8 12 11 16 16 16C21 16 24 12 24 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <circle cx="16" cy="16" r="2" fill="currentColor"/>
                    </svg>
                    <span>BharathBots</span>
                </div>
                <div class="bb-spinner"></div>
                <span class="bb-label">Verifying access...</span>
            `;
            document.body.appendChild(loader);
            
            // Reveal the spinner (un-hide document) now that the spinner is in place
            document.documentElement.style.display = '';
        }, { once: true });

        // Failsafe: 30s timeout. If global-auth-guard hasn't resolved by then,
        // show a friendly network error instead of silently redirecting.
        setTimeout(() => {
            const loader = document.getElementById('bbAuthLoader');
            if (loader) {
                // Replace spinner with a friendly error message
                loader.innerHTML = `
                    <div class="bb-logo">
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="2" y="6" width="28" height="20" rx="4" stroke="currentColor" stroke-width="2"/>
                            <path d="M8 12C8 12 11 16 16 16C21 16 24 12 24 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <circle cx="16" cy="16" r="2" fill="currentColor"/>
                        </svg>
                        <span>BharathBots</span>
                    </div>
                    <div style="text-align:center; display:flex; flex-direction:column; align-items:center; gap:1rem;">
                        <div style="background:#fee2e2; color:#ef4444; width:56px; height:56px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <p style="color:#f1f5f9; font-size:1.1rem; font-weight:600; margin:0;">Connection Timeout</p>
                        <p style="color:#64748b; font-size:0.9rem; margin:0;">Unable to reach the server. Please check your internet connection.</p>
                        <button onclick="window.location.reload()" style="margin-top:0.5rem; padding:0.75rem 2rem; background:#818cf8; color:white; border:none; border-radius:8px; font-size:0.9rem; font-weight:600; cursor:pointer; font-family:inherit;">
                            Try Again
                        </button>
                    </div>
                `;
            } else if (document.documentElement.style.display === 'none') {
                // Fallback: if spinner never mounted (DOMContentLoaded fired very late), redirect
                window.location.replace('signin.html');
            }
        }, 30000); // 30s max wait
    }
})();

