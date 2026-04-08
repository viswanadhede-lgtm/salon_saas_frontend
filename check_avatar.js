const fs = require('fs');
let html = '';
try { html = fs.readFileSync('reports.html', 'utf-16le'); } catch(e) {}
if (!html.includes('<html')) html = fs.readFileSync('reports.html', 'utf8');

const matches = html.match(/id="avatarBtn"/g);
console.log('avatarBtn count in reports.html:', matches ? matches.length : 0);
