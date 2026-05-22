import { supabase } from './lib/supabase.js';

async function testOnboarding() {
    console.log("Simulating Google User Onboarding Full Flow...");
    const user_id = "00000000-0000-0000-0000-000000000000";
    const data = {
        full_name: "Google Onboarding Test",
        email: "googleonboarding@example.com",
        phone: null,
        password_hash: null
    };
    
    // 1. Company
    console.log("Inserting Company...");
    const { data: compData, error: compErr } = await supabase.from('companies').insert({
        company_name: "Test Google Salon",
        owner_user_id: user_id,
        plan_id: "d0d4cc8f-3498-4da1-b5e5-2887b9b39dce", // valid uuid
        plan_name: "Basic",
        status: 'active',
        subscription_status: 'pending'
    });
    if (compErr) return console.error("Company Error:", compErr);
    const company_id = compData[0].company_id || compData[0].id;
    
    // 2. Branch
    console.log("Inserting Branch...");
    const { data: bData, error: bErr } = await supabase.from('branches').insert({
        company_id,
        branch_name: "Main Branch",
        branch_phone: "1234567890",
        branch_address: "123 Test St",
        branch_email: data.email,
        manager_user_id: user_id,
        status: 'active'
    });
    if (bErr) return console.error("Branch Error:", bErr);
    const branch_id = bData[0].branch_id || bData[0].id;
    
    // 3. Role
    console.log("Inserting Role...");
    const { data: roleData, error: rErr } = await supabase.from('roles').insert({
        company_id,
        branch_id,
        role_name: 'Owner',
        is_default: true,
        description: 'System Owner Role',
        status: 'active'
    });
    if (rErr) return console.error("Role Error:", rErr);
    const role_id = roleData[0].role_id || roleData[0].id;
    
    // 4. User
    console.log("Inserting User...");
    const { error: userErr } = await supabase.from('users').insert({
        user_id,
        company_id,
        branch_id,
        name: data.full_name,
        email: data.email,
        phone: data.phone || null,
        password_hash: data.password_hash || null,
        role_id,
        role_name: 'Owner',
        status: 'active'
    });
    if (userErr) return console.error("User Error:", userErr);
    
    // 5. Profile
    console.log("Inserting Profile...");
    const { error: profileErr } = await supabase.from('profiles').insert({
        user_id,
        company_id,
        branch_id,
        first_name: "Google",
        last_name: "Onboarding Test",
        phone: data.phone || null,
        email: data.email,
        role_id,
        role_name: 'Owner',
        joined_on: new Date().toISOString()
    });
    if (profileErr) return console.error("Profile Error:", profileErr);
    
    console.log("SUCCESS! The entire onboarding flow worked flawlessly.");
    
    // Cleanup
    await supabase.from('companies').delete().eq('owner_user_id', user_id);
    await supabase.from('users').delete().eq('user_id', user_id);
    await supabase.from('profiles').delete().eq('user_id', user_id);
}

testOnboarding();
