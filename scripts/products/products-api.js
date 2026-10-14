// scripts/products/products-api.js
// Data-access layer: all Supabase DB reads/writes and Storage SDK calls.
// CHANGES: updated_at on all writes; Storage SDK replaces raw REST; cascadeRenameCategoryOnProducts added.

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

        // Exclude soft-deleted categories; tolerate existing NULL status prior to migration
        productsState.categories = (data || []).filter(c =>
            (c.status || 'active').toLowerCase() !== 'deleted'
        );

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

        // Exclude soft-deleted products; inactive products remain visible and manageable
        productsState.products = (data || []).filter(p =>
            (p.status || 'active').toLowerCase() !== 'deleted'
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

// product_categories UPDATE
export async function updateCategory(catId, name) {
    return supabase
        .from('product_categories')
        .update({ category_name: name, updated_at: new Date().toISOString() })
        .eq('category_id', catId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// product_categories DELETE (Soft Deletion)
export async function deleteCategory(catId) {
    return supabase
        .from('product_categories')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('category_id', catId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// products INSERT
export async function insertProduct(payload) {
    return supabase.from('products').insert(payload);
}

// products UPDATE
export async function updateProduct(productId, payload) {
    return supabase
        .from('products')
        .update(payload)
        .eq('product_id', productId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// products DELETE (Soft Deletion)
export async function deleteProduct(productId) {
    return supabase
        .from('products')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('product_id', productId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// CHANGE 1: Cascade category rename to all products in that category
export async function cascadeRenameCategoryOnProducts(catId, newCategoryName) {
    return supabase
        .from('products')
        .update({ category_name: newCategoryName, updated_at: new Date().toISOString() })
        .eq('category_id', catId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// products READ for edit (product_image_url)
export async function fetchProductImageUrl(productId) {
    return supabase
        .from('products')
        .select('product_image_url')
        .eq('product_id', productId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// products READ for delete (product_image_url)
export async function fetchProductImageUrlForDelete(productId) {
    return supabase
        .from('products')
        .select('product_image_url')
        .eq('product_id', productId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE — CHANGE 6: Supabase Storage SDK (replaces raw REST fetch)
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadProductImageToStorage(file) {
    if (!file) return null;
    const timestamp = Math.floor(Date.now() / 1000);
    const randomString = Math.random().toString(36).substring(2, 8);
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '').toLowerCase();
    const filename = `${timestamp}-${randomString}-${safeName}`;

    try {
        const { error } = await supabase.storage
            .from('product-images')
            .upload(filename, file, {
                contentType: file.type || 'application/octet-stream',
                upsert: false
            });

        if (error) throw error;

        const { data: publicData } = supabase.storage
            .from('product-images')
            .getPublicUrl(filename);

        return publicData?.publicUrl || null;
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

        const { error } = await supabase.storage
            .from('product-images')
            .remove([filename]);

        return { error: error || null };
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
