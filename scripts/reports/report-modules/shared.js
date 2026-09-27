// scripts/reports/report-modules/shared.js
// ONLY genuinely shared utilities for report modules

export function formatCurrency(num) {
    if (isNaN(num)) return '₹0';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

export function updateKPIs(k1, k2, k3, k4 = null, k5 = null) {
    const lbl1 = document.getElementById('kpiLabel1'); const val1 = document.getElementById('kpiValue1');
    if (lbl1 && val1 && k1) { lbl1.textContent = k1.label; val1.textContent = k1.value; }

    const lbl2 = document.getElementById('kpiLabel2'); const val2 = document.getElementById('kpiValue2');
    if (lbl2 && val2 && k2) { lbl2.textContent = k2.label; val2.textContent = k2.value; }

    const lbl3 = document.getElementById('kpiLabel3'); const val3 = document.getElementById('kpiValue3');
    if (lbl3 && val3 && k3) { lbl3.textContent = k3.label; val3.textContent = k3.value; }

    const kpiRow = document.getElementById('kpiRow');
    const card4 = document.getElementById('kpiLabel4')?.closest('.kpi-card') || (kpiRow && kpiRow.children.length > 3 ? kpiRow.children[3] : null);
    const lbl4 = document.getElementById('kpiLabel4');
    const val4 = document.getElementById('kpiValue4');
    if (lbl4 && val4 && k4) {
        lbl4.textContent = k4.label; val4.textContent = k4.value;
        if (card4) card4.style.display = 'flex';
    } else if (card4) {
        card4.style.display = 'none';
    }

    const card5 = document.getElementById('kpiCard5');
    const lbl5 = document.getElementById('kpiLabel5');
    const val5 = document.getElementById('kpiValue5');
    let visibleCount = 3;
    if (k4) visibleCount = 4;
    if (k5) visibleCount = 5;

    if (k5 && card5 && lbl5 && val5 && kpiRow) {
        lbl5.textContent = k5.label;
        val5.textContent = k5.value;
        card5.style.display = 'flex';
    } else if (card5 && kpiRow) {
        card5.style.display = 'none';
    }

    if (kpiRow) {
        kpiRow.style.gridTemplateColumns = `repeat(${Math.max(1, visibleCount)}, 1fr)`;
    }
}

let trendChartInstance = null;
export function renderTrendChart(labels, values) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    if (trendChartInstance) trendChartInstance.destroy();
    const backgroundColors = values.map((_, i) => i === values.length - 1 ? '#d946ef' : '#e2e8f0');
    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: backgroundColors, borderRadius: 8, borderSkipped: false, barThickness: 32 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, titleFont: { size: 14, weight: 'bold' }, bodyFont: { size: 13 }, cornerRadius: 8, displayColors: false } },
            scales: {
                y: { beginAtZero: true, grid: { display: true, drawBorder: false, color: '#f1f5f9' }, ticks: { precision: 0, color: '#94a3b8', font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }
            }
        }
    });
}

let distributionChartInstance = null;
export function renderDistributionChart(labels, values) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    if (distributionChartInstance) distributionChartInstance.destroy();
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    distributionChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 4 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 13 },
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
    const legendContainer = document.getElementById('infographicLegend');
    if (legendContainer) {
        if (labels.length === 0 || values.every(v => v === 0)) {
            legendContainer.innerHTML = '<div style="color:#94a3b8; font-size:0.875rem;">No data to display</div>';
        } else {
            const total = values.reduce((a, b) => a + b, 0);
            legendContainer.innerHTML = labels.map((l, i) => {
                const val = values[i];
                const perc = total > 0 ? Math.round((val / total) * 100) : 0;
                return `
                    <div class="metric-item">
                        <span class="metric-dot" style="background-color: ${colors[i % colors.length]};"></span>
                        <div class="metric-label">
                            <span class="name">${l}</span>
                            <span class="perc">${perc}%</span>
                        </div>
                        <div class="metric-value">${formatCurrency(val)}</div>
                    </div>
                `;
            }).join('');
        }
    }
    if (values.length > 0 && !values.every(v => v === 0)) {
        const maxIdx = values.indexOf(Math.max(...values));
        const total = values.reduce((a, b) => a + b, 0);
        const perc = total > 0 ? Math.round((values[maxIdx] / total) * 100) : 0;
        const hmVal = document.getElementById('heroMetricValue');
        const hmLabel = document.getElementById('heroMetricLabel');
        if (hmVal) hmVal.textContent = perc + '%';
        if (hmLabel) hmLabel.textContent = 'Revenue from ' + labels[maxIdx];
    } else {
        const hmVal = document.getElementById('heroMetricValue');
        const hmLabel = document.getElementById('heroMetricLabel');
        if (hmVal) hmVal.textContent = '0%';
        if (hmLabel) hmLabel.textContent = 'No Data Available';
    }
}

export function updateTable(headers, rows, data = null) {
    const tableContainer = document.querySelector('.data-table-container');
    if (!tableContainer) return;
    const tableHeaderTitle = tableContainer.querySelector('.table-header h2');
    if (tableHeaderTitle && data?.tableTitle) tableHeaderTitle.textContent = data.tableTitle;
    const theadRow = document.querySelector('#tableHead tr');
    const tbody = document.getElementById('tableBody');
    if (theadRow && tbody) {
        theadRow.innerHTML = (headers || []).map(h => `<th>${h}</th>`).join('');
        if (rows && rows.length > 0) {
            tbody.innerHTML = rows.map(row => {
                if (row && typeof row === 'object' && row.rawHtml) {
                    return row.rawHtml;
                }
                if (Array.isArray(row)) {
                    return `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
                }
                return `<tr><td>${row}</td></tr>`;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="${(headers || []).length || 1}" style="text-align: center; padding: 2rem;">No data available for this report.</td></tr>`;
        }
    }
}
