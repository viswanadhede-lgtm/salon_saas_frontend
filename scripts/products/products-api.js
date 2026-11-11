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
        const { data, error } = await supabase.schema('app')
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
        const { data, error } = await supabase.schema('app')
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
    return supabase.rpc('create_product_category_atomic', {
        p_company_id:    payload.company_id || getCompanyId(),
        p_branch_id:     payload.branch_id || getBranchId(),
        p_category_name: payload.category_name,
        p_description:   payload.description || null
    });
}

// product_categories UPDATE (atomic cascade to products.category_name in PostgreSQL)
export async function updateCategory(catId, name, description = null) {
    return supabase.rpc('update_product_category_atomic', {
        p_company_id:    getCompanyId(),
        p_branch_id:     getBranchId(),
        p_category_id:   catId,
        p_category_name: name,
        p_description:   description
    });
}

// product_categories DELETE (Soft Deletion with active products dependency blocker)
export async function deleteCategory(catId) {
    return supabase.rpc('delete_product_category_atomic', {
        p_company_id:  getCompanyId(),
        p_branch_id:   getBranchId(),
        p_category_id: catId
    });
}

// products INSERT
export async function insertProduct(payload) {
    return supabase.rpc('create_product_atomic', {
        p_company_id:        payload.company_id || getCompanyId(),
        p_branch_id:         payload.branch_id || getBranchId(),
        p_category_id:       payload.category_id,
        p_product_name:      payload.product_name,
        p_price:             payload.price,
        p_stock_quantity:    payload.stock_quantity ?? 0,
        p_status:            payload.status || 'active',
        p_description:       payload.description || null,
        p_product_image_url: payload.product_image_url || null
    });
}

// products UPDATE
export async function updateProduct(productId, payload) {
    return supabase.rpc('update_product_atomic', {
        p_company_id:        getCompanyId(),
        p_branch_id:         getBranchId(),
        p_product_id:        productId,
        p_category_id:       payload.category_id,
        p_product_name:      payload.product_name,
        p_price:             payload.price,
        p_stock_quantity:    payload.stock_quantity,
        p_status:            payload.status || 'active',
        p_description:       payload.description || null,
        p_product_image_url: payload.product_image_url || null
    });
}

// products DELETE (Soft Deletion preserving historical sales)
export async function deleteProduct(productId) {
    return supabase.rpc('delete_product_atomic', {
        p_company_id:  getCompanyId(),
        p_branch_id:   getBranchId(),
        p_product_id: productId
    });
}

// Automatically handled inside update_product_category_atomic in single transaction
export async function cascadeRenameCategoryOnProducts(catId, newCategoryName) {
    return { data: null, error: null };
}

// products READ for edit (product_image_url)
export async function fetchProductImageUrl(productId) {
    return supabase.schema('app')
        .from('products')
        .select('product_image_url')
        .eq('product_id', productId)
        .eq('company_id', getCompanyId())
        .eq('branch_id', getBranchId());
}

// products READ for delete (product_image_url)
export async function fetchProductImageUrlForDelete(productId) {
    return supabase.schema('app')
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
