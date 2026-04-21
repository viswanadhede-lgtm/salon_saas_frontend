// dashboard.js - Logic for the main application dashboard

document.addEventListener('DOMContentLoaded', () => {

    // ----------------------------------------------------------------
    // 1. AUTHENTICATION & DATA CHECK
    // ----------------------------------------------------------------
    // Fixed key to match the one set during sign-in
    const authToken = localStorage.getItem('token');
    
    // Redirect unauthenticated users
    if (!authToken) {
        console.warn('No token found, redirecting to sign in');
        // window.location.href = 'signin.html'; // In a real environment uncomment this
    } else {
        // Set interval logic has been centralized to global-auth-guard.js
    }

    // Read stored data
    const companyId = localStorage.getItem('company_id');
    const branchId = localStorage.getItem('branch_id');
    const selectedPlan = localStorage.getItem('selected_plan') || 'Growth';

    // Update UI with stored data
    updateHeaderBadges(selectedPlan);
    initBranchSwitcher(branchId);

    // ----------------------------------------------------------------
    // 2. SIDEBAR TOGGLE LOGIC (Lovable Style)
    // ----------------------------------------------------------------
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    
    // Check local storage for sidebar preference
    const sidebarState = localStorage.getItem('sidebar_collapsed');
    if (sidebarState === 'true') {
        sidebar.classList.add('collapsed');
        toggleBtn.setAttribute('title', 'Open sidebar');
    }

    // Toggle button click event — guard against double-bind from page-level scripts
    if (toggleBtn && !toggleBtn.dataset.tbInit) {
        toggleBtn.dataset.tbInit = '1';
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebar_collapsed', isCollapsed);
            if(isCollapsed) {
                toggleBtn.setAttribute('title', 'Open sidebar');
            } else {
                toggleBtn.setAttribute('title', 'Close sidebar');
            }
        });
    }

    // ----------------------------------------------------------------
    // 3. SUBMENU TOGGLE LOGIC
    // ----------------------------------------------------------------
    const submenuToggles = document.querySelectorAll('.submenu-toggle');
    
    submenuToggles.forEach(toggle => {
        if (toggle.dataset.tbInit) return; // already bound by page-level script
        toggle.dataset.tbInit = '1';
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const parentItem = toggle.closest('.has-submenu');
            if (!parentItem) return;
            parentItem.classList.toggle('submenu-open');
            if (sidebar && sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                localStorage.setItem('sidebar_collapsed', 'false');
                if (toggleBtn) toggleBtn.setAttribute('title', 'Close sidebar');
            }
        });
    });

    // Auto-open any submenu that contains the currently active page link
    document.querySelectorAll('.nav-item.has-submenu').forEach(item => {
        if (item.querySelector('.submenu-link.active')) {
            item.classList.add('submenu-open');
        }
    });

    // Handle tooltips logic...
    // When sidebar is NOT collapsed, we want to disable default title tooltips 
    // to prevent double-text annoyance. 
    const navItems = document.querySelectorAll('.nav-item');
    
    // This is optional refinement but makes the UX much cleaner 
    // compared to default browser tooltips ALWAYS showing.

    // ----------------------------------------------------------------
    // 3. SECURE API CALL STRUCTURE (REAL)
    // ----------------------------------------------------------------
    async function fetchAndRenderDashboardKPIs(currentBranchId) {
        if (!currentBranchId) return;
        
        try {
            // Dynamically import the Supabase client (since dashboard.js is not a module)
            const { supabase } = await import('./lib/supabase.js');

            const { data, error } = await supabase.rpc('get_dashboard_today_kpis', { 
                p_branch_id: currentBranchId 
            });

            if (error) throw error;
            
            if (data) {
                // Formatting Helpers
                const fmtTrend = (val) => `<i data-feather="trending-${val >= 0 ? 'up' : 'down'}"></i> ${Math.abs(val)}%`;
                const trendClass = (val) => `stat-trend ${val >= 0 ? 'positive' : 'negative'}`;

                // Card 1
                const elBookings = document.getElementById('kpiTodayBookings');
                if (elBookings) {
                    elBookings.textContent = data.todays_bookings;
                    const bTrendEl = document.getElementById('kpiTodayBookingsTrend');
                    bTrendEl.innerHTML = `${fmtTrend(data.booking_trend)} vs yesterday`;
                    bTrendEl.className = trendClass(data.booking_trend);
                }

                // Card 2
                const elAppts = document.getElementById('kpiCompletedAppts');
                if (elAppts) {
                    elAppts.innerHTML = `${data.completed_appointments} <span class="stat-value-sub" id="kpiCompletedApptsSub">/ ${data.todays_bookings} completed</span>`;
                    const cTrendEl = document.getElementById('kpiCompletedApptsTrend');
                    cTrendEl.innerHTML = `<i data-feather="trending-${data.completion_rate >= 50 ? 'up' : 'down'}"></i> ${data.completion_rate}% completion rate`;
                    cTrendEl.className = trendClass(data.completion_rate - 50);
                }

                // Card 3
                const elNoShows = document.getElementById('kpiNoShows');
                if (elNoShows) {
                    elNoShows.innerHTML = `No-shows: <strong>${data.no_shows}</strong>`;
                    document.getElementById('kpiCancelled').innerHTML = `Cancelled: <strong>${data.cancelled}</strong>`;
                }

                // Card 4
                const elRevenue = document.getElementById('kpiTodayRevenue');
                if (elRevenue) {
                    elRevenue.textContent = `₹${Number(data.todays_revenue).toLocaleString('en-IN')}`;
                    const rTrendEl = document.getElementById('kpiTodayRevenueTrend');
                    rTrendEl.innerHTML = `${fmtTrend(data.revenue_trend)} vs yesterday`;
                    rTrendEl.className = trendClass(data.revenue_trend);
                }

                if (window.feather) feather.replace();
            }
        } catch (err) {
            console.error("Error fetching Dashboard KPIs:", err);
        }
    }

    // Call on load if branchId exists
    if (branchId) {
        fetchAndRenderDashboardKPIs(branchId);
    }
    
    // Attach dynamically to the global so branch switcher can use it
    window.fetchAndRenderDashboardKPIs = fetchAndRenderDashboardKPIs;

    // ----------------------------------------------------------------
    // 4. APPOINTMENTS TAB LOGIC
    // ----------------------------------------------------------------
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                
                // Update buttons
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                
                // Update panes
                tabPanes.forEach(pane => {
                    const isTarget = pane.id === `tab${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`;
                    pane.classList.toggle('active', isTarget);
                });
            });
        });
    }

    // ----------------------------------------------------------------
    // 5. PROFILE DROPDOWN LOGIC
    // ----------------------------------------------------------------

    // Use event delegation for robust dropdown toggling across all pages
    document.addEventListener('click', (e) => {
        const avatarBtn = document.getElementById('avatarBtn');
        const profileMenu = document.getElementById('profileMenu');
        const profileBackdrop = document.getElementById('profileBackdrop');
        const userProfileDropdown = document.getElementById('userProfileDropdown');
        
        if (!avatarBtn || !profileMenu) return;

        // Ensure roles/billing options are initialized when needed
        const currentUserRole = localStorage.getItem('user_role') || 'Owner'; 
        const roleTextEl = profileMenu.querySelector('.dropdown-role');
        const billingMenuItem = document.getElementById('billingMenuItem');
        if (roleTextEl && roleTextEl.textContent !== currentUserRole) {
            roleTextEl.textContent = currentUserRole;
        }
        if (currentUserRole.toLowerCase() === 'staff' && billingMenuItem) {
            billingMenuItem.style.display = 'none';
        }

        const closeProfileMenu = () => {
            profileMenu.classList.remove('show');
            if (profileBackdrop) profileBackdrop.classList.remove('active');
        };

        const openProfileMenu = () => {
            profileMenu.classList.add('show');
            if (profileBackdrop) profileBackdrop.classList.add('active');
        };

        // 1. Clicked on the Avatar button
        const avatarClick = e.target.closest('#avatarBtn');
        if (avatarClick) {
            e.preventDefault();
            e.stopPropagation();
            profileMenu.classList.contains('show') ? closeProfileMenu() : openProfileMenu();
            return;
        }

        // 2. Clicked on the Backdrop
        const backdropClick = e.target === profileBackdrop;
        if (backdropClick) {
            e.preventDefault();
            e.stopPropagation();
            closeProfileMenu();
            return;
        }

        // 3. Clicked Outside (while menu is open)
        if (profileMenu.classList.contains('show') && userProfileDropdown && !userProfileDropdown.contains(e.target)) {
            closeProfileMenu();
        }
    });

    // ----------------------------------------------------------------
    // 6. GENERIC PROFILE SECTION MODAL LOGIC
    // ----------------------------------------------------------------
    const genericModalOverlay = document.getElementById('genericModalOverlay');
    const genericModalTitle   = document.getElementById('genericModalTitle');
    const genericModalSubtitle = document.getElementById('genericModalSubtitle');
    const closeGenericModal   = document.getElementById('closeGenericModal');
    const btnCloseGenericModal = document.getElementById('btnCloseGenericModal');

    // Config for each menu item: selector, title, subtitle
    const menuModalConfig = [
        {
            selector: '.dropdown-item [data-feather="user"]',
            title: 'Profile',
            subtitle: 'View and manage your personal profile.'
        },
        {
            selector: '.dropdown-item [data-feather="calendar"]',
            title: 'Schedule',
            subtitle: 'View and manage your working schedule.'
        },
        {
            selector: '.dropdown-item [data-feather="credit-card"]',
            title: 'Billing',
            subtitle: 'Manage your subscription and billing details.'
        },
        {
            selector: '.dropdown-item [data-feather="settings"]',
            title: 'Settings',
            subtitle: 'Configure your account preferences.'
        },
        {
            selector: '.dropdown-item [data-feather="help-circle"]',
            title: 'Support',
            subtitle: 'Get help and contact our support team.'
        }
    ];

    function openGenericModal(title, subtitle) {
        if (!genericModalOverlay) return;
        genericModalTitle.textContent = title;
        genericModalSubtitle.textContent = subtitle;

        // Show profile form only for "Profile", show placeholder for all others
        const profileContent = document.getElementById('profileContent');
        const settingsContent = document.getElementById('settingsContent');
        const placeholderContent = document.getElementById('genericPlaceholderContent');
        const footerSave = document.getElementById('btnSaveGenericModal');

        if (title === 'Profile') {
            if (profileContent)    { profileContent.style.display = 'grid'; }
            if (settingsContent)   { settingsContent.style.display = 'none'; }
            if (placeholderContent){ placeholderContent.style.display = 'none'; }
            if (footerSave)        { footerSave.style.display = ''; }
        } else if (title === 'Settings') {
            if (profileContent)    { profileContent.style.display = 'none'; }
            if (settingsContent)   { settingsContent.style.display = 'grid'; }
            if (placeholderContent){ placeholderContent.style.display = 'none'; }
            if (footerSave)        { footerSave.style.display = ''; }
            
            // SIMULATE UPDATE CHECK (Disabled until backend connection)
            /*
            setTimeout(() => {
                const statusEl = document.getElementById('settingsStatus');
                const updateBtn = document.getElementById('btnUpdateApp');
                // Only mock if it's currently up to date
                if (statusEl && updateBtn && statusEl.textContent === 'Up to date') {
                    statusEl.textContent = 'Update Available';
                    statusEl.style.color = '#f59e0b'; // Amber for attention
                    updateBtn.style.display = 'block';
                }
            }, 1000);
            */
        } else {
            if (profileContent)    { profileContent.style.display = 'none'; }
            if (settingsContent)   { settingsContent.style.display = 'none'; }
            if (placeholderContent){ placeholderContent.style.display = 'flex'; }
            if (footerSave)        { footerSave.style.display = 'none'; }
        }

        genericModalOverlay.classList.add('active');
        if (window.feather) feather.replace();
    }

    function closeGenericModalFn() {
        if (genericModalOverlay) genericModalOverlay.classList.remove('active');
    }

    // Bind each dropdown item by its visible text label
    const menuModalLabels = {
        'Profile':  { title: 'Profile',  subtitle: 'View and manage your personal profile.' },
        'Schedule': { title: 'Schedule', subtitle: 'View and manage your working schedule.' },
        'Billing':  { title: 'Billing',  subtitle: 'Manage your subscription and billing details.' },
        'Settings': { title: 'Settings', subtitle: 'Configure your account preferences.' },
        'Support':  { title: 'Support',  subtitle: 'Get help and contact our support team.' }
    };

    document.querySelectorAll('.dropdown-item').forEach(link => {
        const spanText = link.querySelector('span')?.textContent?.trim();
        if (spanText && menuModalLabels[spanText]) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // Close profile dropdown first
                const pMenu = document.getElementById('profileMenu');
                const pBackdrop = document.getElementById('profileBackdrop');
                if (pMenu) pMenu.classList.remove('show');
                if (pBackdrop) pBackdrop.classList.remove('active');

                if (spanText === 'Schedule') {
                    openScheduleModal();
                } else if (spanText === 'Billing') {
                    window.location.href = 'billing.html';
                } else if (spanText === 'Support') {
                    window.location.href = 'support.html';
                } else {
                    const { title, subtitle } = menuModalLabels[spanText];
                    openGenericModal(title, subtitle);
                }
            });
        }
    });

    // Close via X button and footer Close button
    if (closeGenericModal) closeGenericModal.addEventListener('click', closeGenericModalFn);
    if (btnCloseGenericModal) btnCloseGenericModal.addEventListener('click', closeGenericModalFn);

    // Close on clicking the overlay backdrop
    if (genericModalOverlay) {
        genericModalOverlay.addEventListener('click', (e) => {
            if (e.target === genericModalOverlay) closeGenericModalFn();
        });
    }

    // ----------------------------------------------------------------
    // 7. SCHEDULE MODAL LOGIC
    // ----------------------------------------------------------------
    const scheduleModalOverlay = document.getElementById('scheduleModalOverlay');
    const closeScheduleModalBtn = document.getElementById('closeScheduleModal');
    const btnCloseScheduleFooter = document.getElementById('btnCloseScheduleFooter');
    
    // Tabs
    const tabBtnThisWeek = document.getElementById('tabBtnThisWeek');
    const tabBtnNextWeek = document.getElementById('tabBtnNextWeek');
    const paneThisWeek = document.getElementById('paneThisWeek');
    const paneNextWeek = document.getElementById('paneNextWeek');

    function openScheduleModal() {
        if (scheduleModalOverlay) {
            scheduleModalOverlay.classList.add('active');
            // Reset to default tab (This Week)
            if (tabBtnThisWeek) tabBtnThisWeek.click();
        }
    }

    function closeScheduleModalFn() {
        if (scheduleModalOverlay) scheduleModalOverlay.classList.remove('active');
    }

    if (closeScheduleModalBtn) closeScheduleModalBtn.addEventListener('click', closeScheduleModalFn);
    if (btnCloseScheduleFooter) btnCloseScheduleFooter.addEventListener('click', closeScheduleModalFn);
    
    if (scheduleModalOverlay) {
        scheduleModalOverlay.addEventListener('click', (e) => {
            if (e.target === scheduleModalOverlay) closeScheduleModalFn();
        });
    }

    // Tab switching logic
    if (tabBtnThisWeek && tabBtnNextWeek && paneThisWeek && paneNextWeek) {
        tabBtnThisWeek.addEventListener('click', () => {
            // Update buttons
            tabBtnThisWeek.classList.add('active');
            tabBtnNextWeek.classList.remove('active');
            tabBtnThisWeek.style.color = '#1e3a8a';
            tabBtnThisWeek.style.borderBottomColor = '#1e3a8a';
            tabBtnNextWeek.style.color = '#64748b';
            tabBtnNextWeek.style.borderBottomColor = 'transparent';
            
            // Update panes
            paneThisWeek.style.display = 'block';
            paneNextWeek.style.display = 'none';
        });

        tabBtnNextWeek.addEventListener('click', () => {
            // Update buttons
            tabBtnNextWeek.classList.add('active');
            tabBtnThisWeek.classList.remove('active');
            tabBtnNextWeek.style.color = '#1e3a8a';
            tabBtnNextWeek.style.borderBottomColor = '#1e3a8a';
            tabBtnThisWeek.style.color = '#64748b';
            tabBtnThisWeek.style.borderBottomColor = 'transparent';
            
            // Update panes
            paneNextWeek.style.display = 'block';
            paneThisWeek.style.display = 'none';
        });
    }

    // ----------------------------------------------------------------
    // Change Photo — update modal avatar and header avatar live
    // ----------------------------------------------------------------
    const profilePhotoInput = document.getElementById('profilePhotoInput');
    if (profilePhotoInput) {
        profilePhotoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const dataUrl = ev.target.result;
                // Update modal avatar
                const modalAvatar = document.getElementById('profileAvatarImg');
                if (modalAvatar) modalAvatar.src = dataUrl;
                // Update header avatar
                const headerAvatar = document.querySelector('#avatarBtn img');
                if (headerAvatar) headerAvatar.src = dataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    // App Update Logic Simulation
    const btnUpdateApp = document.getElementById('btnUpdateApp');
    if (btnUpdateApp) {
        btnUpdateApp.addEventListener('click', () => {
            const statusEl = document.getElementById('settingsStatus');
            btnUpdateApp.textContent = 'Updating...';
            btnUpdateApp.disabled = true;
            
            setTimeout(() => {
                btnUpdateApp.style.display = 'none';
                btnUpdateApp.textContent = 'Update';
                btnUpdateApp.disabled = false;
                if (statusEl) {
                    statusEl.textContent = 'Up to date';
                    statusEl.style.color = '#10b981'; // Green
                }
                
                // Show toast
                const toast = document.getElementById('toastNotification');
                if (toast) {
                    const originalText = toast.textContent;
                    toast.textContent = 'App successfully updated to latest version!';
                    toast.classList.add('show');
                    setTimeout(() => {
                        toast.classList.remove('show');
                        setTimeout(() => { toast.textContent = originalText; }, 300); // Reset text after fading out
                    }, 3000);
                }
            }, 2000); // Simulate 2s update process
        });
    }
});

