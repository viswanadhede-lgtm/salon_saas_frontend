async function fetchUsers() {
    const res = await fetch("https://qxmgyxjwpxkdbgldpdil.supabase.co/rest/v1/users?limit=1", {
        headers: {
            "apikey": "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0",
            "Authorization": "Bearer sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
        }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}

fetchUsers();
