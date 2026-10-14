$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

$p = (Invoke-RestMethod -Uri "$url/rest/v1/products?limit=1" -Headers $headers -Method Get)[0]
Write-Host "=== Columns in public.products ==="
$p.PSObject.Properties | Select-Object Name, Value | Format-Table -AutoSize