// Helper functions for UI mapping

function updateHeaderBadges(planName) {
    const badge = document.getElementById('headerPlanBadge');
    if (badge && planName) {
        badge.textContent = planName;
    }
}

async function loadBranches(storedBranchId) {
    const branchSelect = document.getElementById('branchSelect');
    if (!branchSelect) return;

    try {
        const { supabase } = await import('./lib/supabase.js');
        const { data: branches, error } = await supabase
            .from('branches')
            .select('branch_id, branch_name');

        if (error) throw error;

        if (branches && branches.length > 0) {
            branchSelect.innerHTML = branches.map(b => 
                `<option value="${b.branch_id}">${b.branch_name}</option>`
            ).join('');

            // Check if stored ID exists
            const exists = branches.some(b => b.branch_id === storedBranchId);
            if (exists) {
                branchSelect.value = storedBranchId;
            } else {
                // Default to first branch if no match
                const firstId = branches[0].branch_id;
                branchSelect.value = firstId;
                localStorage.setItem('branch_id', firstId);
                refreshAllData(firstId);
            }
        }
    } catch (err) {
        console.error("Error loading branches:", err);
    }
}

function refreshAllData(branchId) {
    // 1. Dashboard specific
    if (typeof window.fetchAndRenderDashboardKPIs === 'function') {
        window.fetchAndRenderDashboardKPIs(branchId);
    }
    // 2. Sub-pages (Today's Bookings, Completed, No-shows)
    if (typeof window.initPage === 'function') {
        window.initPage();
    }
    // 3. Revenue sub-page
    if (typeof window.calculateAndRenderRevenue === 'function') {
        window.calculateAndRenderRevenue();
    }
}

