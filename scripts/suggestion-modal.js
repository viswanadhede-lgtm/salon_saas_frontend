import { supabase } from '../lib/supabase.js';

/* ── Configuration ────────────────────────────────────────────────── */
const SG_CONFIG = {
    bucketName:       'suggestion-attachments',
    maxFiles:         5,
    maxSizeBytes:     10 * 1024 * 1024,  // 10 MB per file
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
};

/* ── In-memory file queue (survives re-opens until reset) ──────────── */
let _sgSelectedFiles = [];
let _sgSubmitting    = false;

/* ── Expose functions to global scope so inline handlers work ─────── */
window.openSuggestionModal = function() {
    _sgResetModal();
    document.getElementById('suggestionOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('sgCategory').focus(), 120);
};

window.closeSuggestionModal = function() {
    if (_sgSubmitting) return; // prevent close mid-submit
    document.getElementById('suggestionOverlay').classList.remove('active');
    document.body.style.overflow = '';
};

window.handleSgOverlayClick = function(e) {
    if (e.target === document.getElementById('suggestionOverlay')) window.closeSuggestionModal();
};

window.sgClearError = function(el, hintId) {
    el.classList.remove('sg-error');
    const hint = document.getElementById(hintId);
    if (hint) hint.classList.remove('visible');
};

window.handleSgFileSelect = function(e) {
    _sgAddFiles(Array.from(e.target.files));
    e.target.value = ''; // reset input so same file can be re-selected
};

window.handleSgDrop = function(e) {
    e.preventDefault();
    document.getElementById('sgDropzone').classList.remove('drag-over');
    _sgAddFiles(Array.from(e.dataTransfer.files));
};

window.removeSgFile = function(index) {
    _sgSelectedFiles.splice(index, 1);
    _sgRenderChips();
};

window.submitSuggestion = function() {
    _sgSubmit();
};

/* ── Internal helpers ─────────────────────────────────────────────── */
function _sgResetModal() {
    document.getElementById('sgCategory').value    = '';
    document.getElementById('sgTitle').value       = '';
    document.getElementById('sgDescription').value = '';
    document.getElementById('sgWhyUseful').value   = '';
    _sgSelectedFiles = [];
    _sgRenderChips();
    ['sgCategory','sgTitle','sgDescription'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('sg-error');
    });
    ['sgCategoryHint','sgTitleHint','sgDescriptionHint'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible');
    });
    _sgHideBanner();
    document.getElementById('sgFormBody').style.display = 'flex';
    document.getElementById('sgSuccess').style.display  = 'none';
    document.getElementById('sgFooter').style.display   = 'flex';
    const btn = document.getElementById('sgSubmitBtn');
    btn.disabled  = false;
    btn.innerHTML = 'Submit Suggestion';
    _sgSubmitting = false;
}

function _sgShowError(fieldId, hintId) {
    const el   = document.getElementById(fieldId);
    const hint = document.getElementById(hintId);
    if (el)   el.classList.add('sg-error');
    if (hint) hint.classList.add('visible');
}

function _sgShowBanner(msg) {
    const b = document.getElementById('sgErrorBanner');
    if (!b) return;
    b.textContent  = msg;
    b.style.display = 'block';
}

function _sgHideBanner() {
    const b = document.getElementById('sgErrorBanner');
    if (b) b.style.display = 'none';
}

function _sgAddFiles(newFiles) {
    const errors = [];
    for (const file of newFiles) {
        if (_sgSelectedFiles.length >= SG_CONFIG.maxFiles) {
            errors.push(`Maximum ${SG_CONFIG.maxFiles} images allowed. Extra files were skipped.`);
            break;
        }
        if (!SG_CONFIG.allowedMimeTypes.includes(file.type)) {
            errors.push(`"${file.name}" is not a supported image type (JPEG, PNG, WebP or GIF).`);
            continue;
        }
        if (file.size > SG_CONFIG.maxSizeBytes) {
            errors.push(`"${file.name}" exceeds the 10 MB size limit.`);
            continue;
        }
        // Avoid exact duplicates by name+size
        const isDupe = _sgSelectedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!isDupe) _sgSelectedFiles.push(file);
    }
    if (errors.length) _sgShowBanner(errors.join(' '));
    else _sgHideBanner();
    _sgRenderChips();
}

