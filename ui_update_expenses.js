const fs = require('fs');
const filepath = 'c:\\Users\\viswa\\OneDrive\\Desktop\\salon-saas-frontend\\expenses.html';
let content = fs.readFileSync(filepath, 'utf8');

const injectedCSS = `
    <!-- Expenses Specific CSS -->
    <style>
        .data-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        .data-table th {
            font-size: 0.75rem;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 1rem 1.5rem;
            border-bottom: 2px solid #e2e8f0;
            background-color: #f8fafc;
            white-space: nowrap;
        }

        .data-table td {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
            color: #1e293b;
            font-size: 0.875rem;
        }

        .data-table tbody tr:hover {
            background-color: #f8fafc;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.25rem 0.625rem;
            border-radius: 1rem;
            font-size: 0.75rem;
            font-weight: 600;
            white-space: nowrap;
        }

        .filter-select {
            padding: 0 32px 0 36px !important;
            height: 42px !important;
            border-radius: 8px !important;
            font-size: 0.875rem !important;
            border: 1px solid #e2e8f0 !important;
            background-color: #fff !important;
            color: #334155 !important;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            appearance: none;
            background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
            background-repeat: no-repeat, repeat;
            background-position: right .7em top 50%, 0 0;
            background-size: .65em auto, 100%;
            min-width: 140px;
        }

        .expenses-actions-wrap {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .table-controls {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 1.5rem;
            background: #f8fafc;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
    </style>
</head>`;

if (!content.includes('<!-- Expenses Specific CSS -->')) {
    content = content.replace('</head>', injectedCSS);
}

// Ensure the dropdown has the custom class
content = content.replace('id="expensesDateRange" class="form-select" style="padding: 0 12px 0 36px; height: 40px; border-radius: 8px; font-size: 0.875rem; border: 1px solid #e2e8f0; background: #fff; cursor: pointer;"', 'id="expensesDateRange" class="filter-select"');


fs.writeFileSync(filepath, content);
console.log("Expenses UI updated successfully.");
