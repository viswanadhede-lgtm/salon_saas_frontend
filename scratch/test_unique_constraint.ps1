$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Prefer" = "resolution=merge-duplicates"
    "Content-Type" = "application/json"
}

try {
    # Send an empty or invalid row with on_conflict=sale_id to see if PostgreSQL recognises sale_id as a unique constraint
    $res = Invoke-RestMethod -Uri "$url/rest/v1/sales_for_business_transactions?on_conflict=sale_id" -Headers $headers -Method Post -Body '{"sale_id": "00000000-0000-0000-0000-000000000000"}'
    Write-Host "Success or: $res"
} catch {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $errBody = $reader.ReadToEnd()
    Write-Host "Error body: $errBody"
}
