$lines = Get-Content 'reports.html' -Encoding UTF8
$start = 269  # 1-based line number where main content starts
$end = 399    # 1-based line number of closing </div>

# Build the new content block (lines before + new content + lines after)
$before = $lines[0..($start - 2)]  # lines 1..(start-1), 0-indexed: 0..(start-2)
$after  = $lines[$end..($lines.Count - 1)]  # lines (end+1)..end, 0-indexed

$newBlock = @'
        <main class="content-area">
            <div class="content-header">
                <div class="header-title">
                    <h1>Report Library</h1>
                    <p class="subtitle">Choose a report category to dive into detailed analytics</p>
                </div>
            </div>

            <div class="category-grid">

                <!-- 1. Financial -->
                <a href="report-category.html?cat=financial" class="category-card" data-feature="basic_reports"
                   style="--cat-color-a:#3b82f6; --cat-color-b:#6366f1;">
                    <div class="category-card-top">
                        <div class="category-icon-wrap bg-blue">
                            <i data-feather="dollar-sign"></i>
                        </div>
                        <span class="category-count-badge">6 reports</span>
                    </div>
                    <div class="category-card-body">
                        <h3>Financial</h3>
                        <p>Revenue, payments, refunds, pending dues, discounts &amp; expenses</p>
                        <div class="category-sub-pills">
                            <span class="sub-pill">Revenue</span>
                            <span class="sub-pill">Payments</span>
                            <span class="sub-pill">Refunds</span>
                            <span class="sub-pill">Pending Dues</span>
                            <span class="sub-pill">Discounts</span>
                            <span class="sub-pill">Expenses</span>
                        </div>
                    </div>
                    <div class="category-card-footer">
                        <span>View Reports <i data-feather="arrow-right" style="width:14px;height:14px;"></i></span>
                    </div>
                </a>

                <!-- 2. Sales & Services -->
                <a href="report-category.html?cat=sales" class="category-card" data-feature="basic_reports"
                   style="--cat-color-a:#10b981; --cat-color-b:#059669;">
                    <div class="category-card-top">
                        <div class="category-icon-wrap bg-emerald">
                            <i data-feather="shopping-bag"></i>
                        </div>
                        <span class="category-count-badge">5 reports</span>
                    </div>
                    <div class="category-card-body">
                        <h3>Sales &amp; Services</h3>
                        <p>Total sales, service revenue, product sales, top services &amp; products</p>
                        <div class="category-sub-pills">
                            <span class="sub-pill">Total Sales</span>
                            <span class="sub-pill">Service Revenue</span>
                            <span class="sub-pill">Product Sales</span>
                            <span class="sub-pill">Top Services</span>
                            <span class="sub-pill">Top Products</span>
                        </div>
                    </div>
                    <div class="category-card-footer">
                        <span>View Reports <i data-feather="arrow-right" style="width:14px;height:14px;"></i></span>
                    </div>
                </a>

                <!-- 3. Bookings -->
                <a href="report-category.html?cat=bookings" class="category-card" data-feature="basic_reports"
                   style="--cat-color-a:#6366f1; --cat-color-b:#8b5cf6;">
                    <div class="category-card-top">
                        <div class="category-icon-wrap bg-indigo">
                            <i data-feather="calendar"></i>
                        </div>
                        <span class="category-count-badge">4 reports</span>
                    </div>
                    <div class="category-card-body">
                        <h3>Bookings</h3>
                        <p>Total appointments, completed, cancelled and no-show analysis</p>
                        <div class="category-sub-pills">
                            <span class="sub-pill">Total Appointments</span>
                            <span class="sub-pill">Completed</span>
                            <span class="sub-pill">Cancelled</span>
                            <span class="sub-pill">No-Shows</span>
                        </div>
                    </div>
                    <div class="category-card-footer">
                        <span>View Reports <i data-feather="arrow-right" style="width:14px;height:14px;"></i></span>
                    </div>
                </a>

                <!-- 4. Customers -->
                <a href="report-category.html?cat=customers" class="category-card" data-feature="basic_reports"
                   style="--cat-color-a:#8b5cf6; --cat-color-b:#a855f7;">
                    <div class="category-card-top">
                        <div class="category-icon-wrap bg-violet">
                            <i data-feather="users"></i>
                        </div>
                        <span class="category-count-badge">2 reports</span>
                    </div>
                    <div class="category-card-body">
                        <h3>Customers</h3>
                        <p>New vs returning customers, acquisition trends and retention</p>
                        <div class="category-sub-pills">
                            <span class="sub-pill">New Customers</span>
                            <span class="sub-pill">Returning Customers</span>
                        </div>
                    </div>
                    <div class="category-card-footer">
                        <span>View Reports <i data-feather="arrow-right" style="width:14px;height:14px;"></i></span>
                    </div>
                </a>

                <!-- 5. Operations -->
                <a href="report-category.html?cat=operations" class="category-card" data-feature="advanced_reports"
                   style="--cat-color-a:#f43f5e; --cat-color-b:#e11d48;">
                    <div class="category-card-top">
                        <div class="category-icon-wrap bg-rose">
                            <i data-feather="activity"></i>
                        </div>
                        <span class="category-count-badge">2 reports</span>
                    </div>
                    <div class="category-card-body">
                        <h3>Operations</h3>
                        <p>Staff performance, branch comparison and operational efficiency</p>
                        <div class="category-sub-pills">
                            <span class="sub-pill">Staff Performance</span>
                            <span class="sub-pill">Branch Performance</span>
                        </div>
                    </div>
                    <div class="category-card-footer">
                        <span>View Reports <i data-feather="arrow-right" style="width:14px;height:14px;"></i></span>
                    </div>
                </a>

            </div>
        </main>
    </div>
'@

$combined = ($before + $newBlock.Split("`n") + $after) -join "`n"
[System.IO.File]::WriteAllText((Resolve-Path 'reports.html').Path, $combined, [System.Text.Encoding]::UTF8)
Write-Host "Done. Lines now: $(((Get-Content 'reports.html').Count))"
