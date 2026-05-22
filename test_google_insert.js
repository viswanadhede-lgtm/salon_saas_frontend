import { supabase } from './lib/supabase.js';

async function testInsert() {
    console.log("Attempting insert with null password...");
    const { data, error } = await supabase.from('users').insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        company_id: "15745d9e-60a2-462d-a722-9c11be01f648", // existing company
        branch_id: "8755dabb-4bf8-4ad8-a756-d182e9cdd71b", // existing branch
        name: "Google Test User",
        email: "googletest@example.com",
        phone: null,
        password_hash: null, // This is what Google users get
        role_id: "ce0037a1-00e4-4666-ae7c-700fa68ca16a", // existing role
        role_name: "Owner",
        status: "active"
    });
    
    if (error) {
        console.error("ERROR:");
        console.error(error);
    } else {
        console.log("SUCCESS:");
        console.log(data);
    }
}

testInsert();
