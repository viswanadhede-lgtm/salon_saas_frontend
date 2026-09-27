/**
 * scripts/app-shell.js
 * Lightweight shell loader for the BharathBots Salon SaaS application.
 *
 * Responsibilities:
 *   1. Inject global-layout.css (if not already in <head>)
 *   2. Fetch and mount components/global-sidebar.html → replaces #global-sidebar
 *   3. Fetch and mount components/global-header.html  → replaces #global-header
 *   4. Call initLayout() from app-layout.js (sidebar toggles, submenus, nav, etc.)
 *   5. Re-run window.populateGlobalHeader() if auth guard already completed
 *   6. Dispatch 'app-shell:ready' so late-binding code can hook in
 *
 * Timing notes:
 *   - global-auth-guard.js runs async Supabase calls (~1-3s) before calling
 *     populateGlobalHeader(). The shell fetch is fast (~50-200ms) so the shell
 *     is usually ready before the auth guard finishes. But we defend both ways:
 *     • If auth guard finishes AFTER shell: app-layout.js calls
 *       window.populateGlobalHeader() at the end of initLayout().
 *     • If auth guard finishes BEFORE shell (unlikely): we call it again after
 *       mount via window.populateGlobalHeader?.().
 */

import { initLayout } from './app-layout.js';

class AppShell {
    static initialized = false;

    /**
     * Resolves a component URL relative to this script file.
     * Works regardless of page depth (root, nested, settings/).
     */
    static getComponentUrl(filename) {
        return new URL(`../components/${filename}`, import.meta.url).href;
    }

    /**
     * Injects global-layout.css via <link> if not already present.
     * Uses import.meta.url for reliable path resolution.
     */
    static ensureLayoutStyles() {
        if (document.getElementById('globalLayoutStyles')) return;
        const link = document.createElement('link');
        link.id   = 'globalLayoutStyles';
        link.rel  = 'stylesheet';
        link.href = new URL('../styles/global-layout.css', import.meta.url).href;
        document.head.appendChild(link);
    }

    /**
     * Fetches HTML component text with error handling.
     */
    static async fetchComponent(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
            return await res.text();
        } catch (err) {
            console.error('[AppShell] Failed to load component:', url, err);
            return null;
        }
    }

    /**
     * Main mount — fetches and injects both sidebar and header, then
     * initializes all layout behaviors.
     */
    static async mount() {
        if (AppShell.initialized) return;
        AppShell.initialized = true;

        AppShell.ensureLayoutStyles();

        const sidebarTarget = document.getElementById('global-sidebar');
        const headerTarget  = document.getElementById('global-header');

        // If neither placeholder exists the page manages its own layout
        // (e.g. signin, plans, payment-result). Still init layout if there
        // is a legacy #sidebar present.
        if (!sidebarTarget && !headerTarget) {
            if (document.getElementById('sidebar') || document.querySelector('.top-header')) {
                initLayout();
            }
            return;
        }

        // Fetch both components in parallel
        const sidebarUrl = AppShell.getComponentUrl('global-sidebar.html');
        const headerUrl  = AppShell.getComponentUrl('global-header.html');

        const [sidebarHtml, headerHtml] = await Promise.all([
            sidebarTarget ? AppShell.fetchComponent(sidebarUrl) : Promise.resolve(null),
            headerTarget  ? AppShell.fetchComponent(headerUrl)  : Promise.resolve(null)
        ]);

        // --- Mount Sidebar ---
        if (sidebarTarget && sidebarHtml) {
            const tmp = document.createElement('div');
            tmp.innerHTML = sidebarHtml.trim();
            const el = tmp.firstElementChild;
            if (el) sidebarTarget.replaceWith(el);
        }

        // --- Mount Header (may include <header> + backdrop divs) ---
        if (headerTarget && headerHtml) {
            const tmp = document.createElement('div');
            tmp.innerHTML = headerHtml.trim();
            const nodes = Array.from(tmp.children);
            if (nodes.length > 0) headerTarget.replaceWith(...nodes);
        }

        // --- Initialize shared layout behaviors ---
        // initLayout() internally calls:
        //   initSidebar(), initSubmenus(), updateActiveNav(),
        //   initProfileMenu(), initQuickActions(), populateDateChip()
        // It also calls window.populateGlobalHeader() if already defined
        // (covers: auth guard finished BEFORE shell was mounted).
        initLayout();

        // --- Feather icons for newly-injected shell elements ---
        if (typeof feather !== 'undefined' && feather.replace) {
            feather.replace();
        }

        // --- Mark shell ready ---
        window.__appShellReady = true;

        document.dispatchEvent(new CustomEvent('app-shell:ready', {
            bubbles: true,
            detail:  { timestamp: Date.now() }
        }));
    }
}

// Auto-mount: if DOM is already ready, mount immediately; otherwise wait.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppShell.mount());
} else {
    AppShell.mount();
}

export default AppShell;
