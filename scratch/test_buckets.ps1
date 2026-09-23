$headers = @{
    "apikey" = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
    "Authorization" = "Bearer sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
}
try {
    $res = Invoke-RestMethod -Uri "https://qxmgyxjwpxkdbgldpdil.supabase.co/storage/v1/bucket" -Headers $headers -Method Get
    $res | ConvertTo-Json
} catch {
    Write-Output "Error: $($_.Exception.Message)"
}
