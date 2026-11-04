# Module 16: Support, Issues & Suggestions — Developer Interaction & Technical Map

## 1. Module Overview & Principles

The **Support, Issues & Suggestions** module delivers customer service, self-service knowledge base search, ticketing issue tracking with two-way conversation threads, customer feature suggestions, and app rating reviews.

The module consists of two central views:
1. **Help & Support Hub** ([`support.html`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/support.html)): Serves as the central support entry point, providing instantaneous knowledge base search across 20+ operations, direct access to the BharathBots User Manual PDF, channels for instant contact (Live Chat, Email, Phone), and modals for submitting new tickets, feature suggestions, and app reviews.
2. **Issue History & Discussion Console** ([`issue-history.html`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/issue-history.html)): A 2-column support ticketing console featuring live status tabs, search & category filtering, real-time ticket threads, file attachment management, customer follow-up replies, and ticket status lifecycle transitions (Open, In Progress, Resolved, Closed).

### Core Architectural Principles
1. **Zero-Trust Authoritative Ticketing**:
   - The frontend never performs direct SQL `INSERT`, `UPDATE`, or `DELETE` on support ticket tables (`issues`, `issue_messages`, `issue_attachments`, `customer_reviews`, `feature_suggestions`).
   - Every mutation is handled by authoritative `SECURITY DEFINER` procedures in PostgreSQL (`public` and `shared` schemas).
2. **Secure Object Storage Lifecycle**:
   - Attachments (screenshots, logs, PDFs, screen recordings up to 10 MB) are uploaded to partitioned Supabase Storage buckets (`issue-attachments` and `suggestion-attachments`).
   - URLs are generated as time-limited Signed URLs (3600s TTL) to prevent unauthorized public exposure of salon data.
   - If an attachment record fails to save in the database, uploaded storage objects are cleaned up immediately to avoid orphan files.
3. **Tenant & User Context Enforcement**:
   - Tickets and suggestions are stamped with `company_id`, `branch_id`, and `user_id`.
   - Access to issue records is strictly partitioned by the tenant's authenticated session context.

---

## 2. File & Script Architecture

### Pages (Views)
- [`support.html`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/support.html): Help & Support Hub with Knowledge Base search and modals.
- [`issue-history.html`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/issue-history.html): 2-column ticketing console with live message threads.