function initBranchSwitcher(storedBranchId) {
    const branchSelect = document.getElementById('branchSelect');
    if (!branchSelect) return;
    
    // Load dynamic list
    loadBranches(storedBranchId);
    
    branchSelect.addEventListener('change', (e) => {
        const newBranchId = e.target.value;
        localStorage.setItem('branch_id', newBranchId);
        console.log(`Switched to branch: ${newBranchId}. Refreshing...`);
        refreshAllData(newBranchId);
    });
}


// ----------------------------------------------------------------
// BOOKINGS PAGE SPECIFIC LOGIC (TABS, FILTERS, DATA)
// ----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // 1. Tab Switching Logic
    const tabBtns = document.querySelectorAll('.bookings-tab-btn');
    const tabPanes = document.querySelectorAll('.bookings-tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    // 2. Filter Dropdown Logic
    const filterBtn = document.getElementById('btnFilterBookings');
    const filterMenu = document.getElementById('filterDropdownMenu');
    const filterContainer = document.getElementById('bookingsFilterContainer');
    const btnFilterReset = document.getElementById('btnFilterReset');
    const btnFilterApply = document.getElementById('btnFilterApply');

    if (filterBtn && filterMenu && filterContainer) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (filterMenu.classList.contains('show') && !filterContainer.contains(e.target)) {
                filterMenu.classList.remove('show');
            }
        });

        // Prevent closing when clicking inside menu
        filterMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        btnFilterApply.addEventListener('click', () => {
            filterMenu.classList.remove('show');
            // Show toast for demo
            const toast = document.getElementById('toastNotification');
            if (toast) {
                toast.textContent = 'Filters applied successfully';
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3000);
            }
        });

        btnFilterReset.addEventListener('click', () => {
            // Uncheck status except booked and completed
            const checkboxes = filterMenu.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                if(cb.value === 'booked' || cb.value === 'completed' || cb.value === 'all') {
                    cb.checked = true;
                } else {
                    cb.checked = false;
                }
            });
            // Reset radio to 7 days
            const radio7days = filterMenu.querySelector('input[type="radio"][value="7days"]');
            if (radio7days) radio7days.checked = true;
        });
    }

    // 3. New Booking Navigation
    const btnNewBookingPage = document.getElementById('btnNewBookingPage');
    if (btnNewBookingPage) {
        btnNewBookingPage.addEventListener('click', () => {
            // For now, trigger the existing modal
            const existingNewBtn = document.getElementById('btnNewBooking');
            if (existingNewBtn) existingNewBtn.click();
        });
    }

    // 4. Populate Tables and Calendar (Mock Data)
    // Skip mock data population if on the bookings page (bookings.js handles it)
    const isBookingsPage = window.location.pathname.includes('bookings.html');
    if (document.getElementById('tbTableBodyToday') && !isBookingsPage) {
        populateTodayTable();
        populateAllBookingsTable();
        populateCalendarGrid();
    }
});

