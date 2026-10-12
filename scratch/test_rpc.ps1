$headers = @{
    "apikey" = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
    "Authorization" = "Bearer sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0"
    "Content-Type" = "application/json"
}

$body = @{
    p_booking_id = "f490cbb3-dbb8-412f-9fc5-629127645a16"
    p_company_id = "5a6d86f8-0b0a-49c3-beec-4fb6b34d96c4"
    p_branch_id = "0a2d841f-7b32-4171-9f2d-c59938b0d3e4"
    p_booking_date = "2026-10-12"
    p_start_time = "17:49:00"
    p_notes = "test rpc"
    p_status = "booked"
    p_services = @(
        @{
            service_id = "461382a5-56e0-4c8b-abb6-c03bdc7e0c3b"
            service_name = "Nail"
            staff_id = "ce15eb72-414e-4820-aa9e-dec5c98857d8"
            staff_name = "viswanadh Updated"
            price = 222
        },
        @{
            service_id = "12ed485e-0937-4212-a1fa-a926526829a5"
            service_name = "Nail Trimming"
            staff_id = "ce15eb72-414e-4820-aa9e-dec5c98857d8"
            staff_name = "viswanadh Updated"
            price = 199
        }
    )
} | ConvertTo-Json -Depth 5

$url = "https://qxmgyxjwpxkdbgldpdil.supabase.co/rest/v1/rpc/update_booking_atomic"
try {
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Post -Body $body
    Write-Host "RPC SUCCESS:"
    $res | ConvertTo-Json
} catch {
    Write-Host "RPC ERROR:"
    $_.Exception.Response.GetResponseStream() | %{ (New-Object IO.StreamReader($_)).ReadToEnd() }
}
