const fs = require('fs');

const dPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/dashboard.html';
const sPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/sales-history.html';

try {
    let dashHtml = fs.readFileSync(dPath, 'utf8');
    let salesHtml = fs.readFileSync(sPath, 'utf8');

    // 1. Extract modals from dashboard.html
    const startStr = '<div class="modal-overlay" id="bookingModalOverlay">';
    const endStr = '</body>';
    let startIndex = dashHtml.indexOf(startStr);
    let endIndex = dashHtml.lastIndexOf(endStr);

    if (startIndex !== -1 && endIndex !== -1) {
        let modalsContent = '\n    <!-- INJECTED GLOBAL MODALS -->\n    ' + dashHtml.substring(startIndex, endIndex);
        
        if (!salesHtml.includes('id="bookingModalOverlay"')) {
            let salesEndIndex = salesHtml.lastIndexOf('</body>');
            if (salesEndIndex !== -1) {
                salesHtml = salesHtml.substring(0, salesEndIndex) + modalsContent + '\n' + salesHtml.substring(salesEndIndex);
                console.log('Appended global modals.');
            }
        } else {
            console.log('Modals already exist in sales-history.');
        }
    } else {
        console.log('Could not find modals in dashboard.html');
    }

    // 2. Fix the corrupted CSS strings specifically (using hex escapes to avoid script corruption)
    // pattern \xc3\xa2\xc2\x94\xc2\x80 is "â”€"
    const brokenRegex = /\u00e2\u201d\u20ac/g; 
    if (brokenRegex.test(salesHtml)) {
        salesHtml = salesHtml.replace(brokenRegex, '─');
        console.log('Fixed broken characters.');
    }
    
    // Also remove the error injector script I added earlier
    const injectorStart = salesHtml.indexOf('<script>\nwindow.onerror');
    if (injectorStart !== -1) {
        const injectorEnd = salesHtml.indexOf('</script>\n</head>', injectorStart);
        if (injectorEnd !== -1) {
            salesHtml = salesHtml.substring(0, injectorStart) + '</head>' + salesHtml.substring(injectorEnd + 17);
            console.log('Removed diagnostic script.');
        }
    }

    fs.writeFileSync(sPath, salesHtml, 'utf8');
    console.log('Done.');
    
} catch (err) {
    console.error(err);
}
