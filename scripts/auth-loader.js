(function() {
    // 1. Identify current path
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/')) || '/';
    
    // 2. Define exactly which pages ARE allowed to be shown without tokens
    // These typically match the unguarded routes 
    const PUBLIC_ROUTES = [
        '/', 
        '/index.html', 
        '/signin.html',
        '/pricing.html',
        '/onboarding.html',
        '/payment-result.html',
        '/payments.html'
    ];
    
    // If it's a known public route, don't do anything to block render
    if (PUBLIC_ROUTES.includes(filename)) {
        return;
    }

    // 3. For ALL other pages (assumed strictly protected feature pages)
    const token = localStorage.getItem('token');
    
    if (!token) {
        // Red alert: No token at all. Immediate redirect to stop the page from loading.
        window.location.replace('signin.html');
    } else {
        // Token exists. BUT we don't know if it's valid yet.
        // We hide the entire document content immediately to prevent visually leaking the Dashboard UI.
        // It will be revealed securely by global-auth-guard.js ONLY after the remote API validates it.
        document.documentElement.style.display = 'none';
        
        // Failsafe timeout in case network request totally fails or gets stuck forever
        // This ensures the page doesn't remain completely white indefinitely
        setTimeout(() => {
            if (document.documentElement.style.display === 'none') {
                 console.error('[Auth Loader] Global auth guard resolution timed out. Forcing redirect to signin.');
                 window.location.replace('signin.html');
            }
        }, 10000); // 10s max wait time for the API
    }
})();
