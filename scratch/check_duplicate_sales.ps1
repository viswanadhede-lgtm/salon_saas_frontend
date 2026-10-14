$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

$rows = Invoke-RestMethod -Uri "$url/rest/v1/sales_for_business_transactions?select=sale_id" -Headers $headers -Method Get
Write-Host "Total rows in sales_for_business_transactions: $($rows.Count)"
$groups = $rows | Group-Object -Property sale_id | Where-Object { $_.Count -gt 1 }
Write-Host "Duplicate sale_id groups: $($groups.Count)"
if ($groups.Count -gt 0) {
    $groups | Select-Object -Property Name, Count
}