### JavaScript Modules
- [`scripts/issue-service.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/issue-service.js): Core API client for ticketing. Provides `getIssueContext`, `submitIssue`, `getIssues`, `getIssueThread`, `sendFollowUp`, and `updateIssueStatus`.
- [`scripts/support/support-issue-modal.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/support/support-issue-modal.js): Shared modal controller for the "Report an Issue" form with drag-and-drop file upload.
- [`scripts/support/issue-history.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/support/issue-history.js): Controller for `issue-history.html`. Manages status tabs, ticket card lists, message thread scrolling, follow-up replies, and status transitions.
- [`scripts/support/support-kb.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/support/support-kb.js): Fast client-side knowledge base search engine with debounced input and keyword highlighting.
- [`scripts/suggestion-modal.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/suggestion-modal.js): Modal controller for the "Share a Suggestion" workflow with multi-file chip management and atomic RPC submission.
- [`scripts/review-modal.js`](file:///c:/Users/viswa/OneDrive/Desktop/salon-saas-frontend/scripts/review-modal.js): Modal controller for the "Rate Your Experience" star-rating feedback workflow.

---

## 3. Database Schema & Stored Procedures

### 3.1 Tables Involved

| Table | Schema | Description |
|---|---|---|
| `issues` | `platform` / `shared` | Master ticket records containing `id`, `reference_number` (`#BB-xxxxx`), `company_id`, `branch_id`, `user_id`, `category`, `subject`, `description`, `status` (`open`, `in_progress`, `resolved`, `closed`), `created_at`, `updated_at`. |
| `issue_messages` | `platform` / `shared` | Two-way message threads containing `id`, `issue_id`, `sender_type` (`customer`, `support`), `sender_user_id`, `sender_name`, `message`, `created_at`. |
| `issue_attachments` | `platform` / `shared` | File records tied to tickets/messages containing `id`, `issue_id`, `message_id`, `storage_path`, `file_name`, `content_type`, `size_bytes`, `created_at`. |
| `feature_suggestions` | `platform` / `shared` | Customer feature suggestions and business benefits with attachments. |
| `customer_reviews` | `platform` / `shared` | Star ratings (1-5) and qualitative feedback comments. |

### 3.2 PostgreSQL Stored Procedures

| Stored Procedure | Schemas | Parameters | Invariants & Logic Enforced |
|---|---|---|---|
| `submit_issue_atomic` | `public`, `shared` | `p_company_id uuid, p_branch_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_category text DEFAULT 'general', p_subject text DEFAULT '', p_description text DEFAULT ''` | Verifies tenant session. Generates sequential human-readable `reference_number` (`#BB-00001`). Inserts into `issues` (`status = 'open'`) and creates initial customer message in `issue_messages`. Returns JSON `{ success: true, id, reference_number }`. |
| `add_issue_attachment_atomic` | `public`, `shared` | `p_issue_id uuid, p_message_id uuid, p_storage_path text, p_file_name text, p_content_type text DEFAULT 'application/octet-stream', p_size_bytes bigint DEFAULT 0` | Validates target issue and message existence. Inserts file record into `issue_attachments`. Returns JSON with attachment record. |
| `add_issue_message_atomic` | `public`, `shared` | `p_issue_id uuid, p_user_id uuid, p_sender_name text DEFAULT 'User', p_message text DEFAULT '', p_sender_type text DEFAULT 'customer'` | Inserts message into `issue_messages`. Updates parent issue's `updated_at = NOW()`. Returns created message row. |
| `update_issue_status_atomic` | `public`, `shared` | `p_issue_id uuid, p_status text` | Enforces valid status values (`open`, `in_progress`, `resolved`, `closed`). Updates `issues.status` and `issues.updated_at`. |
| `submit_suggestion_atomic` | `public`, `shared` | `p_company_id uuid, p_branch_id uuid, p_user_id uuid, p_category text, p_title text, p_description text, p_business_benefit text, p_attachments jsonb DEFAULT '[]'` | Validates required fields. Inserts suggestion into `feature_suggestions` and loops attachment records in a single atomic transaction. |
| `submit_customer_review_atomic` | `app`, `public` | `p_company_id uuid, p_branch_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_rating integer DEFAULT NULL, p_comments text DEFAULT NULL` | Enforces rating bounds between 1 and 5. Upserts/inserts review record into `customer_reviews`. |

---

## 4. End-to-End Interaction Map

### 4.1 Help & Support Hub: `support.html`

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ HELP & SUPPORT HUB (support.html)                                                           │
├──────────────────────────────────────────────────────┬──────────────────────────────────────┤
│ Page Header: Title & Subtitle                        │ Top Header Action Buttons:           │
│ "Find answers or reach out to our team"              │ - [User Manual PDF] (#btnUserManual) │
│                                                      │ - [Report an Issue ⌵] (Dropdown)     │
│                                                      │ - [Suggestions] (#btnSuggestions)    │
│                                                      │ - [Review] (#btnReview - Gold button)│
├──────────────────────────────────────────────────────┴──────────────────────────────────────┤
│ Smart Search Bar (#supportSearch):                                                          │
│ [ 🔍 Ask anything? e.g. How do I add a new booking? ] [ × Clear ] [ Search Manual Button ]  │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Search Results Flyout Panel (#searchResultsPanel):                                      │ │
│ │ - Category Pill | Question in bold (Keyword highlighted)                                │ │
│ │ - Answer explanation (Keyword highlighted)                                              │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Support Channels & Contact Cards Grid:                                                      │
│ - Live Chat Card: [Start Chat]                                                              │
│ - Email Support Card: [Email Us] (support@bharathbots.com)                                  │
│ - Phone Support Card: [Call Now] (+91 800-123-4567)                                         │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Floating Modals:                                                                            │
│ 1. Report an Issue Modal (#reportIssueOverlay / #reportIssueModal)                          │
│ 2. Share a Suggestion Modal (#suggestionOverlay / #suggestionModal)                         │
│ 3. Rate Your Experience Modal (#reviewOverlay / #reviewModal)                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Interaction Registry

| # | Element Identity | DOM Selector | Event | Frontend Handler | Target Backend / Payload | Tables Mutated / Read | RBAC / Feature Gate | Error Handling & UI Response |
|---|---|---|---|---|---|---|---|---|
| 1 | **User Manual Download Button** | `#btnUserManual` | `click` | Native link href | Opens User Manual PDF directly from Supabase public storage bucket. | Read-only | All authenticated roles | Opens PDF in new browser tab. |
| 2 | **Report Issue Dropdown Toggle** | `#btnReportIssue` | `click` | `toggleReportDropdown(event)` in `scripts/support/report-dropdown.js` | Toggles `#reportDropdownPanel` visibility and animates `#reportDropdownChevron` rotation (180°). | In-memory | All authenticated roles | Smooth animated dropdown panel toggle. |
| 3 | **Dropdown: Report an Issue Action** | `#reportDropdownPanel button:first-child` | `click` | `handleReportIssueClick()` | Closes dropdown and opens `#reportIssueModal`. | In-memory | All authenticated roles | Resets form fields and sets input focus. |
| 4 | **Dropdown: Issue History Action** | `#reportDropdownPanel button:last-child` | `click` | `window.location.href = 'issue-history.html'` | Navigates user to dedicated issue tracking console. | Read-only | All authenticated roles | Instant page navigation. |
| 5 | **Open Suggestions Modal** | `#btnSuggestions` | `click` | `openSuggestionModal()` in `scripts/suggestion-modal.js` | Resets fields, opens `#suggestionOverlay`, and focuses `#sgCategory`. | In-memory | All authenticated roles | Smooth modal display with backdrop blur. |
| 6 | **Open Review Modal** | `#btnReview` | `click` | `openReviewModal()` in `scripts/review-modal.js` | Resets stars, opens `#reviewOverlay`, prepares rating prompt. | In-memory | All authenticated roles | Gold gradient button with hover elevation. |
| 7 | **Knowledge Base Search Input** | `#supportSearch` | `input` | `onSupportInput(value)` in `scripts/support/support-kb.js` | Debounces search (300ms). When text length $\ge 2$, queries `SUPPORT_KB` across questions and answers, highlights search terms, and renders results. | In-memory KB | All authenticated roles | Reveals clear button (`#searchClearBtn`) and enables manual button. |
| 8 | **Clear Search Button** | `#searchClearBtn` | `click` | `clearSupportSearch()` in `scripts/support/support-kb.js` | Empties search input, hides results flyout panel, and disables manual button. | In-memory | All authenticated roles | Instant clear. |
| 9 | **Trigger Search Manual Button** | `#searchManualBtn` | `click` / `keydown (Enter)` | `triggerSupportSearch()` in `scripts/support/support-kb.js` | Bypasses debounce timer and executes immediate knowledge base search matching all query words. | In-memory KB | All authenticated roles | Shows "Searching..." feedback and renders matching articles. |
| 10 | **Live Chat Channel Button** | `#btnStartChat` | `click` | Event listener in `scripts/support/platform-support.js` | Initiates customer chat widget or opens support contact window. | In-memory / 3rd-party | All authenticated roles | Visual button feedback. |
| 11 | **Email Channel Action** | `#btnEmailSupport` | `click` | `mailto:support@bharathbots.com` | Opens customer's default desktop email client. | External | All authenticated roles | Native email dispatch. |
| 12 | **Phone Hotline Action** | `#btnCallSupport` | `click` | `tel:+918001234567` | Triggers telephone dialer. | External | All authenticated roles | Native tel dialer. |

---

### 4.2 Modal Workflows in Support Hub

#### Modal 1: Report an Issue Modal (`#reportIssueModal`)

| # | Element Identity | DOM Selector | Event | Frontend Handler | Target Backend / Payload | Tables Mutated / Read | Error Handling & UI Response |
|---|---|---|---|---|---|---|---|
| 1 | **Category Select** | `#riCategory` | `change` | `riClearError(this, 'riCategoryHint')` | Selects issue category (Bookings, Payments, POS, Staff, etc.). | In-memory | Removes field error styling. |
| 2 | **Subject Input** | `#riSubject` | `input` | `riClearError(this, 'riSubjectHint')` | Captures issue summary (min 5 chars). | In-memory | Real-time validation. |
| 3 | **Description Textarea** | `#riDescription` | `input` | `riClearError(this, 'riDescriptionHint')` | Captures detailed reproduction steps (min 20 chars). | In-memory | Real-time validation. |
| 4 | **Dropzone / File Input** | `#riDropzone` / `#riFileInput` | `dragover`, `drop`, `change` | `handleRiDrop`, `handleRiFileSelect` in `support-issue-modal.js` | Validates mime type (PNG, JPG, PDF, MP4, ZIP) and size ($\le 10$ MB). Replaces dropzone with file preview chip (`#riFilePreview`). | In-memory | Rejects files $>10$ MB with alert dialog. |
| 5 | **Remove Selected File** | `#riFilePreview button` | `click` | `removeRiFile()` | Clears file state and restores dropzone. | In-memory | Instant reset. |
| 6 | **Submit Issue Button** | `#riSubmitBtn` | `click` | `submitReportIssue()` in `support-issue-modal.js` | Validates category, subject, and description. Invokes `supabase.rpc('submit_issue_atomic', { ... })`. If file present, uploads to `issue-attachments` bucket and invokes `add_issue_attachment_atomic`. | Mutates `issues`, `issue_messages`, `issue_attachments`, Storage bucket | Shows spinner (`Submitting…`). On success, displays confirmation card `#riSuccess` with `#BB-xxxxx` ticket ID and dispatches `report-issue:submitted` event. |
| 7 | **View in Tickets Button** | `#riSuccess button` | `click` | `goToTicketHistory()` | Closes modal and navigates to `issue-history.html?ticket=BB-xxxxx`. | Read-only | Seamless redirection to the newly created ticket discussion thread. |
| 8 | **Close / Cancel Modal** | `.ri-close-btn`, `.ri-btn-cancel` | `click` / `Escape` | `closeReportIssueModal()` | Dismisses modal without submitting. | In-memory | Restores background page scroll. |

#### Modal 2: Share a Suggestion Modal (`#suggestionModal`)

| # | Element Identity | DOM Selector | Event | Frontend Handler | Target Backend / Payload | Tables Mutated / Read | Error Handling & UI Response |
|---|---|---|---|---|---|---|---|
| 1 | **Category Select** | `#sgCategory` | `change` | `sgClearError` | Selects suggestion category. | In-memory | Removes error hint. |
| 2 | **Title Input** | `#sgTitle` | `input` | `sgClearError` | Captures suggestion title (min 5 chars). | In-memory | Real-time validation. |
| 3 | **Description Textarea** | `#sgDescription` | `input` | `sgClearError` | Captures suggestion details (min 15 chars). | In-memory | Real-time validation. |
| 4 | **Business Benefit Textarea** | `#sgWhyUseful` | `input` | None (Optional) | Captures why this feature is valuable. | In-memory | Preserves optional input. |
| 5 | **Multi-Image Upload** | `#sgDropzone` / `#sgFileInput` | `drop`, `change` | `handleSgDrop`, `handleSgFileSelect` in `suggestion-modal.js` | Validates JPEG/PNG/WebP/GIF up to 5 images total. Renders interactive chip list (`#sgFileChips`). | In-memory | Displays banner error if invalid format or $>10$ MB. |
| 6 | **Remove Image Chip** | `#sgFileChips button` | `click` | `removeSgFile(index)` | Removes image from staging queue. | In-memory | Updates chip list. |
| 7 | **Submit Suggestion Button** | `#sgSubmitBtn` | `click` | `_sgSubmit()` in `suggestion-modal.js` | Uploads images to `suggestion-attachments` bucket. Calls `supabase.rpc('submit_suggestion_atomic', { p_company_id, p_branch_id, p_user_id, p_category, p_title, p_description, p_business_benefit, p_attachments })`. | Mutates `feature_suggestions`, Storage bucket | Button shows spinner. If upload fails, cleans up orphaned files and displays error banner. On success, displays `#sgSuccess`. |
| 8 | **Close / Done Button** | `.sg-close-btn`, `.sg-btn-cancel`, `#sgSuccess button` | `click` / `Escape` | `closeSuggestionModal()` | Closes modal and resets form. | In-memory | Instant dismiss. |

#### Modal 3: Rate Your Experience Modal (`#reviewModal`)

| # | Element Identity | DOM Selector | Event | Frontend Handler | Target Backend / Payload | Tables Mutated / Read | Error Handling & UI Response |
|---|---|---|---|---|---|---|---|
| 1 | **Star Rating Buttons (1-5)** | `.rv-star-btn[data-rating="N"]` | `mouseover`, `mouseout`, `click` | `rvStarHover`, `rvResetStarHover`, `rvStarSelect` in `review-modal.js` | Dynamically highlights stars in gold. Sets `_selectedReviewRating = N`. Updates helper text label (`1 star Poor` $\rightarrow$ `5 stars Excellent!`). | In-memory | Interactive visual feedback. |
| 2 | **Comments Textarea** | `#rvComments` | `input` | None (Optional) | Captures optional qualitative feedback comments. | In-memory | Maxlength 2000 chars. |
| 3 | **Submit Review Button** | `#rvSubmitBtn` | `click` | `submitReview()` in `review-modal.js` | Validates rating selection ($\ge 1$). Dispatches `supabase.rpc('submit_customer_review_atomic', { p_company_id, p_branch_id, p_user_id, p_rating, p_comments })`. | Mutates `customer_reviews` | If star rating missing, triggers CSS shake animation (`rvShake`) on stars row. On success, transitions to `#rvSuccess`. |
| 4 | **Close / Done Button** | `.rv-close-btn`, `.rv-btn-cancel`, `#rvSuccess button` | `click` / `Escape` | `closeReviewModal()` | Closes modal and resets rating state. | In-memory | Instant dismiss. |

---

### 4.3 Issue History & Discussion Console: `issue-history.html`

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ISSUE HISTORY & DISCUSSION CONSOLE (issue-history.html)                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Top Bar: [← Back to Support] | Actions: [🔄 Refresh Tickets] | [+ New Issue Button]         │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Page Title Row: Support Tickets | [Total Badge: 8 Tickets]                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Filter Controls Card:                                                                       │
│ - Status Tabs: [All (8)] [Open (3)] [In Progress (2)] [Resolved (2)] [Closed (1)]           │
│ - Filters Row: [ 🔍 Search by ID, subject, keyword… ] | [Category Dropdown] | [Reset Filters]│
├──────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ LEFT COLUMN: Ticket Cards List (40%)     │ RIGHT COLUMN: Ticket Discussion Console (60%)    │
│ - Selected Card Styling (Indigo Border)  │ - Header: Reference ID, Status Pill, Category Tag│
│ - Reference ID (#BB-00003)               │ - Actions: [✓ Mark as Resolved] / [Reopen Ticket]│
│ - Status Badge (Open / In Progress / ...)│ - Original Issue Card with Initial Attachment    │
│ - Subject & Latest Message Snippet       │ - Chronological Follow-Up Message Thread Bubble  │
│ - Category Tag & Message Count Bubble    │ - Composer Textarea with Ctrl+Enter shortcut     │
│ - Relative Time Indicator                │ - [📎 Attach File] + [Send Reply Button]         │
└──────────────────────────────────────────┴──────────────────────────────────────────────────┘
```

#### Detailed Interaction Registry

| # | Element Identity | DOM Selector | Event | Frontend Handler | Target Backend / Payload | Tables Mutated / Read | RBAC / Feature Gate | Error Handling & UI Response |
|---|---|---|---|---|---|---|---|---|
| 1 | **Back to Support Link** | `.ih-back-link` | `click` | Native link href `support.html` | Returns user to the Help & Support Hub. | Read-only | All authenticated roles | Instant page navigation. |
| 2 | **Refresh Tickets Button** | `#btnRefreshTickets` | `click` | `refreshTickets()` in `scripts/support/issue-history.js` | Invokes `getIssues()`, updates badge counts, re-renders ticket cards and active thread. | Read `issues`, `issue_messages` | All authenticated roles | Shows "Tickets refreshed" toast notification. |
| 3 | **New Issue Header Button** | `#btnNewIssueHeader` | `click` | `openReportIssueModal()` | Opens `#reportIssueModal` to create a new ticket without leaving the console. | In-memory | All authenticated roles | Smooth modal display. |
| 4 | **Status Filter Tab: All** | `.ih-status-tab[data-status="all"]` | `click` | `setStatusFilter('all', this)` in `issue-history.js` | Sets active tab, displays all tickets regardless of status, selects first matching ticket. | In-memory | All authenticated roles | Updates card list and thread selection. |
| 5 | **Status Filter Tab: Open** | `.ih-status-tab[data-status="open"]` | `click` | `setStatusFilter('open', this)` | Filters list to tickets with `status = 'open'`. | In-memory | All authenticated roles | Real-time client-side filter. |
| 6 | **Status Filter Tab: In Progress** | `.ih-status-tab[data-status="in_progress"]` | `click` | `setStatusFilter('in_progress', this)` | Filters list to tickets with `status = 'in_progress'`. | In-memory | All authenticated roles | Real-time client-side filter. |
| 7 | **Status Filter Tab: Resolved** | `.ih-status-tab[data-status="resolved"]` | `click` | `setStatusFilter('resolved', this)` | Filters list to tickets with `status = 'resolved'`. | In-memory | All authenticated roles | Real-time client-side filter. |
| 8 | **Status Filter Tab: Closed** | `.ih-status-tab[data-status="closed"]` | `click` | `setStatusFilter('closed', this)` | Filters list to tickets with `status = 'closed'`. | In-memory | All authenticated roles | Real-time client-side filter. |
| 9 | **Search Tickets Input** | `#ihSearchInput` | `input` | `handleSearch()` in `issue-history.js` | Matches query against `reference_number`, `id`, `subject`, `description`, and `category`. Updates card list dynamically. | In-memory | All authenticated roles | Instant filter; displays empty state if no matches. |
| 10 | **Category Filter Dropdown** | `#categoryFilter` | `change` | `applyFilters()` in `issue-history.js` | Filters tickets by category (Bookings, Payments, POS, Staff, etc.). | In-memory | All authenticated roles | Dynamically filters card list. |
| 11 | **Reset All Filters Button** | `button.ih-btn-secondary` | `click` | `resetAllFilters()` in `issue-history.js` | Resets status tab to All, category to All, search box to empty, and re-renders card list. | In-memory | All authenticated roles | Restores full ticket view. |
| 12 | **Ticket Card Selection** | `.ih-ticket-card` | `click` | `selectTicket(id)` in `issue-history.js` | Highlights card with active border, fetches ticket thread and attachments via `getIssueThread(id)`, renders message bubbles, and auto-scrolls to bottom. | Read `issue_messages`, `issue_attachments`, Storage bucket | All authenticated roles | Smooth thread load with signed URLs for attachments. |
| 13 | **Mark as Resolved Button** | `#btnMarkResolved` | `click` | `updateTicketStatusHandler(ticketId, 'resolved')` | Calls `supabase.rpc('update_issue_status_atomic', { p_issue_id, p_status: 'resolved' })`. Updates status badge to green "Resolved". | Mutates `issues` | All authenticated roles | Shows status update toast. Replaces button with "Reopen Ticket". |
| 14 | **Reopen Ticket Button** | `#btnReopenTicket` | `click` | `updateTicketStatusHandler(ticketId, 'open')` | Calls `supabase.rpc('update_issue_status_atomic', { p_issue_id, p_status: 'open' })`. Updates status badge to blue "Open". | Mutates `issues` | All authenticated roles | Shows status update toast. Replaces button with "Mark as Resolved". |
| 15 | **Reply File Attachment Button** | `#btnAttachReplyFile` | `click` | Triggers hidden input `#replyFileInput.click()` | Opens file picker for reply attachment (PNG, JPG, PDF up to 10 MB). | In-memory | All authenticated roles | Displays selected file badge with remove button. |
| 16 | **Remove Reply File** | `#replyFileBadge button` | `click` | `removeReplyFile()` in `issue-history.js` | Clears pending file from reply staging. | In-memory | All authenticated roles | Hides file badge. |
| 17 | **Reply Textarea** | `#replyTextarea` | `keydown` | `handleReplyKey(e)` | Captures customer message. Pressing `Ctrl+Enter` or `Cmd+Enter` immediately triggers `sendReply()`. | In-memory | All authenticated roles | Convenient keyboard shortcut. |
| 18 | **Send Reply Button** | `.ih-composer button.ih-btn-primary` | `click` | `sendReply()` in `issue-history.js` | Validates message. Calls `sendFollowUp({ issueId, message, file })`: uploads file to `issue-attachments`, calls `add_issue_message_atomic` and `add_issue_attachment_atomic`. If ticket was resolved/closed, automatically reopens it via `update_issue_status_atomic`. | Mutates `issue_messages`, `issue_attachments`, `issues`, Storage bucket | All authenticated roles | Button shows "Sending…". Appends new bubble to thread and displays success toast. |
| 19 | **Attachment Download / Preview Link** | `.ih-attachment-pill` | `click` | Native link href with signed URL | Opens attachment in new tab or initiates download using time-limited signed URL. | Read Storage | All authenticated roles | Secure file download. |
| 20 | **Mobile Back to List Button** | `.ih-mobile-back` | `click` | `backToTicketListMobile()` in `issue-history.js` | On mobile screens ($\le 860$px), toggles view back from detail panel to ticket cards list. | In-memory | All authenticated roles | Responsive mobile navigation. |

---

## 5. Security & Zero-Trust Verification

1. **Zero Direct Client Writes**:
   - `support.html`, `issue-history.html`, `scripts/issue-service.js`, `scripts/support/support-issue-modal.js`, `scripts/support/issue-history.js`, `scripts/suggestion-modal.js`, and `scripts/review-modal.js` contain **zero** direct SQL table mutations.
   - All mutations execute via `submit_issue_atomic`, `add_issue_attachment_atomic`, `add_issue_message_atomic`, `update_issue_status_atomic`, `submit_suggestion_atomic`, and `submit_customer_review_atomic`.
2. **PostgreSQL Security Definer & RLS**:
   - Stored procedures enforce tenant validation via `shared.verify_tenant_access(p_company_id, NULL)`.
   - Tenants can only view issues and messages matching their authenticated `company_id`.
3. **Signed Storage URLs**:
   - File attachments are not stored with permanent public URLs. Signed URLs are generated dynamically with a 1-hour expiration.

---

## 6. Developer Reference Summary

| Property | Details |
|---|---|
| **Hub Page** | `support.html` (Knowledge Base & Support Channels) |
| **Ticketing Console** | `issue-history.html` (Tickets List & Message Thread) |
| **Core Service** | `scripts/issue-service.js` |
| **Modal Modules** | `support-issue-modal.js`, `suggestion-modal.js`, `review-modal.js` |
| **Knowledge Base** | `scripts/support/support-kb.js` |
| **PostgreSQL Stored Procedures** | `submit_issue_atomic`, `add_issue_attachment_atomic`, `add_issue_message_atomic`, `update_issue_status_atomic`, `submit_suggestion_atomic`, `submit_customer_review_atomic` |
| **Storage Buckets** | `issue-attachments` (Tickets & Replies), `suggestion-attachments` (Feature Requests) |
| **Audit Status** | ✅ 100% Migrated, Verified, Zero Direct Client Mutations |

