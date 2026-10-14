$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

# Check if business_transactions has duplicate reference_id
$btRows = Invoke-RestMethod -Uri "$url/rest/v1/business_transactions?select=reference_id,reference_type" -Headers $headers -Method Get
$btGroups = $btRows | Where-Object { $_.reference_type -eq 'pos' } | Group-Object -Property reference_id | Where-Object { $_.Count -gt 1 }
Write-Host "Duplicate POS reference_id in business_transactions: $($btGroups.Count)"
