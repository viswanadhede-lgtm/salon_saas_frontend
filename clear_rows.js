const fs = require('fs');

const file = 'customers.html';
let content = fs.readFileSync(file, 'utf8');

// Find <tbody> and </tbody> and just keep <tbody></tbody>
const startIdx = content.indexOf('<tbody id="customersTableBody">');
const endIdx = content.indexOf('</tbody>', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const newContent = content.substring(0, startIdx) + '<tbody id="customersTableBody">\n                        </tbody>' + content.substring(endIdx + 8);
    fs.writeFileSync(file, newContent);
    console.log('Cleared static table rows successfully.');
} else {
    console.log('Could not find tbody.');
}
