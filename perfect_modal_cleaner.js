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
    
    // We want to delete every single block that starts with `<div class="modal-overlay" ...`
    // up to its matching boundary. BUT regexing HTML is dangerous.
    
    // Instead, let's find the main content body.
    // The main content of reports.html is wrapped in:
    // <div class="main-content"> ... <main> ... </main> </div>
    // Let's grab everything up to `</main>` and the closing `</div>`.
    
    // So we slice at the closing `</main>` and the next `</div>`.
    let mainEndIdx = html.indexOf('</main>');
    if (mainEndIdx !== -1) {
        let divClosingIdx = html.indexOf('</div>', mainEndIdx);
        if (divClosingIdx !== -1) {
            let pureBody = html.substring(0, divClosingIdx + 6).trim();
            
            // Wait, does pureBody currently contain modal-overlays?
            // Let's check!
            if (pureBody.includes('class="modal-overlay"')) {
                // Modals are INSIDE the main wrapper!
                // We must strip them out from pureBody.
                // In earlier logs, we saw `reports.html` has `<div class="modal-overlay" id="genericModalOverlay">` inside.
                
                // We'll split pureBody by `class="modal-overlay"` and ONLY keep the first part!
                // Wait, are there anything after the modals inside <main>?
                // No, modals are typically at the bottom of the page.
                const firstModalIdx = pureBody.indexOf('<div class="modal-overlay"');
                if (firstModalIdx !== -1) {
                    // backtrack to any preceding comment
                    let cutIdx = pureBody.lastIndexOf('<!--', firstModalIdx);
                    if (cutIdx === -1 || firstModalIdx - cutIdx > 100) {
                        cutIdx = firstModalIdx;
                    }
                    pureBody = pureBody.substring(0, cutIdx).trim();
                    // we need to close the tags!
                    // pureBody is missing </main> and </div> potentially if we cut before them.
                    // Actually, let's just properly close the wrapper.
                    if (!pureBody.endsWith('</main>')) {
                        pureBody += '\n        </main>\n    </div>';
                    }
                }
            } else {
                // Make sure it is closed properly (it already is if we sliced at </div>)
            }
            
            // Now pureBody is clean. We append the modals and scripts.
            const scriptIdx = html.indexOf('<script src="dashboard.js"></script>');
            let scripts = '';
            if (scriptIdx !== -1) {
                scripts = html.substring(scriptIdx);
            }

            let finalHtml = pureBody + '\n\n' + modalsContent + '\n    <!-- Global Bookings Actions Dropdown -->\n    <div id="bkGlobalDropdown" class="bk-dropdown" style="position: fixed; display: none;"></div>\n\n    ' + scripts;

            // Fix broken characters
            const brokenRegex = /\u00e2\u201d\u20ac/g;
            if (brokenRegex.test(finalHtml)) {
                finalHtml = finalHtml.replace(brokenRegex, '─');
            }

            fs.writeFileSync(p, finalHtml, 'utf8');
            console.log('Cleaned securely: ' + f);
        }
    }
});
