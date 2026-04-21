const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://qxmgyxjwpxkdbgldpdil.supabase.co";
const supabaseKey = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBranches() {
    const { data: branches, error } = await supabase
        .from('branches')
        .select('branch_id, branch_name');
    
    if (error) {
        console.error("Error fetching branches:", error);
    } else {
        console.log("Branches in DB:", branches);
    }
}

checkBranches();
