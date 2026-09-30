import { submitIssue } from '../issue-service.js';

/* ======= Report an Issue Modal (Shared Module) ======= */

// Inject spin style for loading icon if not already present
if (!document.getElementById('riSpinStyle')) {
    const riSpinStyle = document.createElement('style');
    riSpinStyle.id = 'riSpinStyle';
    riSpinStyle.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(riSpinStyle);
}

// Module-private state
let riSelectedFile = null;
let riSubmitting = false;

const ALLOWED_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'application/zip'
];
const ALLOWED_EXT_REGEX = /\.(png|jpg|jpeg|gif|webp|pdf|mp4|zip)$/i;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function openReportIssueModal() {
    resetReportIssueModal();
    const overlay = document.getElementById('reportIssueOverlay');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        const cat = document.getElementById('riCategory');
        if (cat) cat.focus();
    }, 120);
}

function closeReportIssueModal() {
    if (riSubmitting) return;
    const overlay = document.getElementById('reportIssueOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

function handleRiOverlayClick(e) {
    if (e.target === document.getElementById('reportIssueOverlay')) {
        closeReportIssueModal();
    }
}

function resetReportIssueModal() {
    const category = document.getElementById('riCategory');
    const subject = document.getElementById('riSubject');
    const description = document.getElementById('riDescription');

    if (category) category.value = '';
    if (subject) subject.value = '';
    if (description) description.value = '';

    removeRiFile();

    ['riCategory', 'riSubject', 'riDescription'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('ri-error');
    });

    ['riCategoryHint', 'riSubjectHint', 'riDescriptionHint'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible');
    });

    const formBody = document.getElementById('riFormBody');
    const success = document.getElementById('riSuccess');
    const footer = document.getElementById('riFooter');
    const submitBtn = document.getElementById('riSubmitBtn');

    if (formBody) formBody.style.display = 'flex';
    if (success) success.style.display = 'none';
    if (footer) footer.style.display = 'flex';
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit Issue';
    }

    riSubmitting = false;
}

function riClearError(el, hintId) {
    if (el) el.classList.remove('ri-error');
    const hint = document.getElementById(hintId);
    if (hint) hint.classList.remove('visible');
}

function riShowError(fieldId, hintId) {
    const field = document.getElementById(fieldId);
    const hint = document.getElementById(hintId);
    if (field) field.classList.add('ri-error');
    if (hint) hint.classList.add('visible');
}

function _validateFile(file) {
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name.match(ALLOWED_EXT_REGEX)) {
        alert('File type not supported. Please upload PNG, JPG, PDF, MP4, or ZIP.');
        return false;
    }
    if (file.size > MAX_FILE_SIZE) {
        alert('File is too large. Maximum size is 10 MB.');
        return false;
    }
    return true;
}

function handleRiFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (file) {
        if (!_validateFile(file)) {
            e.target.value = '';
            return;
        }
        riSelectedFile = file;
        showRiFile(file);
    }
}

function handleRiDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById('riDropzone');
    if (dropzone) dropzone.classList.remove('drag-over');

    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    if (!_validateFile(file)) {
        return;
    }

    riSelectedFile = file;
    showRiFile(file);
}

function showRiFile(file) {
    const dropzone = document.getElementById('riDropzone');
    const preview = document.getElementById('riFilePreview');
    const nameEl = document.getElementById('riFileName');

    if (dropzone) dropzone.style.display = 'none';
    if (preview) preview.style.display = 'flex';
    if (nameEl) nameEl.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
}

function removeRiFile() {
    riSelectedFile = null;
    const input = document.getElementById('riFileInput');
    const dropzone = document.getElementById('riDropzone');
    const preview = document.getElementById('riFilePreview');
    const nameEl = document.getElementById('riFileName');

    if (input) input.value = '';
    if (dropzone) dropzone.style.display = '';
    if (preview) preview.style.display = 'none';
    if (nameEl) nameEl.textContent = '';
}

async function submitReportIssue() {
    if (riSubmitting) return;

    let valid = true;
    const category = document.getElementById('riCategory');
    const subject = document.getElementById('riSubject');
    const description = document.getElementById('riDescription');

    if (!category || !category.value) {
        riShowError('riCategory', 'riCategoryHint');
        valid = false;
    }
    if (!subject || subject.value.trim().length < 5) {
        riShowError('riSubject', 'riSubjectHint');
        valid = false;
    }
    if (!description || description.value.trim().length < 20) {
        riShowError('riDescription', 'riDescriptionHint');
        valid = false;
    }

    if (!valid) return;

    riSubmitting = true;
    const btn = document.getElementById('riSubmitBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Submitting…';
    }

    try {
        const result = await submitIssue({
            category: category.value,
            subject: subject.value,
            description: description.value,
            file: riSelectedFile
        });

        const refNumber = result.referenceNumber || 'Submitted';
        const ticketIdEl = document.getElementById('riTicketId');
        if (ticketIdEl) ticketIdEl.textContent = 'Ticket #' + refNumber;
        window._latestTicketId = refNumber;

        const formBody = document.getElementById('riFormBody');
        const footer = document.getElementById('riFooter');
        const success = document.getElementById('riSuccess');

        if (formBody) formBody.style.display = 'none';
        if (footer) footer.style.display = 'none';
        if (success) success.style.display = 'flex';

        riSubmitting = false;

        // Dispatch CustomEvent for page-specific hooks (e.g. ticket list reload in issue-history.html)
        window.dispatchEvent(new CustomEvent('report-issue:submitted', {
            detail: {
                issue: result.issue,
                referenceNumber: refNumber,
                result
            }
        }));
    } catch (err) {
        console.error('[report-issue] Error submitting issue:', err);
        alert('Could not submit issue: ' + (err.message || 'Please try again.'));
        riSubmitting = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit Issue';
        }
    }
}

function goToTicketHistory() {
    closeReportIssueModal();
    const tid = window._latestTicketId ? '?ticket=' + encodeURIComponent(window._latestTicketId) : '';
    window.location.href = 'issue-history.html' + tid;
}

// Escape key listener for Report Issue Modal
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('reportIssueOverlay');
        if (overlay && overlay.classList.contains('active') && !riSubmitting) {
            closeReportIssueModal();
        }
    }
});

// Attach all APIs to window for inline HTML attributes and cross-block access
window.openReportIssueModal     = openReportIssueModal;
window.closeReportIssueModal    = closeReportIssueModal;
window.handleRiOverlayClick     = handleRiOverlayClick;
window.resetReportIssueModal    = resetReportIssueModal;
window.riClearError             = riClearError;
window.riShowError              = riShowError;
window.handleRiFileSelect       = handleRiFileSelect;
window.handleRiDrop             = handleRiDrop;
window.showRiFile               = showRiFile;
window.removeRiFile             = removeRiFile;
window.submitReportIssue        = submitReportIssue;
window.goToTicketHistory        = goToTicketHistory;
