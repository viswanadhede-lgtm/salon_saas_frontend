const fs = require('fs');
const filepathOverview = 'c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend\\overview.html';
const filepathExpenses = 'c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend\\expenses.html';

const overviewContent = fs.readFileSync(filepathOverview, 'utf8');
const expensesContent = fs.readFileSync(filepathExpenses, 'utf8');

// Find the modals section in overview.html
const startMarker = '<!-- Premium New Booking Modal -->';
const endMarker = '<script src="dashboard.js"></script>';

const startIndex = overviewContent.indexOf(startMarker);
const endIndex = overviewContent.indexOf(endMarker);

if (startIndex > -1 && endIndex > -1) {
    const modals = overviewContent.substring(startIndex, endIndex);

    // In expenses.html, we currently have:
    //    </div>
    //    <script src="dashboard.js"></script>
    
    // Check if it already has the modals
    if (!expensesContent.includes(startMarker)) {
        // Insert modals right before dashboard.js script
        const updatedExpenses = expensesContent.replace('<script src="dashboard.js"></script>', modals + '\n    <script src="dashboard.js"></script>');
        
        fs.writeFileSync(filepathExpenses, updatedExpenses);
        console.log('Modals restored to expenses.html');
    } else {
        console.log('Modals already exist.');
    }
} else {
    console.log('Could not find modal section in overview.html');
}
