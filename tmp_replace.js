const fs = require('fs');

const path = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/report-detail.html';
const content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');

const startLine = 1587; // line 1588 is 0-indexed 1587
const endLine = 2136;   // line 2137 is 0-indexed 2136

// Keep lines before 1587 and after 2135
const before = lines.slice(0, startLine);
const after = lines.slice(endLine);

const replacement = [
    '    <script type="module" src="scripts/reports/report-builder.js"></script>'
];

const newContent = [...before, ...replacement, ...after].join('\n');
fs.writeFileSync(path, newContent);
console.log("Successfully replaced script block in report-detail.html");
