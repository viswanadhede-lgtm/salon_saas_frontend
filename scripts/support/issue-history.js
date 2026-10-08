        import {
            getIssues,
            getIssueThread,
            sendFollowUp,
            updateIssueStatus,
            submitIssue,
            getIssueContext
        } from '../issue-service.js';

        const CATEGORY_LABELS = {
            'bookings': 'Bookings & Appointments',
            'payments': 'Payments & Billing',
            'pos': 'Point of Sale (POS)',
            'staff': 'Staff & Scheduling',
            'customers': 'Customers',
            'services': 'Services & Products',
            'marketing': 'Memberships & Offers',
            'reports': 'Reports & Analytics',
            'settings': 'Settings',
            'branches': 'Branches',
            'subscription': 'Subscription & Plans',
            'login': 'Login & Access',
            'notifications': 'Notifications',
            'other': 'Other / General'
        };

        function formatCategoryLabel(catKey) {
            if (!catKey) return 'General';
            return CATEGORY_LABELS[catKey.toLowerCase()] || catKey;
        }

        function formatStatusLabel(status) {
            switch ((status || '').toLowerCase()) {
                case 'open': return 'Open';
                case 'in_progress': return 'In Progress';
                case 'resolved': return 'Resolved';
                case 'closed': return 'Closed';
                default: return 'Open';
            }
        }

        function getStatusBadgeClass(status) {
            switch ((status || '').toLowerCase()) {
                case 'open': return 'ih-badge-open';
                case 'in_progress': return 'ih-badge-inprogress';
                case 'resolved': return 'ih-badge-resolved';
                case 'closed': return 'ih-badge-closed';
                default: return 'ih-badge-open';
            }
        }

        function formatDate(isoString) {
            if (!isoString) return '';
            try {
                const date = new Date(isoString);
                const now = new Date();
                const diffHours = (now - date) / (1000 * 3600);
                if (diffHours < 24 && date.getDate() === now.getDate()) {
                    return 'Today, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } else if (diffHours < 48) {
                    return 'Yesterday';
                } else {
                    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                }
            } catch (e) {
                return '';
            }
        }

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        let allTickets = [];
        let selectedTicketId = null;
        let currentStatusFilter = 'all';
        let currentSearchQuery = '';
        let currentCategoryFilter = 'all';
        let pendingReplyFileObj = null;
        
        // Initialize tickets from Supabase
        async function initTickets() {
            const listEl = document.getElementById('ticketCardList');
            if (listEl) {
                listEl.innerHTML = `
                    <div style="padding:2.5rem; text-align:center; color:#64748b;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite; margin-bottom:8px;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                        <p style="font-size:0.875rem; margin:0;">Loading tickets…</p>
                    </div>
                `;
            }

            try {
                const { data, error } = await getIssues();
                if (error) {
                    console.error('[issue-history] Failed to fetch issues:', error);
                    showToast('Failed to load tickets: ' + (error.message || 'Error'));
                }

                allTickets = data || [];

                // Check URL param ?ticket=ISS-xxxxx or UUID
                const urlParams = new URLSearchParams(window.location.search);
                const requestedId = urlParams.get('ticket');
                if (requestedId) {
                    const match = allTickets.find(t =>
                        (t.reference_number && t.reference_number.toLowerCase() === requestedId.toLowerCase()) ||
                        (t.id && t.id.toLowerCase() === requestedId.toLowerCase())
                    );
                    if (match) selectedTicketId = match.id;
                    else if (allTickets.length > 0) selectedTicketId = allTickets[0].id;
                } else if (allTickets.length > 0) {
                    selectedTicketId = allTickets[0].id;
                } else {
                    selectedTicketId = null;
                }

                updateCounts();
                renderCardList();

                if (selectedTicketId) {
                    await loadSelectedTicketThread();
                } else {
                    renderDetailPanel();
                }
            } catch (err) {
                console.error('[issue-history] init error:', err);
                showToast('Error loading tickets');
            } finally {
                if (window.feather) feather.replace();
            }
        }

        async function refreshTickets() {
            await initTickets();
            showToast('Tickets refreshed');
        }

        function updateCounts() {
            const total = allTickets.length;
            const open = allTickets.filter(t => (t.status || '').toLowerCase() === 'open').length;
            const inProgress = allTickets.filter(t => (t.status || '').toLowerCase() === 'in_progress').length;
            const resolved = allTickets.filter(t => (t.status || '').toLowerCase() === 'resolved').length;
            const closed = allTickets.filter(t => (t.status || '').toLowerCase() === 'closed').length;

            const badge = document.getElementById('ihTotalBadge');
            if (badge) badge.textContent = `${total} Ticket${total === 1 ? '' : 's'}`;
            document.getElementById('countAll').textContent = total;
            document.getElementById('countOpen').textContent = open;
            document.getElementById('countInProgress').textContent = inProgress;
            document.getElementById('countResolved').textContent = resolved;
            document.getElementById('countClosed').textContent = closed;
        }

        function getFilteredTickets() {
            return allTickets.filter(t => {
                // Status
                if (currentStatusFilter !== 'all') {
                    const normStatus = (t.status || '').toLowerCase().replace(/\s+/g, '_');
                    const normFilter = currentStatusFilter.toLowerCase().replace(/\s+/g, '_');
                    if (normStatus !== normFilter) return false;
                }
                // Category
                if (currentCategoryFilter !== 'all') {
                    if ((t.category || '').toLowerCase() !== currentCategoryFilter.toLowerCase()) {
                        return false;
                    }
                }
                // Search
                if (currentSearchQuery.trim()) {
                    const q = currentSearchQuery.toLowerCase();
                    const matchRef = (t.reference_number || '').toLowerCase().includes(q);
                    const matchId = (t.id || '').toLowerCase().includes(q);
                    const matchSub = (t.subject || '').toLowerCase().includes(q);
                    const matchDesc = (t.description || '').toLowerCase().includes(q);
                    const matchCat = (t.category || '').toLowerCase().includes(q);
                    if (!matchRef && !matchId && !matchSub && !matchDesc && !matchCat) {
                        return false;
                    }
                }
                return true;
            });
        }

        function setStatusFilter(status, el) {
            currentStatusFilter = status;
            document.querySelectorAll('.ih-status-tab').forEach(tab => tab.classList.remove('active'));
            if (el) el.classList.add('active');
            renderCardList();
            const filtered = getFilteredTickets();
            if (filtered.length > 0 && !filtered.some(t => t.id === selectedTicketId)) {
                selectTicket(filtered[0].id);
            } else if (filtered.length === 0) {
                selectedTicketId = null;
                renderDetailPanel();
            }
        }

        function handleSearch() {
            currentSearchQuery = document.getElementById('ihSearchInput').value;
            renderCardList();
            const filtered = getFilteredTickets();
            if (filtered.length > 0 && !filtered.some(t => t.id === selectedTicketId)) {
                selectTicket(filtered[0].id);
            } else if (filtered.length === 0) {
                selectedTicketId = null;
                renderDetailPanel();
            }
        }

        function applyFilters() {
            currentCategoryFilter = document.getElementById('categoryFilter').value;
            renderCardList();
            const filtered = getFilteredTickets();
            if (filtered.length > 0 && !filtered.some(t => t.id === selectedTicketId)) {
                selectTicket(filtered[0].id);
            } else if (filtered.length === 0) {
                selectedTicketId = null;
                renderDetailPanel();
            }
        }

        function renderCardList() {
            const listEl = document.getElementById('ticketCardList');
            const filtered = getFilteredTickets();

            if (filtered.length === 0) {
                listEl.innerHTML = `
                    <div class="ih-empty-state">
                        <div class="ih-empty-icon">
                            <i data-feather="inbox" style="width:24px; height:24px;"></i>
                        </div>
                        <h3>No tickets found</h3>
                        <p>No support tickets match the selected filters or search query.</p>
                        <button class="ih-btn-secondary" onclick="window._resetAllFilters()">Reset Filters</button>
                    </div>
                `;
                if (window.feather) feather.replace();
                return;
            }

            listEl.innerHTML = filtered.map(t => {
                const isSelected = t.id === selectedTicketId;
                const statusClass = getStatusBadgeClass(t.status);
                const displayRef = t.reference_number || t.id.slice(0, 8);
                const latestMsg = (t.messages && t.messages.length > 0)
                    ? (t.messages[t.messages.length - 1].message || t.messages[t.messages.length - 1].text)
                    : t.description;
                const msgCount = (t.messages || []).length;
                const dateStr = formatDate(t.created_at);

                return `
                    <div class="ih-ticket-card ${isSelected ? 'selected' : ''}" onclick="window._selectTicket('${t.id}')">
                        <div class="ih-card-header">
                            <span class="ih-card-id">#${escapeHtml(displayRef)}</span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span class="ih-badge ${statusClass}">
                                    <span class="ih-badge-dot"></span>
                                    ${escapeHtml(formatStatusLabel(t.status))}
                                </span>
                            </div>
                        </div>
                        <h4 class="ih-card-subject">${escapeHtml(t.subject)}</h4>
                        <p class="ih-card-preview">${escapeHtml(latestMsg || '')}</p>
                        <div class="ih-card-footer">
                            <span class="ih-card-cat-tag">
                                ${escapeHtml(formatCategoryLabel(t.category))}
                            </span>
                            <div class="ih-card-meta-right">
                                ${msgCount > 0 ? `
                                    <span class="ih-card-meta-item">
                                        <i data-feather="message-square" style="width:12px; height:12px;"></i>
                                        ${msgCount}
                                    </span>
                                ` : ''}
                                <span>${dateStr}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            if (window.feather) feather.replace();
        }

        function resetAllFilters() {
            currentStatusFilter = 'all';
            currentCategoryFilter = 'all';
            currentSearchQuery = '';
            document.getElementById('ihSearchInput').value = '';
            document.getElementById('categoryFilter').value = 'all';
            document.querySelectorAll('.ih-status-tab').forEach(t => {
                t.classList.toggle('active', t.getAttribute('data-status') === 'all');
            });
            renderCardList();
            const filtered = getFilteredTickets();
            if (filtered.length > 0) {
                selectTicket(filtered[0].id);
            } else {
                renderDetailPanel();
            }
        }

        async function selectTicket(id) {
            selectedTicketId = id;
            renderCardList();
            renderDetailPanel(true);
            await loadSelectedTicketThread();

            if (window.innerWidth <= 860) {
                document.getElementById('ticketCardList').classList.add('mobile-hidden');
                document.getElementById('ticketDetailPanel').classList.remove('mobile-hidden');
            }
        }

        async function loadSelectedTicketThread() {
            if (!selectedTicketId) return;
            try {
                const { messages, allAttachments } = await getIssueThread(selectedTicketId);
                const ticket = allTickets.find(t => t.id === selectedTicketId);
                if (ticket) {
                    ticket.messages = messages;
                    ticket.attachments = allAttachments;
                }
                renderDetailPanel();
            } catch (err) {
                console.error('[issue-history] Thread loading error:', err);
                renderDetailPanel();
            }
        }

        function backToTicketListMobile() {
            document.getElementById('ticketCardList').classList.remove('mobile-hidden');
            document.getElementById('ticketDetailPanel').classList.add('mobile-hidden');
        }

        function renderDetailPanel(loading = false) {
            const detailEl = document.getElementById('ticketDetailPanel');
            const ticket = allTickets.find(t => t.id === selectedTicketId);

            if (!ticket) {
                detailEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:400px; text-align:center; padding:2rem;">
                        <div class="ih-empty-icon" style="margin-bottom:12px;">
                            <i data-feather="message-circle" style="width:28px; height:28px;"></i>
                        </div>
                        <h3 style="font-size:1.1rem; color:#1e293b; margin:0 0 6px;">Select a ticket to view messages</h3>
                        <p style="font-size:0.875rem; color:#64748b; margin:0;">Choose any ticket from the left panel to inspect updates and conversation history.</p>
                    </div>
                `;
                if (window.feather) feather.replace();
                return;
            }

            const statusClass = getStatusBadgeClass(ticket.status);
            const displayRef = ticket.reference_number || ticket.id.slice(0, 8);
            const normStatus = (ticket.status || '').toLowerCase();

            const messagesHtml = (ticket.messages || []).map(m => {
                const isCustomer = (m.sender_type === 'customer' || m.sender === 'user');
                const isSupport  = (m.sender_type === 'support');
                const isSystem   = (m.sender_type === 'system');

                if (isSystem) {
                    return `
                        <div style="display:flex; justify-content:center; margin:10px 0;">
                            <span style="font-size:0.75rem; background:#f1f5f9; color:#64748b; padding:4px 14px; border-radius:20px; font-weight:500;">
                                ${escapeHtml(m.message || m.text)}
                            </span>
                        </div>
                    `;
                }

                const senderName = m.sender_name || (isCustomer ? 'Customer' : 'Support Specialist');
                const senderRole = isSupport ? 'Support Team' : 'Customer';
                const avatar = isCustomer
                    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=1E3A8A&color=fff`
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=4F46E5&color=fff`;

                const timeStr = formatDate(m.created_at);

                const attachmentsList = (m.attachments || []).map(att => `
                    <a href="${escapeHtml(att.url || '#')}" target="_blank" rel="noopener noreferrer" class="ih-msg-attachment" style="text-decoration:none;">
                        <i data-feather="paperclip" style="width:14px; height:14px;"></i>
                        <span>${escapeHtml(att.file_name)}</span>
                        <i data-feather="download" style="width:13px; height:13px; margin-left:4px;"></i>
                    </a>
                `).join('');

                return `
                    <div class="ih-message-row ${isCustomer ? 'user' : 'support'}">
                        <div class="ih-msg-avatar">
                            <img src="${avatar}" alt="${escapeHtml(senderName)}">
                        </div>
                        <div class="ih-msg-content">
                            <div class="ih-msg-header">
                                <span class="ih-msg-sender-name">${escapeHtml(senderName)}</span>
                                ${!isCustomer ? `<span class="ih-agent-badge">${escapeHtml(senderRole)}</span>` : ''}
                                <span>•</span>
                                <span>${escapeHtml(timeStr)}</span>
                            </div>
                            <div class="ih-msg-bubble">
                                ${escapeHtml(m.message || m.text || '')}
                                ${attachmentsList}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            detailEl.innerHTML = `
                <!-- Detail Header -->
                <div class="ih-detail-header">
                    <button class="ih-mobile-back-btn" onclick="window._backToTicketListMobile()">
                        <i data-feather="arrow-left" style="width:14px; height:14px;"></i>
                        Back to tickets list
                    </button>
                    <div class="ih-detail-top-row">
                        <div class="ih-detail-id-group">
                            <span class="ih-card-id" style="font-size:0.85rem; padding:4px 10px;">#${escapeHtml(displayRef)}</span>
                            <span class="ih-badge ${statusClass}">
                                <span class="ih-badge-dot"></span>
                                ${escapeHtml(formatStatusLabel(ticket.status))}
                            </span>
                        </div>
                        <div class="ih-detail-actions">
                            ${normStatus !== 'resolved' && normStatus !== 'closed' ? `
                                <button class="ih-btn-secondary" onclick="window._updateTicketStatus('${ticket.id}', 'resolved')">
                                    <i data-feather="check" style="width:14px; height:14px; color:#10b981;"></i>
                                    Mark Resolved
                                </button>
                            ` : `
                                <button class="ih-btn-secondary" onclick="window._updateTicketStatus('${ticket.id}', 'open')">
                                    <i data-feather="rotate-ccw" style="width:14px; height:14px; color:#4f46e5;"></i>
                                    Reopen Ticket
                                </button>
                            `}
                        </div>
                    </div>

                    <h2 class="ih-detail-title">${escapeHtml(ticket.subject)}</h2>

                    <div class="ih-detail-meta-row">
                        <span>
                            <i data-feather="tag" style="width:13px; height:13px;"></i>
                            ${escapeHtml(formatCategoryLabel(ticket.category))}
                        </span>
                        <span>
                            <i data-feather="clock" style="width:13px; height:13px;"></i>
                            Created ${ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Recently'}
                        </span>
                        <span>
                            <i data-feather="message-circle" style="width:13px; height:13px;"></i>
                            ${(ticket.messages || []).length} Updates
                        </span>
                    </div>
                </div>

                <!-- Conversation Body -->
                <div class="ih-thread-body" id="threadBody">
                    <!-- Original Reported Description -->
                    <div class="ih-original-issue-card">
                        <div class="ih-original-issue-header">
                            <span class="ih-original-issue-label">
                                <i data-feather="alert-circle" style="width:13px; height:13px;"></i>
                                Initial Report Description
                            </span>
                            <span style="font-size:0.75rem; color:#94a3b8;">Original Ticket</span>
                        </div>
                        <p class="ih-original-issue-text">${escapeHtml(ticket.description)}</p>
                    </div>

                    <!-- Message Bubbles -->
                    ${loading ? `
                        <div style="padding:1.5rem; text-align:center; color:#94a3b8; font-size:0.85rem;">
                            Loading messages…
                        </div>
                    ` : messagesHtml}
                </div>

                <!-- Composer -->
                <div class="ih-composer">
                    <textarea id="replyTextarea" class="ih-composer-textarea" placeholder="Write a reply or provide additional details to support team…" onkeydown="window._handleReplyKey(event)"></textarea>
                    <div class="ih-composer-bottom">
                        <div class="ih-composer-tools">
                            <button class="ih-tool-btn" type="button" onclick="document.getElementById('replyFileInput').click()">
                                <i data-feather="paperclip" style="width:13px; height:13px;"></i>
                                Attach File
                            </button>
                            <span id="replyFileBadge" class="ih-composer-file-badge" style="display:none;">
                                <span id="replyFileNameText">file.png</span>
                                <button onclick="window._removeReplyFile()" title="Remove">✕</button>
                            </span>
                        </div>
                        <button class="ih-btn-primary" onclick="window._sendReply()">
                            <i data-feather="send" style="width:14px; height:14px;"></i>
                            Send Reply
                        </button>
                    </div>
                </div>
            `;

            if (window.feather) feather.replace();

            setTimeout(() => {
                const thread = document.getElementById('threadBody');
                if (thread) thread.scrollTop = thread.scrollHeight;
            }, 60);
        }

        async function updateTicketStatusHandler(ticketId, newStatus) {
            const ticket = allTickets.find(t => t.id === ticketId);
            if (!ticket) return;

            try {
                await updateIssueStatus(ticketId, newStatus);
                ticket.status = newStatus.toLowerCase();
                updateCounts();
                renderCardList();
                renderDetailPanel();
                showToast(`Ticket status updated to ${formatStatusLabel(newStatus)}`);
            } catch (err) {
                console.error('[issue-history] updateTicketStatus error:', err);
                alert('Could not update status: ' + (err.message || 'Permission denied'));
            }
        }

        function handleReplyKey(e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendReply();
            }
        }

        function handleReplyFileSelect(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
                alert('File is too large. Maximum size is 10 MB.');
                return;
            }
            pendingReplyFileObj = file;
            const badge = document.getElementById('replyFileBadge');
            const nameEl = document.getElementById('replyFileNameText');
            if (badge && nameEl) {
                nameEl.textContent = file.name;
                badge.style.display = 'inline-flex';
            }
        }

        function removeReplyFile() {
            pendingReplyFileObj = null;
            document.getElementById('replyFileInput').value = '';
            const badge = document.getElementById('replyFileBadge');
            if (badge) badge.style.display = 'none';
        }

        async function sendReply() {
            const textarea = document.getElementById('replyTextarea');
            if (!textarea) return;
            const text = textarea.value.trim();

            if (!text && !pendingReplyFileObj) {
                textarea.focus();
                return;
            }

            const ticket = allTickets.find(t => t.id === selectedTicketId);
            if (!ticket) return;

            const sendBtn = document.querySelector('.ih-composer button.ih-btn-primary');
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = 'Sending…';
            }

            try {
                const result = await sendFollowUp({
                    issueId: selectedTicketId,
                    message: text,
                    file: pendingReplyFileObj
                });

                if (!ticket.messages) ticket.messages = [];
                ticket.messages.push(result.message);

                // If ticket was resolved or closed, customer reply reopens it
                if (ticket.status === 'resolved' || ticket.status === 'closed') {
                    ticket.status = 'open';
                    try {
                        await updateIssueStatus(ticket.id, 'open');
                    } catch (e) {
                        console.warn('[issue-history] Reopen update warning:', e);
                    }
                }

                textarea.value = '';
                removeReplyFile();
                updateCounts();
                renderCardList();
                renderDetailPanel();
                showToast('Reply sent to support team');
            } catch (err) {
                console.error('[issue-history] sendReply error:', err);
                alert('Could not send reply: ' + (err.message || 'Please try again.'));
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<i data-feather="send" style="width:14px; height:14px;"></i> Send Reply';
                    if (window.feather) feather.replace();
                }
            }
        }

        function showToast(msg) {
            const toast = document.getElementById('ihToast');
            const txt = document.getElementById('ihToastMsg');
            if (!toast || !txt) return;
            txt.textContent = msg;
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 3200);
        }

        /* ======= Modal Controls (Handled by scripts/support/support-issue-modal.js) ======= */
        window.addEventListener('report-issue:submitted', async (e) => {
            await initTickets();
            if (e.detail?.issue?.id) {
                selectedTicketId = e.detail.issue.id;
                renderCardList();
                await loadSelectedTicketThread();
            }
        });
window.refreshTickets           = refreshTickets;
        window.setStatusFilter          = setStatusFilter;
        window.handleSearch             = handleSearch;
        window.applyFilters             = applyFilters;
        window.handleReplyFileSelect    = handleReplyFileSelect;
        window._selectTicket            = selectTicket;
        window._resetAllFilters         = resetAllFilters;
        window._backToTicketListMobile  = backToTicketListMobile;
        window._updateTicketStatus      = updateTicketStatusHandler;
        window._handleReplyKey          = handleReplyKey;
        window._removeReplyFile         = removeReplyFile;
        window._sendReply               = sendReply;

        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initTickets();
            });
        } else {
            initTickets();
        }