// Mock Booking Data generators
function generateActionsMenu(id) {
    return `
        <button class="tb-action-btn" onclick="toggleActions('menu-${id}', event)">
            Actions <i data-feather="chevron-down" style="width:14px; height:14px;"></i>
        </button>
        <div class="tb-actions-menu" id="menu-${id}" style="display:none;">
            <button class="tb-menu-item"><i data-feather="eye"></i> View Details</button>
            <button class="tb-menu-item"><i data-feather="edit-2"></i> Edit Booking</button>
            <button class="tb-menu-item"><i data-feather="message-square"></i> Send Message</button>
            <button class="tb-menu-item"><i data-feather="repeat"></i> Rebook</button>
            <button class="tb-menu-item danger"><i data-feather="x-circle"></i> Cancel Booking</button>
        </div>
    `;
}

function getStatusPill(status) {
    status = status.toLowerCase();
    if (status === 'booked') return '<span class="tb-status-pill tb-status-booked">Booked</span>';
    if (status === 'completed') return '<span class="tb-status-pill tb-status-completed">Completed</span>';
    if (status === 'no-show') return '<span class="tb-status-pill tb-status-noshow">No-Show</span>';
    if (status === 'cancelled') return '<span class="tb-status-pill tb-status-cancelled">Cancelled</span>';
    return `<span class="tb-status-pill">${status}</span>`;
}

