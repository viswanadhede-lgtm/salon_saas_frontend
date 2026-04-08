import { supabase } from './lib/supabase.js';

async function testBranches() {
    const { data, error } = await supabase.from('branches').select('branch_id, branch_name').limit(1);
    console.log("Branches error:", error);
}

testBranches();
