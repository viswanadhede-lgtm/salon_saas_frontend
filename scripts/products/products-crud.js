// scripts/products/products-crud.js
// CRUD event wiring: Add/Edit/Delete Product & Category, image handling.
// Preserved exactly from original products.js (including P1–P7 pre-existing issues).

import { productsState, getCompanyId, getBranchId } from './products-state.js';
import {
    insertCategory, updateCategory, deleteCategory,
    insertProduct, updateProduct, deleteProduct,
    fetchProductImageUrl, fetchProductImageUrlForDelete
} from './products-api.js';
import { fetchProductCategories, fetchProducts } from './products-api.js';
import { renderProductsTable, renderCategoriesTable } from './products-table.js';
import { closeAllModals } from './products-modals.js';

function showToast(msg, isError) { window.showToast(msg, isError); }

// ─────────────────────────────────────────────────────────────────────────────
// ATTACH ALL CRUD EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

export function attachGlobalEventListeners() {
    // Overlay click-outside to close
    ['addProductModalOverlay', 'addCategoryModalOverlay', 'editProductModalOverlay', 'editCategoryModalOverlay'].forEach(oid => {
        const overlay = document.getElementById(oid);
        if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAllModals(); });
    });

    // Close / Cancel buttons
    ['closeAddProductModal','cancelAddProduct','closeAddCategoryModal','cancelAddCategory',
     'closeEditProductModal','cancelEditProduct','closeEditCategoryModal','cancelEditCategory'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', closeAllModals);
    });

    // Image preview on file select
    document.addEventListener('change', async function(e) {
        if (e.target.id === 'productPhotoInput') {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                const wrap = document.querySelector('#addProductModal .product-photo-wrap');
                if (wrap) wrap.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
                const removeBtn = document.getElementById('removeAddProductPhotoBtn');
                if (removeBtn) { removeBtn.style.display = 'flex'; if (window.feather) feather.replace(); }
            }
        } else if (e.target.id === 'editProductPhotoInput') {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                const wrap = document.querySelector('#editProductModal .product-photo-wrap');
                if (wrap) wrap.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
                const removeBtn = document.getElementById('removeEditProductPhotoBtn');
                if (removeBtn) { removeBtn.style.display = 'flex'; if (window.feather) feather.replace(); }
            }
        }
    });

    // Remove photo buttons
    document.addEventListener('click', async function(e) {
        if (e.target.closest('#removeAddProductPhotoBtn')) {
            productsState.addImageUrl = null;
            const input = document.getElementById('productPhotoInput');
            if (input) input.value = '';
            const wrap = document.querySelector('#addProductModal .product-photo-wrap');
            if (wrap) wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
            const removeBtn = document.getElementById('removeAddProductPhotoBtn');
            if (removeBtn) removeBtn.style.display = 'none';
            if (window.feather) feather.replace();
        } else if (e.target.closest('#removeEditProductPhotoBtn')) {
            productsState.editImageUrl = null;
            const input = document.getElementById('editProductPhotoInput');
            if (input) input.value = '';
            const wrap = document.querySelector('#editProductModal .product-photo-wrap');
            if (wrap) wrap.innerHTML = `<i data-feather="image" style="width: 48px; height: 48px; opacity: 0.5;"></i>`;
            const removeBtn = document.getElementById('removeEditProductPhotoBtn');
            if (removeBtn) removeBtn.style.display = 'none';
            if (window.feather) feather.replace();
        }
    });

    // ── CREATE CATEGORY ───────────────────────────────────────────────────────
    const saveCatBtn = document.getElementById('saveCategoryBtn');
    if (saveCatBtn) {
        saveCatBtn.addEventListener('click', async () => {
            const name = document.getElementById('categoryName').value.trim();
            if (!name) return showToast('Please enter category name', true);

            // Duplicate check (case-insensitive)
            const isDuplicate = productsState.categories.some(
                c => c.category_name.trim().toLowerCase() === name.toLowerCase()
            );
            if (isDuplicate) return showToast(`A category named "${name}" already exists.`, true);

            const payload = {
                company_id: getCompanyId(),
                branch_id: getBranchId(),
                category_name: name
            };

            saveCatBtn.disabled = true;
            saveCatBtn.textContent = 'Saving...';
            try {
                const { error } = await insertCategory(payload);
                if (error) throw error;

                showToast('Category created successfully');
                closeAllModals();
                document.getElementById('categoryName').value = '';
                fetchProductCategories();
            } catch (err) {
                showToast(err.message || 'Failed to create category', true);
            } finally {
                saveCatBtn.disabled = false;
                saveCatBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Save Category';
                if (window.feather) feather.replace();
            }
        });
    }

    // ── UPDATE CATEGORY ───────────────────────────────────────────────────────
    // P5: malformed Supabase chain -- .from().eq().update() -- preserved EXACTLY
    const updateCatBtn = document.getElementById('updateCategoryBtn');
    if (updateCatBtn) {
        updateCatBtn.addEventListener('click', async () => {
            const name = document.getElementById('editCategoryName').value.trim();
            if (!name) return showToast('Please enter category name', true);

            const catId = document.getElementById('editCategoryId').value;

            // Duplicate check (case-insensitive, exclude self)
            const isDuplicate = productsState.categories.some(
                c => c.category_name.trim().toLowerCase() === name.toLowerCase() &&
                     String(c.category_id || c.id) !== String(catId)
            );
            if (isDuplicate) return showToast(`A category named "${name}" already exists.`, true);

            updateCatBtn.disabled = true;
            updateCatBtn.textContent = 'Updating...';
            try {
                const { error } = await updateCategory(catId, name);
                if (error) throw error;

                showToast('Category updated');
                closeAllModals();
                fetchProductCategories();
            } catch (err) {
                showToast(err.message || 'Failed to update category', true);
            } finally {
                updateCatBtn.disabled = false;
                updateCatBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Update Category';
                if (window.feather) feather.replace();
            }
        });
    }

    // ── CREATE PRODUCT ────────────────────────────────────────────────────────
    const saveProdBtn = document.getElementById('saveProductBtn');
    if (saveProdBtn) {
        saveProdBtn.addEventListener('click', async () => {
            const name = document.getElementById('productName').value.trim();
            const cat = document.getElementById('productCategory').value;
            const price = document.getElementById('productPrice').value;
            const stock = document.getElementById('productStock').value;

            if (!name || !cat || price === '' || stock === '') return showToast('Please fill all required fields', true);

            const categoryObj = productsState.categories.find(c => c.category_name === cat);
            const catId = categoryObj ? (categoryObj.category_id || categoryObj.id) : null;

            // Duplicate check (case-insensitive, under the same category)
            const isDuplicate = productsState.products.some(
                p => (p.product_name || '').trim().toLowerCase() === name.toLowerCase() &&
                     (p.category_name || '').trim().toLowerCase() === cat.toLowerCase()
            );
            if (isDuplicate) return showToast(`A product named "${name}" already exists in this category.`, true);

            saveProdBtn.disabled = true;
            saveProdBtn.textContent = 'Saving...';
            try {
                const photoFile = document.getElementById('productPhotoInput').files[0];
                let finalImageUrl = productsState.addImageUrl; // null by default unless logic exists (P7)
                if (photoFile) {
                    finalImageUrl = await window.uploadProductImage(photoFile);
                    if (!finalImageUrl) throw new Error('Image upload failed');
                }

                const { error } = await insertProduct({
                    company_id: getCompanyId(),
                    branch_id: getBranchId(),
                    product_name: name,
                    category_name: cat,
                    category_id: catId,
                    price: Number(price),
                    stock_quantity: Number(stock),
                    status: document.querySelector('input[name="productStatus"]:checked')?.value || 'Active',
                    description: document.getElementById('productDescription').value.trim() || null,
                    product_image_url: finalImageUrl
                });

                if (error) throw error;

                showToast('Product created');
                // Marketing Notifications: notify customers
                if (window.notifyCustomer) {
                    const pName = document.getElementById('productName')?.value?.trim() || 'New Product';
                    window.notifyCustomer('new_product_added', {
                        title: 'New Product Available!',
                        message: `We just added a new product: ${pName}`,
                        productName: pName
                    });
                }

                ['productName','productPrice','productStock','productDescription'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.value = '';
                });
                document.getElementById('productCategory').value = '';
                closeAllModals();
                fetchProducts();
            } catch (err) {
                showToast(err.message || 'Failed to create product', true);
            } finally {
                saveProdBtn.disabled = false;
                saveProdBtn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;margin-right:6px"></i> Save Product';
                if (window.feather) feather.replace();
            }
        });
    }

    // ── UPDATE PRODUCT ────────────────────────────────────────────────────────
    const updateProdBtn = document.getElementById('updateProductBtn');
    if (updateProdBtn) {
        updateProdBtn.addEventListener('click', async () => {
            const name = document.getElementById('editProductName').value.trim();
            const cat = document.getElementById('editProductCategory').value;
            const price = document.getElementById('editProductPrice').value;
            const stock = document.getElementById('editProductStock').value;

            if (!name || !cat || price === '' || stock === '') return showToast('Please fill all required fields', true);

            const productId = document.getElementById('editProductId').value;
            const categoryObj = productsState.categories.find(c => c.category_name === cat);
            const catId = categoryObj ? (categoryObj.category_id || categoryObj.id) : null;

            // Duplicate check (case-insensitive, under the same category, excluding self)
            const isDuplicate = productsState.products.some(
                p => (p.product_name || '').trim().toLowerCase() === name.toLowerCase() &&
                     (p.category_name || '').trim().toLowerCase() === cat.toLowerCase() &&
                     String(p.product_id || p.id) !== String(productId)
            );
            if (isDuplicate) return showToast(`A product named "${name}" already exists in this category.`, true);

            updateProdBtn.disabled = true;
            updateProdBtn.textContent = 'Updating...';
            try {
                const photoFile = document.getElementById('editProductPhotoInput').files[0];
                let finalImageUrl = productsState.editImageUrl;
                if (photoFile) {
                    finalImageUrl = await window.uploadProductImage(photoFile);
                    if (!finalImageUrl) throw new Error('Image upload failed');
                }

                // Fetch the old product row first to see if we need to delete an old image
                const { data: oldDataRows } = await fetchProductImageUrl(productId);

                const oldData = oldDataRows && oldDataRows.length > 0 ? oldDataRows[0] : null;

                if (oldData && oldData.product_image_url && oldData.product_image_url !== finalImageUrl) {
                    const { error: storageError } = await window.deleteProductImage(oldData.product_image_url);
                    if (storageError) throw new Error('Storage deletion failed: ' + (storageError.message || 'Unknown error'));
                }

                const { error } = await updateProduct(productId, {
                    product_name: name,
                    category_name: cat,
                    category_id: catId,
                    price: Number(price),
                    stock_quantity: Number(stock),
                    status: document.querySelector('input[name="editProductStatus"]:checked')?.value || 'Active',
                    description: document.getElementById('editProductDescription').value.trim() || null,
                    product_image_url: finalImageUrl
                });

                if (error) throw error;

                showToast('Product updated');
                closeAllModals();
                fetchProducts();
            } catch (err) {
                showToast(err.message || 'Failed to update product', true);
            } finally {
                updateProdBtn.disabled = false;
                updateProdBtn.textContent = 'Update Product';
            }
        });
    }

    // ── DELETE (Product or Category) ──────────────────────────────────────────
    let deleteTarget = null;  // closure-scoped, NOT in shared state

    document.getElementById('btnCancelDelete')?.addEventListener('click', () => {
        document.getElementById('deleteConfirmOverlay').classList.remove('active');
        deleteTarget = null;
    });

    document.getElementById('btnConfirmDelete')?.addEventListener('click', async () => {
        if (!deleteTarget) return;
        const btn = document.getElementById('btnConfirmDelete');
        const origTxt = btn.textContent;
        btn.textContent = 'Deleting...';
        btn.disabled = true;
        document.getElementById('btnCancelDelete').disabled = true;

        try {
            const isProd = deleteTarget.type === 'product';
            let error;

            if (isProd) {
                // Fetch product first to check for image
                const { data: prodDataRows } = await fetchProductImageUrlForDelete(deleteTarget.id);

                const prodData = prodDataRows && prodDataRows.length > 0 ? prodDataRows[0] : null;

                if (prodData && prodData.product_image_url) {
                    const { error: storageError } = await window.deleteProductImage(prodData.product_image_url);
                    if (storageError) throw new Error('Storage deletion failed: ' + (storageError.message || 'Unknown error'));
                }

                // Hard delete row
                ({ error } = await deleteProduct(deleteTarget.id));
            } else {
                ({ error } = await deleteCategory(deleteTarget.id));
            }

            if (error) throw error;

            showToast(`${isProd ? 'Product' : 'Category'} deleted successfully`);
            document.getElementById('deleteConfirmOverlay').classList.remove('active');
            if (isProd) fetchProducts();
            else fetchProductCategories();
        } catch (err) {
            showToast(err.message || 'Failed to delete', true);
        } finally {
            btn.textContent = origTxt;
            btn.disabled = false;
            document.getElementById('btnCancelDelete').disabled = false;
            deleteTarget = null;
        }
    });

    // Assigned as window APIs so table HTML onclick handlers can call them
    window.triggerDeleteProduct = function(id, name) {
        deleteTarget = { type: 'product', id, name };
        document.getElementById('deleteConfirmTitle').textContent = 'Delete Product?';
        document.getElementById('deleteConfirmText').textContent = `Are you sure you want to delete "${name}"? This cannot be undone.`;
        document.getElementById('deleteConfirmOverlay').classList.add('active');
        if (window.feather) feather.replace();
    };

    window.triggerDeleteCategory = function(id, name) {
        deleteTarget = { type: 'category', id, name };
        document.getElementById('deleteConfirmTitle').textContent = 'Delete Category?';
        document.getElementById('deleteConfirmText').textContent = `Are you sure you want to delete "${name}"? This may impact products using it.`;
        document.getElementById('deleteConfirmOverlay').classList.add('active');
        if (window.feather) feather.replace();
    };
}
