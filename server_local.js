const http = require('http');
const fs = require('fs');
const path = require('path');
const baseDir = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend';

http.createServer((req, res) => {
    const urlPath = req.url === '/' ? '/sales-history.html' : req.url;
    const file = path.join(baseDir, urlPath.split('?')[0]);
    try {
        const c = fs.readFileSync(file);
        const ext = path.extname(file);
        const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'};
        const t = types[ext] || 'text/plain';
        res.writeHead(200, {'Content-Type': t});
        res.end(c);
    } catch(e) {
        res.writeHead(404);
        res.end('Not found: ' + file);
    }
}).listen(7700, () => console.log('Server running on http://localhost:7700'));
