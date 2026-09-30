// scripts/memberships/memberships-ui.js - Page-level UI Glue for Memberships

// ── Search Logic ───────────────────────────────────────────────────────────
export function applySearch() {
    const searchInput = document.getElementById('membershipSearch');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase();
    const activeTab = document.querySelector('.nav-tab.active')?.getAttribute('data-tab') || 'plans';
    const tableContent = document.getElementById(`${activeTab}TableContent`);
    if (!tableContent) return;

    const tableBody = tableContent.querySelector('tbody');
    if (!tableBody) return;

    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
}

export function initMembershipsSearch() {
    const searchInput = document.getElementById('membershipSearch');
    if (searchInput) {
        searchInput.addEventListener('input', applySearch);
    }
}

// ── Tab Switching Logic ────────────────────────────────────────────────────
export function initMembershipsTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');
    const searchInput = document.getElementById('membershipSearch');

    const btnCreatePlan = document.getElementById('btnCreatePlan');
    const btnAssignPlan = document.getElementById('btnAssignPlan');
    const btnExportUsage = document.getElementById('btnExportUsage');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');

            // Update tab styles
            tabs.forEach(t => {
                t.classList.remove('active');
                t.style.fontWeight = '500';
                t.style.color = '#64748b';
                t.style.borderBottomColor = 'transparent';
            });
            tab.classList.add('active');
            tab.style.fontWeight = '600';
            tab.style.color = '#7c3aed';
            tab.style.borderBottomColor = '#7c3aed';

            // Update table visibility
            contents.forEach(content => {
                content.style.display = 'none';
            });
            const targetContent = document.getElementById(`${target}TableContent`);
            if (targetContent) targetContent.style.display = 'block';

            // Update Context-Aware Header Controls
            const filterPanel = document.getElementById('filterPanel');
            const filterGrid = document.getElementById('filterGrid');
            const filterColDuration = document.getElementById('filterColDuration');
            const filterColStatus = document.getElementById('filterColStatus');
            const applyFilterBtn = document.getElementById('applyFilter');

            if (target === 'plans') {
                if (searchInput) searchInput.placeholder = 'Search plans...';

                if (btnCreatePlan) btnCreatePlan.style.display = 'inline-flex';
                if (btnAssignPlan) btnAssignPlan.style.display = 'none';
                if (btnExportUsage) btnExportUsage.style.display = 'none';

                // Reset Filter UI
                if (filterPanel) filterPanel.style.width = '580px';
                if (filterGrid) filterGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
                if (filterColDuration) filterColDuration.style.display = 'block';
                if (filterColStatus) filterColStatus.style.display = 'block';
                if (applyFilterBtn) applyFilterBtn.innerText = 'Apply Filter';
            } else if (target === 'purchases') {
                if (searchInput) searchInput.placeholder = 'Search customers...';

                if (btnCreatePlan) btnCreatePlan.style.display = 'none';
                if (btnAssignPlan) btnAssignPlan.style.display = 'inline-flex';
                if (btnExportUsage) btnExportUsage.style.display = 'none';

                // Reset Filter UI
                if (filterPanel) filterPanel.style.width = '580px';
                if (filterGrid) filterGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
                if (filterColDuration) filterColDuration.style.display = 'block';
                if (filterColStatus) filterColStatus.style.display = 'block';
                if (applyFilterBtn) applyFilterBtn.innerText = 'Apply Filter';
            }

            // Re-apply search on tab switch
            applySearch();
        });
    });
}

// ── Assign Modal UI Controls ───────────────────────────────────────────────
export function initAssignModalControls() {
    const assignModal = document.getElementById('assignModalOverlay');
    const assignBtn = document.getElementById('btnAssignPlan');
    const closeAssign = document.getElementById('closeAssignModal');
    const cancelAssign = document.getElementById('btnCancelAssign');

    // Handle Primary Action Button (Assign)
    if (assignBtn && assignModal) {
        assignBtn.addEventListener('click', () => {
            const currentTab = document.querySelector('.nav-tab.active')?.getAttribute('data-tab');
            if (currentTab === 'purchases') {
                window.resetAssignMembershipForm?.();
                assignModal.classList.add('active');
                if (window.feather) feather.replace();
            }
        });
    }

    const closeModal = () => {
        if (assignModal) {
            assignModal.classList.remove('active');
            window.resetAssignMembershipForm?.();
        }
    };

    if (closeAssign) closeAssign.onclick = closeModal;
    if (cancelAssign) cancelAssign.onclick = closeModal;
    if (assignModal) {
        assignModal.addEventListener('click', (e) => {
            if (e.target === assignModal) {
                closeModal();
            }
        });
    }
}

// ── Filter Panel UI ────────────────────────────────────────────────────────
export function initFilterPanel() {
    const filterBtn = document.getElementById('btnFilter');
    const filterPanel = document.getElementById('filterPanel');
    const closeFilter = document.getElementById('closeFilter');
    const applyFilter = document.getElementById('applyFilter');
    const resetFilter = document.getElementById('resetFilter');

    if (filterBtn && filterPanel) {
        filterBtn.onclick = (e) => {
            const isHidden = filterPanel.style.display === 'none' || filterPanel.style.display === '';
            filterPanel.style.display = isHidden ? 'block' : 'none';
            e.stopPropagation();
        };

        if (closeFilter) {
            closeFilter.onclick = () => { filterPanel.style.display = 'none'; };
        }
        if (applyFilter) {
            applyFilter.onclick = () => { filterPanel.style.display = 'none'; };
        }
        if (resetFilter) {
            resetFilter.onclick = () => {
                filterPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
            };
        }

        // Close filter panel on outside click
        document.addEventListener('click', (e) => {
            if (!filterBtn.contains(e.target) && !filterPanel.contains(e.target)) {
                filterPanel.style.display = 'none';
            }
        });
    }
}

// ── Master UI Initialization ───────────────────────────────────────────────
export function initMembershipsUI() {
    if (window.feather) {
        feather.replace();
    }
    initMembershipsTabs();
    initMembershipsSearch();
    initAssignModalControls();
    initFilterPanel();
}

// ── DOM Readiness ──────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMembershipsUI);
} else {
    initMembershipsUI();
}