function _sgRenderChips() {
    const container = document.getElementById('sgFileChips');
    const dropzone  = document.getElementById('sgDropzone');
    if (!container) return;

    container.innerHTML = '';

    if (_sgSelectedFiles.length === 0) {
        container.style.display = 'none';
        if (dropzone) dropzone.style.display = '';
        return;
    }

    container.style.display = 'flex';
    if (dropzone && _sgSelectedFiles.length >= SG_CONFIG.maxFiles) {
        dropzone.style.display = 'none';
    } else if (dropzone) {
        dropzone.style.display = '';
    }

    _sgSelectedFiles.forEach((file, idx) => {
        const chip = document.createElement('div');
        chip.style.cssText = 'display:flex;align-items:center;gap:6px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:4px 10px;font-size:0.8rem;color:#1e40af;max-width:220px;';
        chip.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4338ca" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;" title="${file.name}">${file.name}</span>
            <span style="color:#64748b;flex-shrink:0;">(${(file.size/1024).toFixed(0)}KB)</span>
            <button onclick="removeSgFile(${idx})" title="Remove" aria-label="Remove ${file.name}" style="background:none;border:none;cursor:pointer;padding:0;color:#6b7280;display:flex;align-items:center;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;
        container.appendChild(chip);
    });
}

/* ── Context helpers ──────────────────────────────────────────────── */
function _getAppContext() {
    try { return JSON.parse(localStorage.getItem('appContext') || '{}'); } catch { return {}; }
}

function _getCompanyId() {
    const ctx = _getAppContext();
    return ctx.company?.company_id || localStorage.getItem('company_id') || null;
}

function _getBranchId() {
    const ctx = _getAppContext();
    return ctx.current_branch_id || localStorage.getItem('active_branch_id') || null;
}

