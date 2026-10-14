$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}
$sample = (Invoke-RestMethod -Uri "$url/rest/v1/products?limit=1" -Headers $headers -Method Get)[0]
$companyId = $sample.company_id
$branchId  = $sample.branch_id

Write-Host "Active Tenant: company_id=$companyId, branch_id=$branchId"

Write-Host "`n=== TEST 1: fetchProducts query with tenant filters ==="
$prodResp = Invoke-RestMethod -Uri "$url/rest/v1/products?company_id=eq.$companyId&branch_id=eq.$branchId" -Headers $headers -Method Get
Write-Host "Products retrieved: $($prodResp.Count)"
$activeFiltered = $prodResp | Where-Object { if ($_.status) { $_.status.ToLower() -ne "deleted" } else { $true } }
Write-Host "Non-deleted products: $($activeFiltered.Count)"

Write-Host "`n=== TEST 2: fetchProductCategories query with tenant filters ==="
$catResp = Invoke-RestMethod -Uri "$url/rest/v1/product_categories?company_id=eq.$companyId&branch_id=eq.$branchId" -Headers $headers -Method Get
Write-Host "Categories retrieved: $($catResp.Count)"
$activeCats = $catResp | Where-Object { if ($_.status) { $_.status.ToLower() -ne "deleted" } else { $true } }
Write-Host "Non-deleted categories (tolerating NULL): $($activeCats.Count)"

Write-Host "`n=== TEST 3: sales-api.js fetchProductStock by product_id ==="
$testProdId = $prodResp[0].product_id
$stockResp = Invoke-RestMethod -Uri "$url/rest/v1/products?product_id=eq.$testProdId&select=stock_quantity" -Headers $headers -Method Get
Write-Host "fetchProductStock for $($testProdId) succeeded! Stock: $($stockResp[0].stock_quantity)"

Write-Host "`n=== TEST 4: Category product counts using category_id ==="
foreach ($c in $catResp) {
    $matched = $prodResp | Where-Object { [string]$_.category_id -eq [string]$c.category_id }
    Write-Host "Category '$($c.category_name)' (ID: $($c.category_id)) has $($matched.Count) products"
}
