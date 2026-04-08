const fs = require('fs');
const files = ['reports.html', 'report-detail.html'];
files.forEach(f => {
  const p = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/' + f;
  const content = fs.readFileSync(p, 'utf8');
  console.log(f, 'avatarBtn count:', content.split('id="avatarBtn"').length - 1);
  console.log(f, 'genericModalOverlay count:', content.split('id="genericModalOverlay"').length - 1);
});
