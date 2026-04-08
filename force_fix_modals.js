const fs = require('fs');

const dPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/dashboard.html';
const dashHtml = fs.readFileSync(dPath, 'utf8');

const startStr = '<div class="modal-overlay" id="bookingModalOverlay">';
const endStr = '</body>';
let startIndex = dashHtml.indexOf(startStr);
let endIndex = dashHtml.lastIndexOf(endStr);
const modalsContent = '\n    <!-- INJECTED GLOBAL MODALS -->\n    ' + dashHtml.substring(startIndex, endIndex);

const files = ['reports.html', 'report-detail.html'];

files.forEach(f => {
    const p = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/' + f;
    let html = fs.readFileSync(p, 'utf8');
    
    // First, strictly remove ANY existing modal fragments to avoid ID collisions
    // We remove everything from the first "bookingModalOverlay" or "genericModalOverlay" or "Premium New Booking Modal" up to the global bookings dropdown script inclusion
    
    // An easy generic way: Find where the main container ends.
    // In reports.html, it's </main> </div>. Let's find </main>.
    const mainEndIdx = html.indexOf('</main>');
    if (mainEndIdx !== -1) {
        const divEndIdx = html.indexOf('</div>', mainEndIdx);
        if (divEndIdx !== -1) {
            // we slice up to the end of the main wrapper
            let safeTop = html.substring(0, divEndIdx + 6);
            
            // Now we get the scripts from the bottom
            const scriptStartIdx = html.indexOf('<script src="dashboard.js"></script>');
            if (scriptStartIdx !== -1) {
                let safeBottom = '\n    <!-- Global Bookings Actions Dropdown -->\n    <div id="bkGlobalDropdown" class="bk-dropdown" style="position: fixed; display: none;"></div>\n\n    ' + html.substring(scriptStartIdx);
                
                // Construct the clean HTML
                let cleanHtml = safeTop + '\n' + modalsContent + '\n' + safeBottom;
                
                // fix broken characters
                const brokenRegex = /\u00e2\u201d\u20ac/g;
                if (brokenRegex.test(cleanHtml)) {
                    cleanHtml = cleanHtml.replace(brokenRegex, '─');
                }
                
                fs.writeFileSync(p, cleanHtml, 'utf8');
                console.log('Cleaned and re-injected modals for ' + f);
            }
        }
    }
});
