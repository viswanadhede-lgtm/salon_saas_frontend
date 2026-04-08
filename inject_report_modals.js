const fs = require('fs');

const reportPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/report-detail.html';
const modalsPath = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/modals.txt';

let html = fs.readFileSync(reportPath, 'utf8');
let modals = fs.readFileSync(modalsPath, 'utf8');

const targetStr = '<!-- Global Bookings Actions Dropdown -->\r\n    <div id="bkGlobalDropdown" class="bk-dropdown" style="position: fixed; display: none;"></div>';

if (html.includes('id="bookingModalOverlay"')) {
    console.log('Modals already injected.');
} else {
    // If exact target string isn't found due to newlines, we'll replace broadly
    let replacedHtml = html.replace(/<!-- Global Bookings Actions Dropdown -->[\s\S]*?<div id="bkGlobalDropdown" class="bk-dropdown" style="position: fixed; display: none;"><\/div>/, modals);
    
    if (replacedHtml !== html) {
        fs.writeFileSync(reportPath, replacedHtml, 'utf8');
        console.log('Successfully injected modals!');
    } else {
        console.log('Failed to find target string to replace.');
    }
}
