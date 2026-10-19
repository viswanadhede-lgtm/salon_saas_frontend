$filePath = "scripts/reports/report-builder.js"
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

# Replace the bk- completed, cancelled, no-shows, and add refunded
$startIdx = $content.IndexOf("    'bk-completed': {")
$endIdx = $content.IndexOf("    // ─────────────────────────────────────────────`r`n    // CUSTOMERS SUB-REPORTS")
if ($endIdx -eq -1) {
    $endIdx = $content.IndexOf("    // ─────────────────────────────────────────────`n    // CUSTOMERS SUB-REPORTS")
}
if ($endIdx -eq -1) {
    $endIdx = $content.IndexOf("    'cust-metrics': {")
}

$newBkBlock = @"
    'bk-completed': {
        title: 'Completed Bookings & Revenue',
        subtitle: 'Completed appointments, realized revenue, and service performance',
        icon: 'check-circle',
        backCat: 'bookings',
        kpi1: { label: 'Completed Bookings', value: '1,120' },
        kpi2: { label: 'Completion Rate', value: '88.5%' },
        kpi3: { label: 'Completed Bookings Revenue', value: '₹2,45,800' },
        kpi4: { label: 'Average Revenue per Booking', value: '₹1,240' },
        tableTitle: 'Completed Booking Records',
        headers: ['Booking ID', 'Date & Time', 'Customer Name', 'Services Delivered', 'Staff Assigned', 'Bill Amount', 'Payment Status'],
        rows: [
            ['BK-1082', '2026-10-19 10:30 AM', 'Anita Sharma', 'Haircut & Blowdry', 'Sarah M.', '₹1,200', '<span class="status-pill completed">Paid</span>'],
            ['BK-1081', '2026-10-19 11:15 AM', 'Rajesh Patel', 'Beard Trim & Facial', 'Michael K.', '₹1,450', '<span class="status-pill completed">Paid</span>'],
            ['BK-1079', '2026-10-19 12:00 PM', 'Sneha Reddy', 'Hair Spa & Styling', 'Priya S.', '₹2,200', '<span class="status-pill completed">Paid</span>'],
            ['BK-1076', '2026-10-18 03:00 PM', 'Vikram Varma', 'Men Styling & Wash', 'Michael K.', '₹950', '<span class="status-pill completed">Paid</span>'],
            ['BK-1070', '2026-10-18 04:30 PM', 'Meera Rao', 'Global Hair Color', 'Sarah M.', '₹4,500', '<span class="status-pill completed">Paid</span>']
        ]
    },
    'bk-cancelled': {
        title: 'Cancelled Bookings',
        subtitle: 'Cancellation count, reasons, and estimated revenue loss',
        icon: 'x-circle',
        backCat: 'bookings',
        kpi1: { label: 'Cancelled Bookings', value: '64' },
        kpi2: { label: 'Cancellation Rate', value: '5.1%' },
        kpi3: { label: 'Estimated Value Affected', value: '₹38,200' },
        kpi4: { label: 'Same-Day Cancellations', value: '28 (43.8%)' },
        tableTitle: 'Detailed Cancelled Bookings',
        headers: ['Booking ID', 'Scheduled Date & Time', 'Customer Name', 'Services Cancelled', 'Staff Assigned', 'Estimated Value', 'Cancellation Reason'],
        rows: [
            ['BK-1075', '2026-10-19 02:00 PM', 'Vikram Rao', 'Premium Haircut', 'Sarah M.', '₹850', 'Customer Emergency'],
            ['BK-1072', '2026-10-19 03:30 PM', 'Pooja Verma', 'Bridal Consultation', 'Priya S.', '₹2,500', 'Rescheduled to next week'],
            ['BK-1068', '2026-10-18 05:00 PM', 'Arun Kumar', 'Hair Color & Wash', 'Michael K.', '₹3,200', 'Personal reasons'],
            ['BK-1059', '2026-10-17 11:30 AM', 'Divya Nair', 'Keratin Treatment', 'Sarah M.', '₹5,500', 'Running late, cancelled'],
            ['BK-1051', '2026-10-16 01:00 PM', 'Rohan Gupta', 'Beard & Haircut', 'Michael K.', '₹750', 'No reason given']
        ]
    },
    'bk-no-shows': {
        title: 'No-Show Bookings',
        subtitle: 'Missed appointments, repeat no-shows, and estimated loss',
        icon: 'user-x',
        backCat: 'bookings',
        kpi1: { label: 'No-Show Bookings', value: '128' },
        kpi2: { label: 'Estimated Value Missed', value: '₹64,000' },
        kpi3: { label: 'No-Show Rate', value: '8.5%' },
        kpi4: { label: 'Repeat No-Show Customers', value: '24' },
        tableTitle: 'Detailed No-Show Records',
        headers: ['Booking ID', 'Appointment Date & Time', 'Customer Name', 'Phone', 'Services Missed', 'Staff Assigned', 'Missed Value'],
        rows: [
            ['BK-1065', '2026-10-19 11:00 AM', 'Karthik S.', '+91 98450 12345', 'Hair Spa', 'Sarah M.', '₹1,500'],
            ['BK-1061', '2026-10-19 01:30 PM', 'Divya M.', '+91 99801 87654', 'Keratin Express', 'Priya S.', '₹4,500'],
            ['BK-1054', '2026-10-18 04:00 PM', 'Naveen G.', '+91 97412 55432', 'Men Beard & Haircut', 'Michael K.', '₹900'],
            ['BK-1048', '2026-10-17 06:00 PM', 'Ananya K.', '+91 98860 33211', 'Facial & Cleanup', 'Priya S.', '₹2,200'],
            ['BK-1042', '2026-10-16 02:00 PM', 'Suresh B.', '+91 94480 99887', 'Hair Color', 'Sarah M.', '₹3,000']
        ]
    },
    'bk-refunded': {
        title: 'Refunded Bookings',
        subtitle: 'Refunded appointments, amounts, and refund status',
        icon: 'rotate-ccw',
        backCat: 'bookings',
        kpi1: { label: 'Refunded Bookings', value: '86' },
        kpi2: { label: 'Total Refunded', value: '₹42,500' },
        kpi3: { label: 'Average Refund', value: '₹494' },
        kpi4: { label: 'Refund Rate', value: '5.7%' },
        tableTitle: 'Detailed Refunded Bookings',
        headers: ['Refund Ref', 'Refund Date', 'Original Booking ID', 'Customer Name', 'Payment Method', 'Refund Amount', 'Reason / Notes'],
        rows: [
            ['REF-501', '2026-10-19', 'BK-1049', 'Ritu Jain', 'UPI', '₹1,800', 'Customer cancellation'],
            ['REF-498', '2026-10-18', 'BK-1041', 'Deepak Mehta', 'Card', '₹1,200', 'Service unavailable'],
            ['REF-495', '2026-10-18', 'BK-1033', 'Sunita Rao', 'Cash', '₹650', 'Booking error'],
            ['REF-490', '2026-10-17', 'BK-1025', 'Harish Nair', 'UPI', '₹2,500', 'Customer cancellation'],
            ['REF-484', '2026-10-16', 'BK-1018', 'Pranitha K.', 'Card', '₹3,400', 'Service unsatisfactory']
        ]
    },
"@

if ($startIdx -ge 0 -and $endIdx -gt $startIdx) {
    $before = $content.Substring(0, $startIdx)
    $after = $content.Substring($endIdx)
    $content = $before + $newBkBlock + "`r`n`r`n" + $after
}

# Update TYPE_MODULE_MAP
if (-not $content.Contains("'bk-refunded':")) {
    $content = $content.Replace(
        "'bk-no-shows': './report-modules/bookings.js',",
        "'bk-no-shows': './report-modules/bookings.js',`r`n    'bk-refunded': './report-modules/bookings.js',"
    )
}

[System.IO.File]::WriteAllText($filePath, $content, [System.Text.Encoding]::UTF8)
Write-Output "Successfully updated report-builder.js"
