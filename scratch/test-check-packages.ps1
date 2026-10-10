$headers = @{
    'apikey' = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0'
    'Authorization' = 'Bearer sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0'
}

try {
    $response = Invoke-RestMethod -Uri 'https://qxmgyxjwpxkdbgldpdil.supabase.co/rest/v1/packages?select=package_id,package_name,is_active,status&limit=2' -Headers $headers -Method Get
    Write-Host "STATUS COLUMN CHECK: SUCCESS"
    $response | Format-Table
} catch {
    Write-Host "STATUS COLUMN CHECK: FAILED"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message
    }
}
