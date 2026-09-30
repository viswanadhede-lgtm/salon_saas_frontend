import { supabase } from '../lib/supabase.js';

/* ===================== RATE YOUR EXPERIENCE (REVIEW) MODAL ===================== */

/* -- Module-private state -------------------------------------------------------- */
let _selectedReviewRating = 0;
let _rvSubmitting = false;

const _RATING_LABELS = {
    1: '1 star \u2B50 Poor',
    2: '2 stars \u2B50\u2B50 Fair',
    3: '3 stars \u2B50\u2B50\u2B50 Good',
    4: '4 stars \u2B50\u2B50\u2B50\u2B50 Very Good',
    5: '5 stars \u2B50\u2B50\u2B50\u2B50\u2B50 Excellent!'
};

/* -- Context helpers -------------------------------------------------------------- */
function _getAppContext() {
    try { return JSON.parse(localStorage.getItem('appContext') || '{}'); } catch { return {}; }
}

function _getUserId() {
    const ctx = _getAppContext();
    return ctx.user?.user_id || ctx.user?.id || null;
}

function _getCompanyId() {
    const ctx = _getAppContext();
    return ctx.company?.company_id || localStorage.getItem('company_id') || null;
}

function _getBranchId() {
    const ctx = _getAppContext();
    return ctx.current_branch_id || localStorage.getItem('active_branch_id') || null;
}

/* -- Modal lifecycle ------------------------------------------------------------- */
window.openReviewModal = function() {
    resetReviewModal();
    document.getElementById('reviewOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeReviewModal = function() {
    if (_rvSubmitting) return;
    document.getElementById('reviewOverlay').classList.remove('active');
    document.body.style.overflow = '';
};

window.handleRvOverlayClick = function(e) {
    if (e.target === document.getElementById('reviewOverlay')) window.closeReviewModal();
};

function resetReviewModal() {
    _selectedReviewRating = 0;
    _rvSubmitting = false;
    const comments = document.getElementById('rvComments');
    if (comments) comments.value = '';

    const hint = document.getElementById('rvStarHint');
    if (hint) {
        hint.textContent = 'Select a rating from 1 to 5 stars.';
        hint.classList.remove('error');
    }

    document.querySelectorAll('.rv-star-btn').forEach(btn => {
        btn.classList.remove('active', 'hovered');
    });

    document.getElementById('rvFormBody').style.display = 'flex';
    document.getElementById('rvSuccess').style.display  = 'none';
    document.getElementById('rvFooter').style.display   = 'flex';
    const btn = document.getElementById('rvSubmitBtn');
    if (btn) {
        btn.disabled  = false;
        btn.innerHTML = 'Submit Review';
    }
}

/* -- Star rating interaction ------------------------------------------------------ */
window.rvStarHover = function(rating) {
    document.querySelectorAll('.rv-star-btn').forEach(btn => {
        const r = parseInt(btn.getAttribute('data-rating'), 10);
        btn.classList.toggle('hovered', r <= rating);
    });
    const hint = document.getElementById('rvStarHint');
    if (hint) {
        hint.classList.remove('error');
        hint.textContent = _RATING_LABELS[rating] || 'Select a rating from 1 to 5 stars.';
    }
};

window.rvResetStarHover = function() {
    document.querySelectorAll('.rv-star-btn').forEach(btn => {
        btn.classList.remove('hovered');
        const r = parseInt(btn.getAttribute('data-rating'), 10);
        btn.classList.toggle('active', r <= _selectedReviewRating);
    });
    const hint = document.getElementById('rvStarHint');
    if (hint) {
        if (_selectedReviewRating > 0) {
            hint.textContent = _RATING_LABELS[_selectedReviewRating];
            hint.classList.remove('error');
        } else {
            hint.textContent = 'Select a rating from 1 to 5 stars.';
        }
    }
};

window.rvStarSelect = function(rating) {
    _selectedReviewRating = rating;
    document.querySelectorAll('.rv-star-btn').forEach(btn => {
        const r = parseInt(btn.getAttribute('data-rating'), 10);
        btn.classList.toggle('active', r <= rating);
    });
    const hint = document.getElementById('rvStarHint');
    if (hint) {
        hint.classList.remove('error');
        hint.textContent = _RATING_LABELS[rating];
    }
};

/* -- Review submission ------------------------------------------------------------ */
window.submitReview = async function() {
    if (_rvSubmitting) return;

    const hint = document.getElementById('rvStarHint');

    if (!_selectedReviewRating || _selectedReviewRating < 1 || _selectedReviewRating > 5) {
        if (hint) {
            hint.textContent = 'Please select a rating before submitting.';
            hint.classList.add('error');
        }
        const row = document.getElementById('rvStarsRow');
        if (row) {
            row.style.animation = 'none';
            requestAnimationFrame(() => {
                row.style.animation = 'rvShake 0.3s ease';
            });
        }
        return;
    }

    const userId    = _getUserId();
    const companyId = _getCompanyId();
    const branchId  = _getBranchId();

    if (!userId || !companyId) {
        if (hint) {
            hint.textContent = 'Session or company context missing. Please refresh the page.';
            hint.classList.add('error');
        }
        return;
    }

    const btn = document.getElementById('rvSubmitBtn');
    _rvSubmitting = true;
    btn.disabled = true;
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Submitting\u2026';

    const comments    = document.getElementById('rvComments');
    const commentsVal = comments ? comments.value.trim() : '';

    try {
        const payload = {
            user_id:    userId,
            company_id: companyId,
            branch_id:  branchId || null,
            rating:     _selectedReviewRating,
            comments:   commentsVal || null
        };

        const { data, error } = await supabase
            .from('reviews')
            .insert(payload)
            .select();

        if (error) throw error;

        // Show success screen
        document.getElementById('rvFormBody').style.display = 'none';
        document.getElementById('rvFooter').style.display   = 'none';
        document.getElementById('rvSuccess').style.display  = 'flex';
    } catch (err) {
        console.error('[Review] Insert failed:', err);
        if (hint) {
            hint.textContent = err.message || 'Failed to submit review. Please try again.';
            hint.classList.add('error');
        }
    } finally {
        _rvSubmitting = false;
        btn.disabled = false;
        btn.innerHTML = 'Submit Review';
    }
};

/* -- Shake animation (dynamic inject -- required for validation UX) -------------- */
const rvShakeStyle = document.createElement('style');
rvShakeStyle.textContent = '@keyframes rvShake { 0%,100%{transform:translateX(0);} 20%,60%{transform:translateX(-6px);} 40%,80%{transform:translateX(6px);} }';
document.head.appendChild(rvShakeStyle);

/* -- Escape key listener ---------------------------------------------------------- */
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('reviewOverlay');
        if (overlay && overlay.classList.contains('active') && !_rvSubmitting) {
            window.closeReviewModal();
        }
    }
});
