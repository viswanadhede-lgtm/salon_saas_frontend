import { supabase } from './lib/supabase.js';

async function testRoles() {
    const cid = "100af6d5-f3ea-4daf-95ef-1877322287a8";
    const { data, error } = await supabase.from('roles').select('role_id, role_name').eq('company_id', cid);
    console.log("Roles data:", data);
    console.log("Roles error:", error);
}

testRoles();
