/* ======= Report Dropdown ======= */

let _reportDropdownOpen = false;

function toggleReportDropdown(e) {
    if (e && e.stopPropagation) {
        e.stopPropagation();
    }

    _reportDropdownOpen
        ? closeReportDropdown()
        : openReportDropdown();
}

function openReportDropdown() {
    const panel = document.getElementById('reportDropdownPanel');
    const chevron = document.getElementById('reportDropdownChevron');

    if (!panel || !chevron) return;

    panel.style.display = 'block';

    requestAnimationFrame(() => {
        panel.style.opacity = '1';
        panel.style.transform = 'translateY(0)';
    });

    chevron.style.transform = 'rotate(180deg)';
    _reportDropdownOpen = true;
}

function closeReportDropdown() {
    const panel = document.getElementById('reportDropdownPanel');
    const chevron = document.getElementById('reportDropdownChevron');

    if (!panel || !chevron) return;

    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-4px)';
    chevron.style.transform = 'rotate(0deg)';

    setTimeout(() => {
        panel.style.display = 'none';
    }, 180);

    _reportDropdownOpen = false;
}

function handleReportIssueClick() {
    closeReportDropdown();

    if (typeof window.openReportIssueModal === 'function') {
        window.openReportIssueModal();
    }
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('reportDropdownWrap');

    if (
        _reportDropdownOpen &&
        wrap &&
        !wrap.contains(e.target)
    ) {
        closeReportDropdown();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && _reportDropdownOpen) {
        closeReportDropdown();
    }
});

window.toggleReportDropdown = toggleReportDropdown;
window.openReportDropdown = openReportDropdown;
window.closeReportDropdown = closeReportDropdown;
window.handleReportIssueClick = handleReportIssueClick;
