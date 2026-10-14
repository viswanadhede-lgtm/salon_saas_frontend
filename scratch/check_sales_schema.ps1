$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

Write-Host "=== Inspecting sales table schema via OpenAPI ==="
try {
    $openapi = Invoke-RestMethod -Uri "$url/rest/v1/?apikey=$key" -Headers $headers -Method Get
    Write-Host "OpenAPI definitions found: $($openapi.definitions.Keys -join ', ')"
    
    Write-Host "`n--- sales table definition ---"
    $openapi.definitions.sales.properties | ConvertTo-Json -Depth 2

    Write-Host "`n--- sales_for_business_transactions definition ---"
    $openapi.definitions.sales_for_business_transactions.properties | ConvertTo-Json -Depth 2

    Write-Host "`n--- business_transactions definition ---"
    $openapi.definitions.business_transactions.properties | ConvertTo-Json -Depth 2
} catch {
    Write-Host "Error fetching OpenAPI: $_"
}
