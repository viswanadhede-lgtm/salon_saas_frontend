const fs = require('fs');

const expensesContent = fs.readFileSync('c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend\\expenses.html', 'utf8');
const modalsContent = fs.readFileSync('c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend\\modals.txt', 'utf8');

// Find where <script src="dashboard.js"> begins and strip everything after
const scriptStartStr = '<script src="dashboard.js">';
const cutIndex = expensesContent.indexOf(scriptStartStr);

let cleanTop;
if(cutIndex > -1) {
    cleanTop = expensesContent.substring(0, cutIndex);
} else {
    // try to find where </main> ends if the script wasn't found
    const mainEnd = expensesContent.indexOf('</main>');
    cleanTop = expensesContent.substring(0, mainEnd + 7) + '\n    </div>\n\n';
}

const bottomContent = `    <script src="dashboard.js"></script>
    <script src="config/feature-registry.js" type="module"></script>
    <script src="config/api.js" type="module"></script>
    <script src="scripts/global-auth-guard.js" type="module"></script>
    <script src="scripts/logout.js" type="module"></script>
    <script src="scripts/expenses.js" type="module"></script>

${modalsContent}

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            if(window.feather) { feather.replace(); }
        });
    </script>
</body>
</html>`;

fs.writeFileSync('c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend\\expenses.html', cleanTop + bottomContent);
console.log('Fixed expenses.html layout and removed bad scripts');
