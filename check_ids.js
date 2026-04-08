const fs = require('fs');
const h = fs.readFileSync('report-detail.html', 'utf8');
console.log('userProfileDropdown:', h.includes('id="userProfileDropdown"'));
console.log('avatarBtn:', h.includes('id="avatarBtn"'));
console.log('profileMenu:', h.includes('id="profileMenu"'));
console.log('tbTableBodyToday:', h.includes('id="tbTableBodyToday"'));
console.log('calendarGrid:', h.includes('id="calendarGrid"'));
console.log('sidebar:', h.includes('id="sidebar"'));
