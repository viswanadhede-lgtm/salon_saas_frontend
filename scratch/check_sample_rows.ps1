$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

Write-Host "=== 1. Sample sales row ==="
$s = Invoke-RestMethod -Uri "$url/rest/v1/sales?limit=1" -Headers $headers -Method Get
$s | ConvertTo-Json

Write-Host "`n=== 2. Sample sales_for_business_transactions row ==="
$sfbt = Invoke-RestMethod -Uri "$url/rest/v1/sales_for_business_transactions?limit=1" -Headers $headers -Method Get
$sfbt | ConvertTo-Json

Write-Host "`n=== 3. Sample business_transactions row ==="
$bt = Invoke-RestMethod -Uri "$url/rest/v1/business_transactions?limit=1" -Headers $headers -Method Get
$bt | ConvertTo-Json
