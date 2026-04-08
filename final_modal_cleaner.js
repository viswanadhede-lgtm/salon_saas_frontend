const fs = require('fs');

const dPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/dashboard.html';
const dashHtml = fs.readFileSync(dPath, 'utf8');

const sIdx = dashHtml.indexOf('<div class="modal-overlay" id="bookingModalOverlay">');
const eIdx = dashHtml.lastIndexOf('</body>');
const modalsContent = '\n    <!-- INJECTED GLOBAL MODALS -->\n    ' + dashHtml.substring(sIdx, eIdx);

const files = ['reports.html', 'report-detail.html'];

files.forEach(f => {
    const p = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/' + f;
    let html = fs.readFileSync(p, 'utf8');
    
    // Find the first modal occurrence to slice off everything after it
    const bookingIdx = html.indexOf('id="bookingModalOverlay"');
    let cutIdx = html.lastIndexOf('<div class="modal-overlay"', bookingIdx);
    if(cutIdx === -1) cutIdx = html.indexOf('<!-- Premium New Booking Modal -->');
    if(cutIdx === -1) cutIdx = html.indexOf('<div class="modal-overlay" id="bookingModalOverlay">');
    
    // Also, if report-detail.html didn't have bookingModalOverlay initially, cut from bkGlobalDropdown
    if(cutIdx === -1) {
       cutIdx = html.indexOf('<!-- Global Bookings Actions Dropdown -->');
    }

    if (cutIdx !== -1) {
        // Keep the top part
        let newHtml = html.substring(0, cutIdx).trimRight();
        
        // Find the script tags to append back
        const scriptIdx = html.indexOf('<script src="dashboard.js"></script>');
        let scripts = '';
        if (scriptIdx !== -1) {
            scripts = html.substring(scriptIdx);
        } else {
            console.warn('Dashboard script not found in', f);
        }

        let finalHtml = newHtml + '\n' + modalsContent + '\n    <!-- Global Bookings Actions Dropdown -->\n    <div id="bkGlobalDropdown" class="bk-dropdown" style="position: fixed; display: none;"></div>\n\n    ' + scripts;

        // Fix CSS hex escapes
        const brokenRegex = /\u00e2\u201d\u20ac/g;
        if (brokenRegex.test(finalHtml)) {
            finalHtml = finalHtml.replace(brokenRegex, '─');
        }

        fs.writeFileSync(p, finalHtml, 'utf8');
        console.log('Successfully cleaned and rebuilt ' + f);
    } else {
        console.log('Could not determine cut index for ' + f);
    }
});
