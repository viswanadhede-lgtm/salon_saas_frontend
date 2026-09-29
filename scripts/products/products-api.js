// scripts/products/products-api.js
// Data-access layer: all Supabase DB reads/writes and Storage REST calls.
// Preserved exactly from original products.js. Do NOT optimize or fix.

import { supabase } from '../../lib/supabase.js';
import { productsState, getCompanyId, getBranchId } from './products-state.js';

// ─────────────────────────────────────────────────────────────────────────────
// READS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchProductCategories() {
    try {
        const { data, error } = await supabase
            .from('product_categories')
            .select('*')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId());

        if (error) throw error;

        productsState.categories = data || [];

        populateCategoryDropdown('productCategory');
        populateCategoryDropdown('editProductCategory');
        renderFilterOptions();
        renderCategoriesTable();

        const tabEl = document.getElementById('categoriesCountBadge');
        if (tabEl) tabEl.textContent = productsState.categories.length;
    } catch (err) {
        console.error('Error fetching product categories:', err);
        showToast('Could not load categories: ' + (err.message || ''), true);
    }
}

export async function fetchProducts() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('company_id', getCompanyId())
            .eq('branch_id', getBranchId());

        if (error) throw error;

        productsState.products = (data || []).filter(p =>
            (p.status || '').toLowerCase() !== 'deleted'
        );

        renderProductsTable();
        const tabEl = document.getElementById('productsCountBadge');
        if (tabEl) tabEl.textContent = productsState.products.length;
    } catch (err) {
        console.error('Error fetching products:', err);
        showToast('Could not load products: ' + (err.message || ''), true);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITES
// ─────────────────────────────────────────────────────────────────────────────

// product_categories INSERT
export async function insertCategory(payload) {
    return supabase.from('product_categories').insert(payload);
}

// product_categories UPDATE  -- P5: malformed chain preserved EXACTLY as original
export async function updateCategory(catId, name) {
    return supabase
        .from('product_categories')
        .eq('category_id', catId)
        .update({ category_name: name });
}

// product_categories DELETE
export async function deleteCategory(catId) {
    return supabase
        .from('product_categories')
        .eq('category_id', catId)
        .delete();
}

// products INSERT
export async function insertProduct(payload) {
    return supabase.from('products').insert(payload);
}

// products UPDATE
export async function updateProduct(productId, payload) {
    return supabase
        .from('products')
        .eq('product_id', productId)
        .update(payload);
}

// products DELETE
export async function deleteProduct(productId) {
    return supabase
        .from('products')
        .eq('product_id', productId)
        .delete();
}

// products READ for edit (product_image_url)
export async function fetchProductImageUrl(productId) {
    return supabase
        .from('products')
        .select('product_image_url')
        .eq('product_id', productId);
}

// products READ for delete (product_image_url)
export async function fetchProductImageUrlForDelete(productId) {
    return supabase
        .from('products')
        .select('product_image_url')
        .eq('product_id', productId);
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE (direct REST -- preserved exactly, NOT migrated to SDK)
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadProductImageToStorage(file) {
    if (!file) return null;
    const timestamp = Math.floor(Date.now() / 1000);
    const randomString = Math.random().toString(36).substring(2, 8);
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '').toLowerCase();
    const filename = `${timestamp}-${randomString}-${safeName}`;

    try {
        const url = `${supabase._url}/storage/v1/object/product-images/${filename}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': supabase._key,
                'Authorization': `Bearer ${supabase._key}`,
                'Content-Type': file.type || 'application/octet-stream'
            },
            body: file
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

        return `${supabase._url}/storage/v1/object/public/product-images/${filename}`;
    } catch (err) {
        console.error('Image upload failed:', err);
        window.showToast('Failed to upload image', true);
        return null;
    }
}

export async function deleteProductImageFromStorage(url) {
    if (!url) return { error: null };
    try {
        const urlParts = url.split('/');
        const filename = urlParts[urlParts.length - 1];
        if (!filename) return { error: { message: 'Invalid URL for deletion' } };

        const apiUrl = `${supabase._url}/storage/v1/object/product-images/${filename}`;
        const res = await fetch(apiUrl, {
            method: 'DELETE',
            headers: {
                'apikey': supabase._key,
                'Authorization': `Bearer ${supabase._key}`
            }
        });

        let data = null;
        try { data = await res.json(); } catch(e){}

        if (!res.ok) {
            return { error: data || { message: `HTTP ${res.status}` } };
        }
        return { error: null };
    } catch (err) {
        console.error('Failed to delete image from bucket:', err);
        return { error: err };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Late-bound forward references resolved at call time
// (products-api depends on products-table/modals for rendering after fetch)
// ─────────────────────────────────────────────────────────────────────────────
function renderProductsTable() {
    if (window._productsRenderProductsTable) window._productsRenderProductsTable();
}
function renderCategoriesTable() {
    if (window._productsRenderCategoriesTable) window._productsRenderCategoriesTable();
}
function renderFilterOptions() {
    if (window._productsRenderFilterOptions) window._productsRenderFilterOptions();
}
function populateCategoryDropdown(id) {
    if (window._productsPopulateCategoryDropdown) window._productsPopulateCategoryDropdown(id);
}
function showToast(msg, isError) { window.showToast(msg, isError); }
