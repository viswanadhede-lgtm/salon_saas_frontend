import { supabase } from '../lib/supabase.js';

class I18nManager {
    constructor() {
        this.currentLang = 'en';
        this.translations = {};
        this.englishTranslations = {}; // Fallback
        this.isLoaded = false;
    }

    async init() {
        // 1. Determine language preference
        // Priority: localStorage -> appContext -> default 'en'
        const savedLang = localStorage.getItem('user_language');
        const appContextStr = localStorage.getItem('appContext');
        
        let preferredLang = 'en';
        if (savedLang) {
            preferredLang = savedLang;
        } else if (appContextStr) {
            try {
                const context = JSON.parse(appContextStr);
                preferredLang = context.preferences?.language || 'en';
            } catch (e) {}
        }

        this.currentLang = preferredLang;

        // 2. Load translations
        await this.loadTranslations(preferredLang);
        
        // 3. Always load English for fallback if current isn't English
        if (preferredLang !== 'en') {
            await this.loadFallbackTranslations();
        } else {
            this.englishTranslations = this.translations;
        }

        this.isLoaded = true;
        console.log(`[i18n] System initialized with language: ${this.currentLang}`);
        
        // Dispatch event for components that need to know translations are ready
        window.dispatchEvent(new CustomEvent('i18nReady'));
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(`./locales/${lang}.json`);
            if (!response.ok) throw new Error(`Could not load ${lang}.json`);
            this.translations = await response.json();
        } catch (error) {
            console.error(`[i18n] Error loading ${lang} translations:`, error);
            // Fallback to empty to ensure t() doesn't crash
            this.translations = this.translations || {};
        }
    }

    async loadFallbackTranslations() {
        try {
            const response = await fetch(`./locales/en.json`);
            if (!response.ok) throw new Error(`Could not load en.json`);
            this.englishTranslations = await response.json();
        } catch (error) {
            console.error(`[i18n] Error loading fallback (en) translations:`, error);
        }
    }

    t(key) {
        if (!key) return '';

        // Navigate the nested object
        const getValue = (obj, path) => {
            return path.split('.').reduce((prev, curr) => prev ? prev[curr] : null, obj);
        };

        // 1. Try active language
        let value = getValue(this.translations, key);
        if (value) return value;

        // 2. Try English fallback
        value = getValue(this.englishTranslations, key);
        if (value) return value;

        // 3. Return the key itself as last resort
        console.warn(`[i18n] Missing translation key: ${key}`);
        return key;
    }

    async setLanguage(lang) {
        if (this.currentLang === lang) return;

        try {
            // 1. Update localStorage
            localStorage.setItem('user_language', lang);

            // 2. Update Supabase
            const company_id = localStorage.getItem('company_id');
            const user_id = JSON.parse(localStorage.getItem('appContext') || '{}').user?.user_id;

            if (company_id && user_id) {
                const { error } = await supabase
                    .from('user_preferences')
                    .upsert({ 
                        user_id: user_id, 
                        company_id: company_id, 
                        language: lang 
                    }, { onConflict: 'user_id' });
                
                if (error) throw error;
            }

            // 3. Update appContext mirror
            const appContextStr = localStorage.getItem('appContext');
            if (appContextStr) {
                const context = JSON.parse(appContextStr);
                context.preferences = context.preferences || {};
                context.preferences.language = lang;
                localStorage.setItem('appContext', JSON.stringify(context));
            }

            // 4. Reload page to apply changes everywhere (as requested)
            window.location.reload();
        } catch (error) {
            console.error('[i18n] Failed to set language:', error);
            // Even if DB fails, we reload to apply locally
            window.location.reload();
        }
    }
}

const i18n = new I18nManager();
export default i18n;

// Make global for simple usage in script tags if needed
window.t = (key) => i18n.t(key);
window.setLanguage = (lang) => i18n.setLanguage(lang);
window.i18n = i18n;
