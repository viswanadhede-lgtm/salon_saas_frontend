import { supabase } from './lib/supabase.js';

async function testProfileInsert() {
    console.log("Checking if phone is still required in profiles table...");
    
    // Attempt to insert a dummy profile with phone = null
    const { data, error } = await supabase.from('profiles').insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        company_id: "15745d9e-60a2-462d-a722-9c11be01f648", // valid company
        branch_id: "8755dabb-4bf8-4ad8-a756-d182e9cdd71b", // valid branch
        first_name: "Constraint",
        last_name: "Test",
        phone: null,
        email: "constraint@example.com",
        role_id: "ce0037a1-00e4-4666-ae7c-700fa68ca16a",
        role_name: "Owner",
        joined_on: new Date().toISOString()
    });
    
    if (error) {
        console.error("ERROR from database:");
        console.error(error);
    } else {
        console.log("SUCCESS! The database accepted phone = null.");
        // Cleanup
        await supabase.from('profiles').delete().eq('user_id', "00000000-0000-0000-0000-000000000000");
    }
}

testProfileInsert();
