const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let updatedCount = 0;

for (const file of files) {
  const filepath = path.join(dir, file);
  let content = fs.readFileSync(filepath, 'utf8');

  if (content.includes('data-feature="reports_access"')) {
    const target = 'class="nav-text">Reports</span></a></li>';
    const indexOfTarget = content.indexOf(target);
    
    if (indexOfTarget > -1 && !content.includes('expenses.html" class="submenu-link" data-feature="analytics_expenses"')) {
      // Split on target and join with replacement
      const parts = content.split(target);
      const replacement = `class="nav-text">Reports</span></a></li>\n                        <li><a href="expenses.html" class="submenu-link" data-feature="analytics_expenses"><span class="submenu-bullet">&bull;</span><span class="nav-text">Expenses</span></a></li>`;
      
      content = parts.join(replacement);
      fs.writeFileSync(filepath, content);
      updatedCount++;
    }
  }
}

console.log(`Updated ${updatedCount} files.`);
