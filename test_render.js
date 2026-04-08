import { supabase } from './lib/supabase.js';

let users = [];
let availableBranches = [];
let availableRoles = [];
let currentUserId = null;
let editingId = null;

// Mock DOM
const ROLES = {
    Owner:        { bg: '#fef2f2', color: '#991b1b', dot: '#ef4444' },
    Admin:        { bg: '#eff6ff', color: '#1e40af', dot: '#3b82f6' },
    Manager:      { bg: '#fffbeb', color: '#92400e', dot: '#f59e0b' },
    Receptionist: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Staff:        { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
};

function initials(name) {
    if (!name) return 'U';
    return name.split(' ').slice(0, 2).map(w => w?.[0]).join('').toUpperCase();
}

function avatarColors(name) {
    if (!name) return { bg: '#f1f5f9', color: '#475569' };
    const palettes = [
        { bg: '#dbeafe', color: '#1e40af' },
        { bg: '#d1fae5', color: '#065f46' },
        { bg: '#fdf2f8', color: '#831843' },
        { bg: '#fef3c7', color: '#92400e' },
        { bg: '#ede9fe', color: '#4c1d95' },
    ];
    let hash = 0;
    for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return palettes[hash % palettes.length];
}

async function testRender() {
    const cid = "100af6d5-f3ea-4daf-95ef-1877322287a8";
    const { data: rData } = await supabase.from('roles').select('role_id, role_name').eq('company_id', cid);
    if (rData) availableRoles = rData;

    const { data: bData } = await supabase.from('branches').select('branch_id, branch_name').eq('company_id', cid).eq('status', 'active');
    if (bData) availableBranches = bData;

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('company_id', cid)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Supabase Error:", error);
        return;
    }
    users = data || [];
    
    // Simulate renderTable
    console.log("Users to render:", users.length);
    
    try {
        users.forEach((u, i) => {
            const isCurrentUser = String(u.user_id || u.id) === currentUserId;
            const roleObj = availableRoles.find(r => String(r.role_id) === String(u.role_id));
            const roleDisplay = roleObj ? roleObj.role_name : (u.role_name || 'Staff');
            const roleStyle = ROLES[roleDisplay] || ROLES['Staff'];

            let branchDisplay = 'Unknown Branch';
            if (!u.branch_id || String(u.branch_id) === 'all') {
                branchDisplay = 'All Branches';
            } else {
                const branchObj = availableBranches.find(b => String(b.branch_id) === String(u.branch_id));
                if (branchObj) branchDisplay = branchObj.branch_name;
            }

            const isActive  = u.status === 'active';
            const statusDisplay = isActive ? 'Active' : 'Inactive';
            const rowBg     = i % 2 === 0 ? '#fff' : '#fafafa';
            const av        = avatarColors(u.name);
            const isOwner   = roleDisplay.toLowerCase() === 'owner';
            const lastLoginText = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never';

            console.log(`Rendered: ${u.name}, Role: ${roleDisplay}, Branch: ${branchDisplay}`);
        });
        console.log("Render finished without errors.");
    } catch (e) {
        console.error("Render crashed:", e);
    }
}

testRender();