function getPaymentPill(status) {
    status = status.toLowerCase();
    if (status === 'paid') return '<span class="tb-status-pill tb-payment-paid">Paid</span>';
    if (status === 'pending') return '<span class="tb-status-pill tb-payment-pending">Pending</span>';
    if (status === 'partial') return '<span class="tb-status-pill tb-payment-partial">Partial</span>';
    return `<span class="tb-status-pill">${status}</span>`;
}

// Global action handler
window.toggleActions = function(menuId, event) {
    event.stopPropagation();
    const menu = document.getElementById(menuId);
    
    // Close all other menus
    document.querySelectorAll('.tb-actions-menu').forEach(m => {
        if (m.id !== menuId) m.style.display = 'none';
    });
    
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
        
        // Position menu relative to button
        const btnRect = event.currentTarget.getBoundingClientRect();
        menu.style.top = (btnRect.bottom + 4) + 'px';
        
        // Check right edge
        const menuWidth = 190;
        if (btnRect.right - menuWidth < 0) {
            menu.style.left = btnRect.left + 'px';
            menu.style.right = 'auto';
        } else {
            menu.style.right = (window.innerWidth - btnRect.right) + 'px';
            menu.style.left = 'auto';
        }
    }
};

document.addEventListener('click', () => {
    document.querySelectorAll('.tb-actions-menu').forEach(m => {
        m.style.display = 'none';
    });
});