/* ── Storage: delete uploaded files on failure ────────────────────── */
async function _sgDeleteUploadedFiles(paths) {
    const token = localStorage.getItem('token') || supabase._key;
    for (const path of paths) {
        try {
            await fetch(`${supabase._url}/storage/v1/object/${SG_CONFIG.bucketName}/${encodeURIComponent(path)}`, {
                method:  'DELETE',
                headers: {
                    'apikey':        supabase._key,
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (e) {
            console.warn('[Suggestions] Could not delete orphaned file:', path, e);
        }
    }
}

/* ── Main submit ──────────────────────────────────────────────────── */
async function _sgSubmit() {
    if (_sgSubmitting) return; // guard against double-click

    /* 1. Validate fields */
    let valid = true;
    const category    = document.getElementById('sgCategory');
    const title       = document.getElementById('sgTitle');
    const description = document.getElementById('sgDescription');
    const whyUseful   = document.getElementById('sgWhyUseful');

    if (!category.value)                     { _sgShowError('sgCategory',    'sgCategoryHint');    valid = false; }
    if (title.value.trim().length < 5)        { _sgShowError('sgTitle',       'sgTitleHint');       valid = false; }
    if (description.value.trim().length < 15) { _sgShowError('sgDescription', 'sgDescriptionHint'); valid = false; }
    if (!valid) return;

    _sgHideBanner();

    /* 2. Start loading state */
    _sgSubmitting = true;
    const btn = document.getElementById('sgSubmitBtn');
    btn.disabled  = true;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Submitting…`;

    /* 3. Resolve authenticated user UUID */
    const token = localStorage.getItem('token');
    if (!token) {
        _sgRestoreBtn(btn);
        _sgShowBanner('Session expired. Please refresh the page and sign in again.');
        return;
    }

    let authUserId = null;
    try {
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user?.id) throw userErr || new Error('No user id');
        authUserId = userData.user.id;
    } catch (e) {
        _sgRestoreBtn(btn);
        _sgShowBanner('Could not verify your session. Please refresh and try again.');
        return;
    }

    /* 4. Resolve company / branch context */
    const company_id = _getCompanyId();
    const branch_id  = _getBranchId() || null;

    if (!company_id) {
        _sgRestoreBtn(btn);
        _sgShowBanner('Could not determine your company context. Please refresh and try again.');
        return;
    }

    /* 5. Insert suggestion row */
    let suggestion = null;
    try {
        const payload = {
            company_id,
            branch_id,
            user_id:          authUserId,
            category:         category.value,
            title:            title.value.trim(),
            description:      description.value.trim(),
            business_benefit: whyUseful.value.trim() || null
        };

        const { data: rows, error: insertErr } = await supabase
            .from('suggestions')
            .insert(payload)
            .select();

        if (insertErr) throw insertErr;
        suggestion = Array.isArray(rows) ? rows[0] : rows;
        if (!suggestion?.id) throw new Error('Suggestion insert returned no id.');
    } catch (e) {
        console.error('[Suggestions] DB insert failed:', e);
        _sgRestoreBtn(btn);
        _sgShowBanner(`Failed to save your suggestion: ${e.message || 'Database error'}. Please try again.`);
        return;
    }

    /* 6. Upload images (if any) */
    const uploadedPaths = [];
    if (_sgSelectedFiles.length > 0) {
        for (const file of _sgSelectedFiles) {
            const timestamp    = Math.floor(Date.now() / 1000);
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const safeName     = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_').toLowerCase();
            const storagePath  = `${authUserId}/${suggestion.id}/${timestamp}-${randomSuffix}-${safeName}`;

            try {
                const { data: upData, error: upErr } = await supabase.storage
                    .from(SG_CONFIG.bucketName)
                    .upload(storagePath, file, { upsert: false });
                if (upErr) throw new Error(upErr.message || JSON.stringify(upErr));
                uploadedPaths.push(storagePath);
            } catch (e) {
                console.error('[Suggestions] Upload failed for', file.name, e);
                // Rollback: delete already-uploaded files + delete suggestion row
                await _sgDeleteUploadedFiles(uploadedPaths);
                await supabase.from('suggestions').eq('id', suggestion.id).delete();
                _sgRestoreBtn(btn);
                _sgShowBanner(`Image upload failed for "${file.name}": ${e.message}. Your suggestion was not saved. Please try again.`);
                return;
            }
        }

        /* 7. Insert attachment records */
        const attachmentRows = _sgSelectedFiles.map((file, idx) => ({
            suggestion_id: suggestion.id,
            storage_path:  uploadedPaths[idx],
            file_name:     file.name,
            content_type:  file.type,
            size_bytes:    file.size
        }));

        try {
            const { error: attErr } = await supabase
                .from('suggestion_attachments')
                .insert(attachmentRows);
            if (attErr) throw attErr;
        } catch (e) {
            console.error('[Suggestions] Attachment record insert failed:', e);
            await _sgDeleteUploadedFiles(uploadedPaths);
            await supabase.from('suggestions').eq('id', suggestion.id).delete();
            _sgRestoreBtn(btn);
            _sgShowBanner(`Could not save image records: ${e.message}. Your suggestion was not saved. Please try again.`);
            return;
        }
    }

    /* 8. All done — show success state */
    document.getElementById('sgFormBody').style.display = 'none';
    document.getElementById('sgFooter').style.display   = 'none';
    document.getElementById('sgSuccess').style.display  = 'flex';
    _sgSubmitting = false;
}

function _sgRestoreBtn(btn) {
    _sgSubmitting    = false;
    btn.disabled     = false;
    btn.innerHTML    = 'Submit Suggestion';
}

/* Ensure Escape key works */
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('suggestionOverlay');
        if (overlay && overlay.classList.contains('active') && !_sgSubmitting) {
            window.closeSuggestionModal();
        }
    }
});
