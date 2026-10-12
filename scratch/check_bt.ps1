$headers = @{
    "apikey" = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
    "Authorization" = "Bearer sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
}
$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co/rest/v1/business_transactions?select=*&order=created_at.desc&limit=3"
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
$res | ConvertTo-Json -Depth 5