function populateTodayTable() {
    const tbody = document.getElementById('tbTableBodyToday');
    if (!tbody) return;

    const todayData = [
        { id: "T1", bookingId: "BK-2041", customer: "Priya Sharma", time: "10:00 AM", service: "Hair Color & Styling", staff: "Michael", status: "completed", amount: "₹2,500", payment: "paid" },
        { id: "T2", bookingId: "BK-2042", customer: "Rahul Verma", time: "11:30 AM", service: "Men's Haircut", staff: "Sarah", status: "booked", amount: "₹500", payment: "pending" },
        { id: "T3", bookingId: "BK-2043", customer: "Anita Desai", time: "01:00 PM", service: "Deep Tissue Massage", staff: "Anjali", status: "booked", amount: "₹3,000", payment: "partial" },
        { id: "T4", bookingId: "BK-2044", customer: "Sneha Patel", time: "03:00 PM", service: "Facial Cleansing", staff: "Sarah", status: "noshow", amount: "₹1,200", payment: "pending" },
        { id: "T5", bookingId: "BK-2045", customer: "Vikram Singh", time: "04:30 PM", service: "Beard Grooming", staff: "Michael", status: "booked", amount: "₹400", payment: "paid" }
    ];

    let html = '';
    todayData.forEach((b, idx) => {
        const statusClass = 'tb-status-' + b.status;
        const statusLabel = b.status === 'noshow' ? 'No-show' : b.status.charAt(0).toUpperCase() + b.status.slice(1);
        const paymentClass = 'tb-payment-' + b.payment;
        const paymentLabel = b.payment.charAt(0).toUpperCase() + b.payment.slice(1);

        html += `
            <tr class="tb-row">
                <td style="padding:10px 8px 10px 16px; color:#6366f1; font-weight:600; font-size:0.78rem;">${b.bookingId}</td>
                <td style="padding:10px 8px;">
                    <span class="customer-link" onclick="viewCustomerProfile('${b.customer}')">${b.customer}</span>
                </td>
                <td style="padding:10px 8px; color:#374151; font-weight:500; font-size:0.82rem;">${b.time}</td>
                <td style="padding:10px 8px; color:#374151; font-size:0.82rem;">${b.service}</td>
                <td style="padding:10px 8px; color:#374151; font-size:0.82rem;">${b.staff}</td>
                <td style="padding:10px 8px;">
                    <span class="tb-status-pill ${statusClass}">${statusLabel}</span>
                </td>
                <td style="padding:10px 8px; font-weight:600; color:#1e293b; font-size:0.82rem;">${b.amount}</td>
                <td style="padding:10px 8px;">
                    <span class="tb-status-pill ${paymentClass}">${paymentLabel}</span>
                </td>
                <td style="padding:10px 8px;">
                    <button class="tb-action-btn" onclick="toggleActions('menu-${b.id}', event)">
                        Actions <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <div class="tb-actions-menu" id="menu-${b.id}" style="display:none; position:absolute;">
                        <button class="tb-menu-item"><i data-feather="eye"></i> View Details</button>
                        <button class="tb-menu-item"><i data-feather="edit-2"></i> Edit Booking</button>
                        <button class="tb-menu-item"><i data-feather="message-square"></i> Send Message</button>
                        <button class="tb-menu-item"><i data-feather="repeat"></i> Rebook</button>
                        <button class="tb-menu-item danger"><i data-feather="x-circle"></i> Cancel Booking</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    if (window.feather) feather.replace();
}

function populateAllBookingsTable() {
    const tbody = document.getElementById('tbTableBodyAll');
    if (!tbody) return;

    const allData = [
        { id: "A1", bookingId: "BK-2035", customer: "Priya Sharma", date: "Oct 24, 2024", time: "10:00 AM", service: "Hair Color & Styling", staff: "Michael", status: "completed", amount: "₹2,500", payment: "paid" },
        { id: "A2", bookingId: "BK-2036", customer: "Rahul Verma", date: "Oct 24, 2024", time: "11:30 AM", service: "Men's Haircut", staff: "Sarah", status: "booked", amount: "₹500", payment: "pending" },
        { id: "A3", bookingId: "BK-2037", customer: "Neha Gupta", date: "Oct 25, 2024", time: "09:00 AM", service: "Bridal Makeup Trial", staff: "Anjali", status: "booked", amount: "₹4,000", payment: "partial" },
        { id: "A4", bookingId: "BK-2038", customer: "Amit Kumar", date: "Oct 21, 2024", time: "02:00 PM", service: "Men's Haircut", staff: "Michael", status: "cancelled", amount: "₹500", payment: "pending" },
        { id: "A5", bookingId: "BK-2039", customer: "Kavita Rao", date: "Oct 20, 2024", time: "11:00 AM", service: "Keratin Treatment", staff: "Sarah", status: "completed", amount: "₹6,500", payment: "paid" },
        { id: "A6", bookingId: "BK-2040", customer: "Sneha Patel", date: "Oct 24, 2024", time: "03:00 PM", service: "Facial Cleansing", staff: "Sarah", status: "noshow", amount: "₹1,200", payment: "pending" },
        { id: "A7", bookingId: "BK-2041", customer: "Aakash Jain", date: "Oct 28, 2024", time: "04:00 PM", service: "Hair Spa", staff: "Michael", status: "booked", amount: "₹1,500", payment: "pending" }
    ];

    let html = '';
    allData.forEach((b, idx) => {
        const statusClass = 'tb-status-' + b.status;
        const statusLabel = b.status === 'noshow' ? 'No-show' : b.status.charAt(0).toUpperCase() + b.status.slice(1);
        const paymentClass = 'tb-payment-' + b.payment;
        const paymentLabel = b.payment.charAt(0).toUpperCase() + b.payment.slice(1);

        html += `
            <tr class="tb-row">
                <td style="padding:10px 8px 10px 16px; color:#6366f1; font-weight:600; font-size:0.78rem;">${b.bookingId}</td>
                <td style="padding:10px 8px;">
                    <span class="customer-link" onclick="viewCustomerProfile('${b.customer}')">${b.customer}</span>
                </td>
                <td style="padding:10px 8px; color:#374151; font-weight:500; font-size:0.82rem;">
                    <div style="font-weight:600; color:#1e293b; margin-bottom:1px; font-size:0.82rem;">${b.date}</div>
                    <div style="font-size:0.72rem; font-weight:500; color:#64748b;">${b.time}</div>
                </td>
                <td style="padding:10px 8px; color:#374151; font-size:0.82rem;">${b.service}</td>
                <td style="padding:10px 8px; color:#374151; font-size:0.82rem;">${b.staff}</td>
                <td style="padding:10px 8px;">
                    <span class="tb-status-pill ${statusClass}">${statusLabel}</span>
                </td>
                <td style="padding:10px 8px; font-weight:600; color:#1e293b; font-size:0.82rem;">${b.amount}</td>
                <td style="padding:10px 8px;">
                    <span class="tb-status-pill ${paymentClass}">${paymentLabel}</span>
                </td>
                <td style="padding:10px 8px;">
                    <button class="tb-action-btn" onclick="toggleActions('menu-${b.id}', event)">
                        Actions <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <div class="tb-actions-menu" id="menu-${b.id}" style="display:none; position:absolute;">
                        <button class="tb-menu-item"><i data-feather="eye"></i> View Details</button>
                        <button class="tb-menu-item"><i data-feather="edit-2"></i> Edit Booking</button>
                        <button class="tb-menu-item"><i data-feather="message-square"></i> Send Message</button>
                        <button class="tb-menu-item"><i data-feather="repeat"></i> Rebook</button>
                        <button class="tb-menu-item danger"><i data-feather="x-circle"></i> Cancel Booking</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    if (window.feather) feather.replace();
}

function populateCalendarGrid() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    // Start with empty calendar
    grid.innerHTML = `
        <div class="calendar-day-header">Sun</div>
        <div class="calendar-day-header">Mon</div>
        <div class="calendar-day-header">Tue</div>
        <div class="calendar-day-header">Wed</div>
        <div class="calendar-day-header">Thu</div>
        <div class="calendar-day-header">Fri</div>
        <div class="calendar-day-header">Sat</div>
    `;

    // 35 cells for a standard 5-week month view
    let dayCounter = 1;
    for (let i = 0; i < 35; i++) {
        const isOtherMonth = i < 2 || i > 32;
        const isToday = i === 25; // Randomly set today
        
        // Items logic
        let itemsHTML = '';
        if (!isOtherMonth) {
            if (i === 25) { // Today
                itemsHTML = `
                    <div class="calendar-item completed">10:00 Priya (Hair Color)</div>
                    <div class="calendar-item">11:30 Rahul (Haircut)</div>
                    <div class="calendar-item">13:00 Anita (Massage)</div>
                    <div class="calendar-item no-show">15:00 Sneha (Facial)</div>
                `;
            } else if (i === 22) {
                itemsHTML = `
                    <div class="calendar-item cancelled">14:00 Amit (Haircut)</div>
                `;
            } else if (i === 26) {
                itemsHTML = `
                    <div class="calendar-item">09:00 Neha (Bridal)</div>
                `;
            } else if (i === 29) {
                itemsHTML = `
                    <div class="calendar-item">16:00 Aakash (Spa)</div>
                `;
            }
        }

        let numLabel = isOtherMonth ? (i < 2 ? 29 + i : i - 32) : dayCounter++;
        
        grid.innerHTML += `
            <div class="calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}">
                <span class="day-number">${numLabel}</span>
                ${itemsHTML}
            </div>
        `;
    }
}
function toggleDropdown(button) {
    const dropdownContent = button.nextElementSibling;
    const allDropdowns = document.querySelectorAll('.dropdown-content');
    allDropdowns.forEach(dd => {
        if (dd !== dropdownContent) dd.style.display = 'none';
    });
    dropdownContent.style.display = dropdownContent.style.display === 'block' ? 'none' : 'block';
}

window.onclick = function(event) {
    if (!event.target.matches('.dropbtn') && !event.target.closest('.dropbtn')) {
        const dropdowns = document.getElementsByClassName('dropdown-content');
        for (let i = 0; i < dropdowns.length; i++) {
            const openDropdown = dropdowns[i];
            if (openDropdown.style.display === 'block') {
                openDropdown.style.display = 'none';
            }
        }
    }
}
