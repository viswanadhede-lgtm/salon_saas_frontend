$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co"
$key = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}
$prods = Invoke-RestMethod -Uri "$url/rest/v1/products?select=product_id,product_name,company_id,branch_id,category_id,status" -Headers $headers -Method Get
$prods | Format-Table

$cats = Invoke-RestMethod -Uri "$url/rest/v1/product_categories?select=category_id,category_name,company_id,branch_id,status" -Headers $headers -Method Get
$cats | Format-Table
