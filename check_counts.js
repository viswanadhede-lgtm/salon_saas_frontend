const fs = require('fs');
const s = fs.readFileSync('report-detail.html', 'utf8');
console.log('bookingModalOverlay count:', (s.match(/id="bookingModalOverlay"/g) || []).length);
console.log('header count:', (s.match(/<header/g) || []).length);
console.log('dashboard.js count:', (s.match(/dashboard\.js"/g) || []).length);

const s2 = fs.readFileSync('reports.html', 'utf8');
console.log('\nREPORTS.HTML:');
console.log('bookingModalOverlay count:', (s2.match(/id="bookingModalOverlay"/g) || []).length);
console.log('header count:', (s2.match(/<header/g) || []).length);
