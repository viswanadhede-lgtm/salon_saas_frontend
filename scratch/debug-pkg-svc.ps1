# Debug TEST 2: Check package_services insert behaviour
$SB_URL  = 'https://qxmgyxjwpxkdbgldpdil.supabase.co/rest/v1'
$SB_KEY  = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0'
$COMPANY = '5a6d86f8-0b0a-49c3-beec-4fb6b34d96c4'
$BRANCH  = '0a2d841f-7b32-4171-9f2d-c59938b0d3e4'

$headers = @{
    'apikey'        = $SB_KEY
    'Authorization' = "Bearer $SB_KEY"
    'Content-Type'  = 'application/json'
    'Prefer'        = 'return=representation'
}

# 1. Create a test package
Write-Host "Creating test package..."
$pkgBody = @{
    company_id     = $COMPANY
    branch_id      = $BRANCH
    package_name   = 'ZZ_DEBUG_PKG_SVC'
    description    = 'debug'
    original_price = 100.00
    final_price    = 80.00
    is_active      = $true
    status         = 'active'
    services_count = 0
} | ConvertTo-Json

$pkg = Invoke-RestMethod -Uri "$SB_URL/packages" -Headers $headers -Method Post -Body $pkgBody
$pkgId = $pkg.package_id
Write-Host "Package created: $pkgId"

# 2. Insert package_service
Write-Host "Inserting package_service..."
$psBody = @{
    package_id   = $pkgId
    service_id   = '00000000-0000-0000-0000-ffffffffffff'
    service_name = 'ZZ_DEBUG_SVC'
} | ConvertTo-Json

try {
    $psRes = Invoke-WebRequest -Uri "$SB_URL/package_services" -Headers $headers -Method Post -Body $psBody
    Write-Host "Insert status: $($psRes.StatusCode)"
    Write-Host "Insert body: $($psRes.Content)"
} catch {
    Write-Host "Insert FAILED: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host "Details: $($_.ErrorDetails.Message)" }
}

# 3. Query package_services
Write-Host "Querying package_services..."
$queryUri = $SB_URL + '/package_services?package_id=eq.' + $pkgId + '&select=*'
try {
    $qRes = Invoke-WebRequest -Uri $queryUri -Headers $headers -Method Get
    Write-Host "Query status: $($qRes.StatusCode)"
    Write-Host "Query body: $($qRes.Content)"
} catch {
    Write-Host "Query FAILED: $($_.Exception.Message)"
}

# 4. Cleanup
Write-Host "Cleaning up..."
try {
    $delUri = $SB_URL + '/package_services?package_id=eq.' + $pkgId
    Invoke-RestMethod -Uri $delUri -Headers $headers -Method Delete -ErrorAction SilentlyContinue | Out-Null
} catch {}
try {
    $delUri = $SB_URL + '/packages?package_id=eq.' + $pkgId
    Invoke-RestMethod -Uri $delUri -Headers $headers -Method Delete -ErrorAction SilentlyContinue | Out-Null
} catch {}
Write-Host "Done."
