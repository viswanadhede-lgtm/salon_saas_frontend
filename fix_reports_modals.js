const fs = require('fs');

const dPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/dashboard.html';
const rPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/reports.html';
const rdPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/report-detail.html';

try {
    let dashHtml = fs.readFileSync(dPath, 'utf8');

    // Extract modals from dashboard.html
    const startStr = '<div class="modal-overlay" id="bookingModalOverlay">';
    const endStr = '</body>';
    let startIndex = dashHtml.indexOf(startStr);
    let endIndex = dashHtml.lastIndexOf(endStr);

    if (startIndex !== -1 && endIndex !== -1) {
        let modalsContent = '\n    <!-- INJECTED GLOBAL MODALS -->\n    ' + dashHtml.substring(startIndex, endIndex);

        [rPath, rdPath].forEach(path => {
            let html = fs.readFileSync(path, 'utf8');
            // If it lacks bookingModalOverlay, we should inject it fully.
            // Even if it has fragments, it's safer to strip out any existing half-baked modals.
            
            // To be safe, let's just find where <script src="dashboard.js"></script> starts and insert modals right above it 
            // BUT wait, reports.html might already have the modals injected. Let's do a strict check.
            if (!html.includes('id="bookingModalOverlay"')) {
                // Remove everything from the end of <main> up to </main> end if it's there
                // Actually, let's just insert before <script src="dashboard.js">
                const splitStr = '<!-- Global Bookings Actions Dropdown -->';
                const splitIndex = html.indexOf(splitStr);
                if (splitIndex !== -1) {
                    html = html.substring(0, splitIndex) + modalsContent + '\n    ' + html.substring(splitIndex);
                    console.log(`Appended global modals to ${path}`);
                } else {
                    const scriptIndex = html.lastIndexOf('<script src="dashboard.js"></script>');
                    if (scriptIndex !== -1) {
                        html = html.substring(0, scriptIndex) + modalsContent + '\n    ' + html.substring(scriptIndex);
                        console.log(`Appended global modals to ${path}`);
                    }
                }
                
                // Fix broken CSS strings that could break scripts
                const brokenRegex = /\u00e2\u201d\u20ac/g;
                if (brokenRegex.test(html)) {
                    html = html.replace(brokenRegex, '─');
                }
                
                fs.writeFileSync(path, html, 'utf8');
            } else {
                console.log(`Modals already exist correctly in ${path}`);
            }
        });
    } else {
        console.log('Could not find modals in dashboard.html');
    }
} catch (err) {
    console.error(err);
}
