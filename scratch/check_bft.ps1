$headers = @{
    "apikey" = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
    "Authorization" = "Bearer sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
}
$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co/rest/v1/bookings_for_business_transaction?booking_id=eq.f490cbb3-dbb8-412f-9fc5-629127645a16"
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
$res | ConvertTo-Json -Depth 5
