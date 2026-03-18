const fs = require('fs');
const path = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/sales-history.html';

let content = fs.readFileSync(path, 'utf8');

const helperScript = `
    <!-- Page-level helpers (load-order safe, called by inline onclick) -->
    <script>
        function hsToggleMenu(e, menuId) {
            e.stopPropagation();
            ['hsFilterMenu', 'hsDateMenu', 'hsExportMenu'].forEach(function(id) {
                if (id !== menuId) {
                    var m = document.getElementById(id);
                    if (m) m.style.display = 'none';
                }
            });
            var menu = document.getElementById(menuId);
            if (!menu) return;
            menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
        }

        function hsShowToast(msg, color) {
            var toast = document.getElementById('toastNotification');
            if (!toast) return;
            toast.textContent = msg || 'Done';
            toast.style.background = color || '#3b82f6';
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 3000);
        }

        // Close hs dropdowns when clicking outside them
        document.addEventListener('click', function(e) {
            var containers = document.querySelectorAll('.filter-dropdown-container, .date-dropdown-container, .export-dropdown-container');
            containers.forEach(function(c) {
                if (!c.contains(e.target)) {
                    c.querySelectorAll('.filter-menu').forEach(function(m) {
                        m.style.display = 'none';
                    });
                }
            });
        });
    </script>

`;

const target = '<script src="sales-history.js"></script>';
if (content.includes(target)) {
    content = content.replace(target, helperScript + target);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Success: helper script injected.');
} else {
    // Try with backslash-r
    const target2 = '<script src="sales-history.js"><\/script>';
    const idx = content.indexOf('sales-history.js');
    if (idx !== -1) {
        console.log('Found script at position', idx);
        console.log('Snippet:', JSON.stringify(content.substring(idx - 15, idx + 50)));
    } else {
        console.log('ERROR: sales-history.js not found in file.');
    }
}
