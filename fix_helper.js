const fs = require('fs');
const path = 'c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/sales-history.html';
let content = fs.readFileSync(path, 'utf8');

const helperStart = content.indexOf('<!-- Page-level helpers (load-order safe');
const helperScriptEnd = content.indexOf('</script>', helperStart) + '</script>'.length;

if (helperStart === -1 || helperScriptEnd === -1) {
    console.log('Could not find helper block.');
    process.exit(1);
}

const newHelper = [
    '<!-- Page-level helpers (load-order safe) -->',
    '    <script>',
    '        function hsToggleMenu(e, menuId) {',
    '            e.stopPropagation();',
    "            ['hsFilterMenu', 'hsDateMenu', 'hsExportMenu'].forEach(function(id) {",
    '                if (id !== menuId) {',
    '                    var m = document.getElementById(id);',
    "                    if (m) m.style.display = 'none';",
    '                }',
    '            });',
    '            var menu = document.getElementById(menuId);',
    '            if (!menu) return;',
    "            menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';",
    '        }',
    '',
    '        function hsShowToast(msg, color) {',
    "            var toast = document.getElementById('toastNotification');",
    '            if (!toast) return;',
    "            toast.textContent = msg || 'Done';",
    "            toast.style.background = color || '#3b82f6';",
    "            toast.classList.add('show');",
    "            setTimeout(function() { toast.classList.remove('show'); }, 3000);",
    '        }',
    '    </script>'
].join('\n');

content = content.substring(0, helperStart) + newHelper + '\n' + content.substring(helperScriptEnd);
fs.writeFileSync(path, content, 'utf8');
console.log('Done. Outer-close listener removed from helper script.');
