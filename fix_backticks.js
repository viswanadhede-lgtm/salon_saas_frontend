const fs = require('fs');
let code = fs.readFileSync('users.js', 'utf8');
code = code.replace(/\\`/g, '`');
fs.writeFileSync('users.js', code);
console.log("Replaced escaped backticks.");
