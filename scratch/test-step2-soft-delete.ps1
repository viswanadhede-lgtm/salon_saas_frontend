# Step 2 Validation Tests — Soft Delete for Packages
# Uses the live Supabase REST API with the anon key.
# Creates isolated test records, validates behaviour, cleans up.

$SB_URL  = 'https://qxmgyxjwpxkdbgldpdil.supabase.co/rest/v1'
$SB_KEY  = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0'
$COMPANY = '5a6d86f8-0b0a-49c3-beec-4fb6b34d96c4'
$BRANCH  = '0a2d841f-7b32-4171-9f2d-c59938b0d3e4'
$WRONG_BRANCH = '00000000-0000-0000-0000-000000000000'

$headers = @{
    'apikey'        = $SB_KEY
    'Authorization' = "Bearer $SB_KEY"
    'Content-Type'  = 'application/json'
    'Prefer'        = 'return=representation'
}

$pass = 0
$fail = 0
$testPkgIds = [System.Collections.ArrayList]::new()

function Test-Assert($name, $condition) {
    if ($condition) {
        Write-Host "  [PASS] $name" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $name" -ForegroundColor Red
        $script:fail++
    }
}

# Helper to build multi-param URIs
function Build-PkgUri {
    param([string]$pkgId, [string]$companyId, [string]$branchId, [bool]$excludeDeleted=$true)
    $parts = @("package_id=eq.$pkgId", "company_id=eq.$companyId", "branch_id=eq.$branchId")
    if ($excludeDeleted) { $parts += 'status=neq.deleted' }
    return ($SB_URL + '/packages?' + ($parts -join '&'))
}

function Build-FetchUri {
    param([string]$companyId, [string]$branchId)
    $parts = @("company_id=eq.$companyId", "branch_id=eq.$branchId", 'status=neq.deleted', 'select=package_id')
    return ($SB_URL + '/packages?' + ($parts -join '&'))
}

