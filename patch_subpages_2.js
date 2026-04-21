const fs = require('fs');

function patchHtmlFile(filePath, filterLogic) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Replace the const todaysBookingsData with let variant
    const matcher = /const todaysBookingsData = \[\s*\{([^]*?)\}\s*,\s*\];/;
    if (content.match(matcher)) {
        content = content.replace(matcher, 'let todaysBookingsData = [];');
    } else {
        content = content.replace(/const todaysBookingsData = \[[\s\S]*?\];/, 'let todaysBookingsData = [];');
    }

    // 2. Identify the correct render call for this file
    let renderCall = 'renderTable()';
    if (filePath.includes('todays-bookings')) {
        renderCall = 'renderBookingsTable()';
    }

    let dateBadgeCall = `document.getElementById('tbDateLabel').textContent = now.toLocaleDateString('en-IN', opts);`;
    if (filePath.includes('completed-appointments')) {
        dateBadgeCall = `document.getElementById('caDateLabel').textContent = now.toLocaleDateString('en-IN', opts);`;
    } else if (filePath.includes('no-shows')) {
        dateBadgeCall = `document.getElementById('noscDateLabel').textContent = now.toLocaleDateString('en-IN', opts);`;
    }

    // specific count update logic
    let countBadgeLogic = `
        const countEl = document.getElementById('tbCountBadge');
        if (countEl) countEl.textContent = todaysBookingsData.length + ' bookings';
    `;
    if (filePath.includes('completed-appointments')) {
        countBadgeLogic = `
        const completed = todaysBookingsData.filter(b => b.status === 'completed');
        document.getElementById('caCountBadge').textContent = completed.length + ' completed';
        `;
    } else if (filePath.includes('no-shows')) {
        countBadgeLogic = `
        const noShows = todaysBookingsData.filter(b => b.status === 'noshow');
        const cancelled = todaysBookingsData.filter(b => b.status === 'cancelled');
        document.getElementById('noscNoShowBadge').textContent = noShows.length + ' no-show' + (noShows.length !== 1 ? 's' : '');
        document.getElementById('noscCancelledBadge').textContent = cancelled.length + ' cancelled';
        `;
    }

    // Define the async fetch logic
    const liveFetchLogic = `
        async function initPage() {
            const now = new Date();
            const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            ${dateBadgeCall}
            
            try {
                const branchId = localStorage.getItem('company_branch_id');
                if (!branchId) throw new Error("No branch selected.");

                const { supabase } = await import('./lib/supabase.js');
                
                const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

                let query = supabase
                    .from('bookings_for_business_transaction')
                    .select('*')
                    .eq('branch_id', branchId)
                    .eq('booking_date', localISOTime)
                    .order('start_time', { ascending: true });
                    
                ${filterLogic}

                const { data, error } = await query;
                if (error) throw error;

                todaysBookingsData = (data || []).map((b, i) => {
                    const parsedStart = b.start_time ? b.start_time.split(':') : ['09', '00'];
                    let hours = parseInt(parsedStart[0]);
                    const minutes = parsedStart[1];
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    hours = hours % 12 || 12;
                    const formattedTime = \`\${String(hours).padStart(2, '0')}:\${minutes} \${ampm}\`;
                    const displayId = 'BK-' + (b.booking_id ? b.booking_id.substring(0,6).toUpperCase() : '000000');

                    return {
                        id: displayId,
                        customer: b.customer_name || 'Walk-in Customer',
                        time: formattedTime,
                        service: b.service_name || 'N/A',
                        staff: b.staff_name || 'Unassigned',
                        status: (b.status || 'booked').toLowerCase(),
                        amount: '₹' + (b.total_price || 0).toLocaleString('en-IN'),
                        payment: (b.payment || 'pending').toLowerCase()
                    };
                });
            } catch (err) {
                console.error("Failed to load live bookings:", err);
            }

            ${countBadgeLogic}
            
            ${renderCall};
        }`;

    // Regex to match the entire function initPage() {...} up to the closing brace!
    const initPageMatcher = /function initPage\s*\(\)\s*\{[\s\S]*?render(?:Bookings)?Table\s*\(\s*\);\s*\}/;
    
    if (initPageMatcher.test(content)) {
        content = content.replace(initPageMatcher, liveFetchLogic.trim());
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Patched: ${filePath}`);
    } else {
        console.log(`Could not find initPage() match in: ${filePath}`);
    }
}

// ---------------------------------------------
// Route patching
patchHtmlFile('completed-appointments.html', "query = query.eq('status', 'completed');");
patchHtmlFile('no-shows-cancellations.html', "query = query.in('status', ['noshow', 'cancelled']);");

console.log("Done patching subpages.");
