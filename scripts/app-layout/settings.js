/**
 * scripts/app-layout/settings.js
 * Controls settings modal display, user preference data retrieval from Supabase,
 * and preference upserts into user_preferences table.
 */

import { ensureProfileModalHtml, bindProfileModalEvents, closeProfileModal } from './profile.js';

export async function fetchAndPopulateSettings() {
    const langDropdown = document.getElementById('settingsLanguage');
    const themeDropdown = document.getElementById('settingsTheme');
    const notifyDropdown = document.getElementById('settingsNotifications');

    if (!langDropdown || !themeDropdown || !notifyDropdown) return;

    try {
        const contextStr = localStorage.getItem('appContext');
        if (!contextStr) return;
        const context = JSON.parse(contextStr);
        const user_id = context.user?.user_id || context.user?.id;
        if (!user_id) return;

        const { supabase } = await import('../../lib/supabase.js');

        const { data, error } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', user_id)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const prefs = data[0];
            if (prefs.language) langDropdown.value = prefs.language;
            if (prefs.theme) themeDropdown.value = prefs.theme;
            if (prefs.notifications !== undefined) {
                notifyDropdown.value = prefs.notifications ? 'enabled' : 'disabled';
            }
        }
    } catch (err) {
        console.error("Fetch Settings Error:", err);
    }
}

export async function handleSettingsSave() {
    const btn = document.getElementById('btnSaveGenericModal');
    if (!btn) return;
    const originalText = btn.textContent;

    const langDropdown = document.getElementById('settingsLanguage');
    const themeDropdown = document.getElementById('settingsTheme');
    const notifyDropdown = document.getElementById('settingsNotifications');

    const lang = langDropdown ? langDropdown.value : 'en';
    const theme = themeDropdown ? themeDropdown.value : 'light';
    const notify = notifyDropdown ? notifyDropdown.value === 'enabled' : true;

    try {
        const contextStr = localStorage.getItem('appContext');
        if (!contextStr) throw new Error("User context not found.");
        const context = JSON.parse(contextStr);
        const user_id = context.user?.user_id || context.user?.id;
        const company_id = context.company?.company_id || localStorage.getItem('company_id');
        const branch_id = context.current_branch_id || localStorage.getItem('active_branch_id');

        if (!user_id) throw new Error("User ID not found in session.");

        btn.textContent = 'Saving...';
        btn.disabled = true;

        const { supabase } = await import('../../lib/supabase.js');

        // Check if record exists
        const { data: existing, error: checkErr } = await supabase
            .from('user_preferences')
            .select('id')
            .eq('user_id', user_id)
            .limit(1);

        if (checkErr) throw checkErr;

        let result;
        if (existing && existing.length > 0) {
            result = await supabase
                .from('user_preferences')
                .update({
                    company_id,
                    branch_id,
                    language: lang,
                    theme: theme,
                    notifications: notify,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user_id);
        } else {
            result = await supabase
                .from('user_preferences')
                .insert([{
                    user_id,
                    company_id,
                    branch_id,
                    language: lang,
                    theme: theme,
                    notifications: notify,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }]);
        }

        if (result.error) throw result.error;

        if (typeof window.toast === 'function') {
            window.toast("Settings saved successfully!");
        } else {
            alert("Settings saved successfully!");
        }

        closeProfileModal();

    } catch (err) {
        console.error("Settings Update Error:", err);
        alert(err.message || "Failed to update settings.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

export function openSettingsModal() {
    ensureProfileModalHtml();
    const modalOverlay = document.getElementById('genericModalOverlay');
    if (!modalOverlay) return;

    bindProfileModalEvents(modalOverlay);

    const titleEl = document.getElementById('genericModalTitle');
    const subEl   = document.getElementById('genericModalSubtitle');
    if (titleEl) titleEl.textContent = 'Settings';
    if (subEl)   subEl.textContent   = 'Configure your account preferences.';

    const profileContent     = document.getElementById('profileContent');
    const settingsContent    = document.getElementById('settingsContent');
    const placeholderContent = document.getElementById('genericPlaceholderContent');
    const footerSave         = document.getElementById('btnSaveGenericModal');

    if (profileContent)     profileContent.style.display = 'none';
    if (settingsContent)    settingsContent.style.display = 'grid';
    if (placeholderContent) placeholderContent.style.display = 'none';
    if (footerSave)         footerSave.style.display = '';

    fetchAndPopulateSettings();

    modalOverlay.classList.add('active');

    if (typeof feather !== 'undefined' && feather.replace) {
        feather.replace();
    }
}

// Preserve global window APIs
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeProfileModal;
window.handleSettingsSave = handleSettingsSave;