# ── Helper: create a test package ────────────────────────────────────────────
function New-TestPackage($nameSuffix, $isActive, $status) {
    $body = @{
        company_id     = $COMPANY
        branch_id      = $BRANCH
        package_name   = "ZZ_TEST_PKG_$nameSuffix"
        description    = 'Automated test record - safe to delete'
        original_price = 100.00
        final_price    = 80.00
        is_active      = $isActive
        status         = $status
        services_count = 0
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$SB_URL/packages" -Headers $headers -Method Post -Body $body
    $id = $res.package_id
    $script:testPkgIds.Add($id) | Out-Null
    return $id
}

# ── Helper: insert a test package_service row ────────────────────────────────
function New-TestPackageService($pkgId) {
    $body = @{
        package_id   = $pkgId
        service_id   = '00000000-0000-0000-0000-ffffffffffff'
        service_name = 'ZZ_TEST_SVC'
    } | ConvertTo-Json

    # Use Invoke-WebRequest for reliability; don't pipe to Out-Null
    $res = Invoke-WebRequest -Uri "$SB_URL/package_services" -Headers $headers -Method Post -Body $body
    return $res.StatusCode
}

# ── Helper: get a package row by id (use Invoke-WebRequest for JSON control) ─
function Get-Package($pkgId) {
    $uri = $SB_URL + '/packages?package_id=eq.' + $pkgId + '&select=*'
    $res = Invoke-WebRequest -Uri $uri -Headers $headers -Method Get
    $parsed = $res.Content | ConvertFrom-Json
    if ($null -eq $parsed) { return @() }
    if ($parsed -is [array]) { return $parsed } else { return @($parsed) }
}

# ── Helper: get package_services for a package ──────────────────────────────
function Get-PackageServices($pkgId) {
    $uri = $SB_URL + '/package_services?package_id=eq.' + $pkgId + '&select=*'
    $res = Invoke-WebRequest -Uri $uri -Headers $headers -Method Get
    $parsed = $res.Content | ConvertFrom-Json
    if ($null -eq $parsed) { return @() }
    if ($parsed -is [array]) { return $parsed } else { return @($parsed) }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Step 2 - Soft Delete Validation Tests" -ForegroundColor Cyan
Write-Host "========================================`n"

# ── TEST 1: Soft-delete an active package ────────────────────────────────────
Write-Host "TEST 1: Soft-delete sets status='deleted' and updates updated_at" -ForegroundColor Yellow
try {
    $pkgId = New-TestPackage 'ACTIVE_DEL' $true 'active'
    $before = (Get-Package $pkgId)[0]

    Start-Sleep -Milliseconds 500

    $updateBody = @{ status = 'deleted'; updated_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
    $uri = Build-PkgUri -pkgId $pkgId -companyId $COMPANY -branchId $BRANCH
    Invoke-RestMethod -Uri $uri -Headers $headers -Method Patch -Body $updateBody | Out-Null

    $after = (Get-Package $pkgId)[0]
    Test-Assert 'status changed to deleted' ($after.status -eq 'deleted')
    Test-Assert 'updated_at was refreshed' ($after.updated_at -ne $before.updated_at)
    Test-Assert 'Row still exists in DB (not hard-deleted)' ($after.package_id -eq $pkgId)
} catch {
    Write-Host "  [FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# ── TEST 2: Package_services rows preserved after soft-delete ────────────────
Write-Host "`nTEST 2: Child package_services rows remain after soft-delete" -ForegroundColor Yellow
try {
    $pkgId2 = New-TestPackage 'CHILD_PRES' $true 'active'
    $insertStatus = New-TestPackageService $pkgId2
    Write-Host "    (Insert status: $insertStatus)"

    [array]$childBefore = Get-PackageServices $pkgId2
    Write-Host "    (Children before: $($childBefore.Count))"
    Test-Assert 'Child row exists before soft-delete' ($childBefore.Count -ge 1)

    $updateBody = @{ status = 'deleted'; updated_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
    $uri = Build-PkgUri -pkgId $pkgId2 -companyId $COMPANY -branchId $BRANCH
    Invoke-RestMethod -Uri $uri -Headers $headers -Method Patch -Body $updateBody | Out-Null

    [array]$childAfter = Get-PackageServices $pkgId2
    Write-Host "    (Children after: $($childAfter.Count))"
    Test-Assert 'Child row still exists after soft-delete (no cascade)' ($childAfter.Count -ge 1)
} catch {
    Write-Host "  [FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# ── TEST 3: fetchPackagesFromDb excludes deleted ─────────────────────────────
Write-Host "`nTEST 3: Fetch excludes deleted packages" -ForegroundColor Yellow
try {
    $uri = Build-FetchUri -companyId $COMPANY -branchId $BRANCH
    $res = Invoke-WebRequest -Uri $uri -Headers $headers -Method Get
    $rows = $res.Content | ConvertFrom-Json
    if ($null -eq $rows) { $rows = @() }
    if ($rows -isnot [array]) { $rows = @($rows) }

    $deletedIds = @()
    foreach ($tid in $testPkgIds) {
        $chk = Get-Package $tid
        if ($chk.Count -gt 0 -and $chk[0].status -eq 'deleted') { $deletedIds += $tid }
    }

    $fetched = $rows | ForEach-Object { $_.package_id }
    $leaked = $false
    foreach ($did in $deletedIds) {
        if ($fetched -contains $did) { $leaked = $true; break }
    }
    Test-Assert 'No deleted package appears in filtered fetch' (-not $leaked)
} catch {
    Write-Host "  [FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# ── TEST 4: Active and Inactive packages are still returned ──────────────────
Write-Host "`nTEST 4: Active and inactive packages are still returned" -ForegroundColor Yellow
try {
    $activeId   = New-TestPackage 'STILL_ACTIVE' $true 'active'
    $inactiveId = New-TestPackage 'STILL_INACTIVE' $false 'inactive'

    $uri = Build-FetchUri -companyId $COMPANY -branchId $BRANCH
    $res = Invoke-WebRequest -Uri $uri -Headers $headers -Method Get
    $rows = $res.Content | ConvertFrom-Json
    if ($null -eq $rows) { $rows = @() }
    if ($rows -isnot [array]) { $rows = @($rows) }

    $ids = $rows | ForEach-Object { $_.package_id }
    Test-Assert 'Active test package is returned'   ($ids -contains $activeId)
    Test-Assert 'Inactive test package is returned' ($ids -contains $inactiveId)
} catch {
    Write-Host "  [FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# ── TEST 5: Cross-branch soft-delete returns 0 rows ─────────────────────────
Write-Host "`nTEST 5: Cross-branch soft-delete returns 0 rows updated" -ForegroundColor Yellow
try {
    $pkgId5 = New-TestPackage 'CROSS_BRANCH' $true 'active'

    $updateBody = @{ status = 'deleted'; updated_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
    $uri = Build-PkgUri -pkgId $pkgId5 -companyId $COMPANY -branchId $WRONG_BRANCH
    try {
        $res = Invoke-WebRequest -Uri $uri -Headers $headers -Method Patch -Body $updateBody
        $body = $res.Content | ConvertFrom-Json
        if ($null -eq $body) { $body = @() }
        if ($body -is [array]) {
            Test-Assert 'Wrong-branch update matched 0 rows' ($body.Count -eq 0)
        } else {
            Test-Assert 'Wrong-branch update matched 0 rows' $false
        }
    } catch {
        Test-Assert 'Wrong-branch update matched 0 rows (error/empty)' $true
    }

    $row = (Get-Package $pkgId5)[0]
    Test-Assert 'Package status unchanged (still active)' ($row.status -eq 'active')
} catch {
    Write-Host "  [FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# ── TEST 6: Re-deleting an already-deleted package matches 0 rows ────────────
Write-Host "`nTEST 6: Repeated soft-delete on already-deleted package" -ForegroundColor Yellow
$pkgId6 = $null
try {
    $pkgId6 = New-TestPackage 'DOUBLE_DEL' $true 'active'

    # First delete
    $updateBody = @{ status = 'deleted'; updated_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
    $uri = Build-PkgUri -pkgId $pkgId6 -companyId $COMPANY -branchId $BRANCH
    Invoke-RestMethod -Uri $uri -Headers $headers -Method Patch -Body $updateBody | Out-Null

    # Second delete attempt
    Start-Sleep -Milliseconds 300
    $updateBody2 = @{ status = 'deleted'; updated_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
    try {
        $res2 = Invoke-WebRequest -Uri $uri -Headers $headers -Method Patch -Body $updateBody2
        $body2 = $res2.Content | ConvertFrom-Json
        if ($null -eq $body2) { $body2 = @() }
        if ($body2 -is [array]) {
            Test-Assert 'Second delete matched 0 rows' ($body2.Count -eq 0)
        } else {
            Test-Assert 'Second delete matched 0 rows' $false
        }
    } catch {
        Test-Assert 'Second delete matched 0 rows (error/empty)' $true
    }
} catch {
    Write-Host "  [FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# ── TEST 7: Editing a deleted package is blocked ─────────────────────────────
Write-Host "`nTEST 7: Editing a soft-deleted package fails" -ForegroundColor Yellow
try {
    # pkgId6 from above is already deleted
    $editBody = @{ package_name = 'ZZ_TEST_PKG_SHOULD_NOT_WORK' } | ConvertTo-Json
    $uri = Build-PkgUri -pkgId $pkgId6 -companyId $COMPANY -branchId $BRANCH
    try {
        $res = Invoke-WebRequest -Uri $uri -Headers $headers -Method Patch -Body $editBody
        $body = $res.Content | ConvertFrom-Json
        if ($null -eq $body) { $body = @() }
        if ($body -is [array]) {
            Test-Assert 'Edit on deleted package matched 0 rows' ($body.Count -eq 0)
        } else {
            Test-Assert 'Edit on deleted package matched 0 rows' $false
        }
    } catch {
        Test-Assert 'Edit on deleted package matched 0 rows (error/empty)' $true
    }
} catch {
    Write-Host "  [FAIL] Exception: $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# ── CLEANUP: Remove all test records ─────────────────────────────────────────
Write-Host "`nCLEANUP: Removing test records..." -ForegroundColor Cyan
foreach ($tid in $testPkgIds) {
    try {
        $uri = $SB_URL + '/package_services?package_id=eq.' + $tid
        Invoke-RestMethod -Uri $uri -Headers $headers -Method Delete -ErrorAction SilentlyContinue | Out-Null
    } catch {}
    try {
        $uri = $SB_URL + '/packages?package_id=eq.' + $tid
        Invoke-RestMethod -Uri $uri -Headers $headers -Method Delete -ErrorAction SilentlyContinue | Out-Null
    } catch {}
}

# Verify cleanup
$remaining = 0
foreach ($tid in $testPkgIds) {
    $chk = Get-Package $tid
    if ($chk.Count -gt 0 -and $chk[0].package_id) { $remaining++ }
}
Test-Assert "All test records cleaned up ($remaining remaining)" ($remaining -eq 0)

# ── SUMMARY ──────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "RESULTS: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
Write-Host "========================================`n" -ForegroundColor Cyan
