const fs = require('fs');
const path = require('path');

const directory = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend';
const files = fs.readdirSync(directory).filter(f => f.endsWith('.html'));

// The regular expression needs to be robust to handle whitespace variations
// We'll search for the block starting with "<!-- Time Zone -->" and ending with the closing div of "Date & Time Format"
const regex = /<!-- Time Zone -->[\s\S]*?<!-- Date & Time Format -->[\s\S]*?<div class="form-group">[\s\S]*?<\/select>[\s\S]*?<\/div>/g;

files.forEach(file => {
    const filePath = path.join(directory, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (regex.test(content)) {
        const newContent = content.replace(regex, '');
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Cleaned: ${file}`);
    } else {
        // console.log(`Skipped (not found): ${file}`);
    }
});
