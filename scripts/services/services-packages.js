// scripts/services/services-packages.js
// Package UI management: multi-select service dropdowns, chips, package modals.
// Preserves exact DOM interactions, styles, and Set data structures.

import { servicesState } from './services-state.js';
import { fetchPackageServicesForEdit } from './services-api.js';

// ── HELPER: Recalculate Original Price from selected service IDs ─────
function recalculateOriginalPrice(selectedSet, fieldId) {
    const allServices = window.liveServicesData || servicesState.liveServicesData || [];
    let total = 0;
    selectedSet.forEach(id => {
        const svc = allServices.find(s => (s.service_id || s.id) === id);
        if (svc) total += parseFloat(svc.price || 0);
    });
    const field = document.getElementById(fieldId);
    if (field) field.value = total;
}

// ── HELPER: Format dropdown label as "Service – Category – ₹Price" ───
function formatServiceLabel(s) {
    const name = s.service_name || s.name || '';
    const cat  = s.category_name || s.category || '';
    const price = parseFloat(s.price || 0).toLocaleString('en-IN');
    return `${name}  –  ${cat}  –  ₹${price}`;
}

export function initPackageDropdowns() {
    const pkgServicesDropdownToggle = document.getElementById('pkgServicesDropdownToggle');
    const pkgServicesDropdownMenu = document.getElementById('pkgServicesDropdownMenu');

    if (pkgServicesDropdownToggle && pkgServicesDropdownMenu) {
        pkgServicesDropdownToggle.addEventListener('click', () => {
            pkgServicesDropdownMenu.style.display = pkgServicesDropdownMenu.style.display === 'none' ? 'block' : 'none';
        });
        
        document.addEventListener('click', (e) => {
            if (!pkgServicesDropdownToggle.contains(e.target) && !pkgServicesDropdownMenu.contains(e.target)) {
                pkgServicesDropdownMenu.style.display = 'none';
            }
        });
    }

    const editPkgServicesDropdownToggle = document.getElementById('editPkgServicesDropdownToggle');
    const editPkgServicesDropdownMenu = document.getElementById('editPkgServicesDropdownMenu');

    if (editPkgServicesDropdownToggle && editPkgServicesDropdownMenu) {
        editPkgServicesDropdownToggle.addEventListener('click', () => {
            editPkgServicesDropdownMenu.style.display = editPkgServicesDropdownMenu.style.display === 'none' ? 'block' : 'none';
        });
        
        document.addEventListener('click', (e) => {
            if (editPkgServicesDropdownToggle && editPkgServicesDropdownMenu && !editPkgServicesDropdownToggle.contains(e.target) && !editPkgServicesDropdownMenu.contains(e.target)) {
                editPkgServicesDropdownMenu.style.display = 'none';
            }
        });
    }
}

export function populatePackageServicesDropdown() {
    const tbody = document.getElementById('pkgServicesDropdownBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    servicesState.selectedPackageServices.clear();
    updatePackageServicesChips();
    recalculateOriginalPrice(servicesState.selectedPackageServices, 'pkgOriginalPrice');

    (window.liveServicesData || servicesState.liveServicesData || []).filter(s => s.status === 'active').forEach(s => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.style.transition = 'background 0.15s ease';

        // Checkbox cell
        const tdCheck = document.createElement('td');
        tdCheck.style.padding = '8px 8px 8px 12px';
        tdCheck.style.verticalAlign = 'middle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = s.service_id || s.id;
        checkbox.dataset.name = s.service_name || s.name;
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        checkbox.style.accentColor = '#1e3a8a';
        checkbox.style.cursor = 'pointer';
        checkbox.style.margin = '0';
        tdCheck.appendChild(checkbox);

        // Service name cell
        const tdName = document.createElement('td');
        tdName.style.padding = '8px';
        tdName.style.verticalAlign = 'middle';
        tdName.style.color = '#1e293b';
        tdName.style.fontWeight = '500';
        tdName.style.overflow = 'hidden';
        tdName.style.textOverflow = 'ellipsis';
        tdName.style.whiteSpace = 'nowrap';
        tdName.textContent = s.service_name || s.name || '';

        // Category cell (pill badge)
        const tdCat = document.createElement('td');
        tdCat.style.padding = '8px';
        tdCat.style.verticalAlign = 'middle';
        const catBadge = document.createElement('span');
        catBadge.textContent = s.category_name || s.category || '';
        catBadge.style.background = '#f1f5f9';
        catBadge.style.color = '#475569';
        catBadge.style.padding = '2px 10px';
        catBadge.style.borderRadius = '12px';
        catBadge.style.fontSize = '0.75rem';
        catBadge.style.fontWeight = '500';
        catBadge.style.whiteSpace = 'nowrap';
        tdCat.appendChild(catBadge);

        // Price cell
        const tdPrice = document.createElement('td');
        tdPrice.style.padding = '8px 12px 8px 8px';
        tdPrice.style.verticalAlign = 'middle';
        tdPrice.style.textAlign = 'right';
        tdPrice.style.fontWeight = '600';
        tdPrice.style.color = '#1e3a8a';
        tdPrice.style.whiteSpace = 'nowrap';
        tdPrice.textContent = `₹${parseFloat(s.price || 0).toLocaleString('en-IN')}`;

        tr.appendChild(tdCheck);
        tr.appendChild(tdName);
        tr.appendChild(tdCat);
        tr.appendChild(tdPrice);
        
        tr.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) servicesState.selectedPackageServices.add(s.service_id || s.id);
            else servicesState.selectedPackageServices.delete(s.service_id || s.id);
            updatePackageServicesChips();
            recalculateOriginalPrice(servicesState.selectedPackageServices, 'pkgOriginalPrice');
        });

        tr.addEventListener('mouseenter', () => tr.style.background = '#f8fafc');
        tr.addEventListener('mouseleave', () => tr.style.background = 'transparent');
        
        tbody.appendChild(tr);
    });
}

export function updatePackageServicesChips() {
    const chipsContainer = document.getElementById('pkgServicesSelectedChips');
    const placeholder = document.getElementById('pkgServicesPlaceholder');
    if (!chipsContainer || !placeholder) return;
    
    chipsContainer.innerHTML = '';
    if (servicesState.selectedPackageServices.size === 0) {
        placeholder.style.display = 'inline';
    } else {
        placeholder.style.display = 'none';
        servicesState.selectedPackageServices.forEach(id => {
            const svc = (window.liveServicesData || servicesState.liveServicesData || []).find(s => (s.service_id || s.id) === id);
            if (svc) {
                const chip = document.createElement('span');
                chip.style.background = '#e0e7ff';
                chip.style.color = '#3730a3';
                chip.style.padding = '2px 8px';
                chip.style.borderRadius = '12px';
                chip.style.fontSize = '0.75rem';
                chip.style.fontWeight = '600';
                chip.style.display = 'inline-flex';
                chip.style.alignItems = 'center';
                chip.style.gap = '4px';
                
                const xBtn = document.createElement('i');
                xBtn.dataset.feather = 'x';
                xBtn.style.width = '12px';
                xBtn.style.height = '12px';
                xBtn.style.cursor = 'pointer';
                xBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    servicesState.selectedPackageServices.delete(id);
                    const pkgServicesDropdownMenu = document.getElementById('pkgServicesDropdownMenu');
                    if (pkgServicesDropdownMenu) {
                        const cb = pkgServicesDropdownMenu.querySelector(`input[value="${id}"]`);
                        if (cb) cb.checked = false;
                    }
                    updatePackageServicesChips();
                    recalculateOriginalPrice(servicesState.selectedPackageServices, 'pkgOriginalPrice');
                });
                
                chip.appendChild(document.createTextNode(svc.service_name || svc.name));
                chip.appendChild(xBtn);
                chipsContainer.appendChild(chip);
            }
        });
        if (window.feather) feather.replace();
    }
}

export function populateEditPackageServicesDropdown() {
    const tbody = document.getElementById('editPkgServicesDropdownBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    updateEditPackageServicesChips();

    (window.liveServicesData || servicesState.liveServicesData || []).filter(s => s.status === 'active').forEach(s => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.style.transition = 'background 0.15s ease';

        // Checkbox cell
        const tdCheck = document.createElement('td');
        tdCheck.style.padding = '8px 8px 8px 12px';
        tdCheck.style.verticalAlign = 'middle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = s.service_id || s.id;
        checkbox.dataset.name = s.service_name || s.name;
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        checkbox.style.accentColor = '#1e3a8a';
        checkbox.style.cursor = 'pointer';
        checkbox.style.margin = '0';
        
        if (servicesState.editSelectedPackageServices.has(checkbox.value)) {
            checkbox.checked = true;
        }
        tdCheck.appendChild(checkbox);

        // Service name cell
        const tdName = document.createElement('td');
        tdName.style.padding = '8px';
        tdName.style.verticalAlign = 'middle';
        tdName.style.color = '#1e293b';
        tdName.style.fontWeight = '500';
        tdName.style.overflow = 'hidden';
        tdName.style.textOverflow = 'ellipsis';
        tdName.style.whiteSpace = 'nowrap';
        tdName.textContent = s.service_name || s.name || '';

        // Category cell (pill badge)
        const tdCat = document.createElement('td');
        tdCat.style.padding = '8px';
        tdCat.style.verticalAlign = 'middle';
        const catBadge = document.createElement('span');
        catBadge.textContent = s.category_name || s.category || '';
        catBadge.style.background = '#f1f5f9';
        catBadge.style.color = '#475569';
        catBadge.style.padding = '2px 10px';
        catBadge.style.borderRadius = '12px';
        catBadge.style.fontSize = '0.75rem';
        catBadge.style.fontWeight = '500';
        catBadge.style.whiteSpace = 'nowrap';
        tdCat.appendChild(catBadge);

        // Price cell
        const tdPrice = document.createElement('td');
        tdPrice.style.padding = '8px 12px 8px 8px';
        tdPrice.style.verticalAlign = 'middle';
        tdPrice.style.textAlign = 'right';
        tdPrice.style.fontWeight = '600';
        tdPrice.style.color = '#1e3a8a';
        tdPrice.style.whiteSpace = 'nowrap';
        tdPrice.textContent = `₹${parseFloat(s.price || 0).toLocaleString('en-IN')}`;

        tr.appendChild(tdCheck);
        tr.appendChild(tdName);
        tr.appendChild(tdCat);
        tr.appendChild(tdPrice);
        
        tr.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) servicesState.editSelectedPackageServices.add(s.service_id || s.id);
            else servicesState.editSelectedPackageServices.delete(s.service_id || s.id);
            updateEditPackageServicesChips();
            recalculateOriginalPrice(servicesState.editSelectedPackageServices, 'editPkgOriginalPrice');
        });

        tr.addEventListener('mouseenter', () => tr.style.background = '#f8fafc');
        tr.addEventListener('mouseleave', () => tr.style.background = 'transparent');
        
        tbody.appendChild(tr);
    });
}

export function updateEditPackageServicesChips() {
    const chipsContainer = document.getElementById('editPkgServicesSelectedChips');
    const placeholder = document.getElementById('editPkgServicesPlaceholder');
    if (!chipsContainer || !placeholder) return;
    
    chipsContainer.innerHTML = '';
    if (servicesState.editSelectedPackageServices.size === 0) {
        placeholder.style.display = 'inline';
    } else {
        placeholder.style.display = 'none';
        servicesState.editSelectedPackageServices.forEach(id => {
            const svc = (window.liveServicesData || servicesState.liveServicesData || []).find(s => (s.service_id || s.id) === id);
            if (svc) {
                const chip = document.createElement('span');
                chip.style.background = '#e0e7ff';
                chip.style.color = '#3730a3';
                chip.style.padding = '2px 8px';
                chip.style.borderRadius = '12px';
                chip.style.fontSize = '0.75rem';
                chip.style.fontWeight = '600';
                chip.style.display = 'inline-flex';
                chip.style.alignItems = 'center';
                chip.style.gap = '4px';
                
                const xBtn = document.createElement('i');
                xBtn.dataset.feather = 'x';
                xBtn.style.width = '12px';
                xBtn.style.height = '12px';
                xBtn.style.cursor = 'pointer';
                xBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    servicesState.editSelectedPackageServices.delete(id);
                    const editPkgServicesDropdownMenu = document.getElementById('editPkgServicesDropdownMenu');
                    if (editPkgServicesDropdownMenu) {
                        const cb = editPkgServicesDropdownMenu.querySelector(`input[value="${id}"]`);
                        if (cb) cb.checked = false;
                    }
                    updateEditPackageServicesChips();
                    recalculateOriginalPrice(servicesState.editSelectedPackageServices, 'editPkgOriginalPrice');
                });
                
                chip.appendChild(document.createTextNode(svc.service_name || svc.name));
                chip.appendChild(xBtn);
                chipsContainer.appendChild(chip);
            }
        });
        if (window.feather) feather.replace();
    }
}

export async function openEditPackageModal(pkgId) {
    const pkg = (window.livePackagesData || servicesState.livePackagesData || []).find(p => p.package_id === pkgId);
    if (!pkg) return;

    document.getElementById('editPkgId').value = pkg.package_id;
    document.getElementById('editPkgName').value = pkg.package_name;
    document.getElementById('editPkgFinalPrice').value = pkg.final_price;
    document.getElementById('editPkgDescription').value = pkg.description || '';
    
    const statusRadios = document.querySelectorAll('input[name="editPkgStatus"]');
    statusRadios.forEach(r => r.checked = (r.value === String(pkg.is_active)));

    // Fetch selected services
    try {
        const { data, error } = await fetchPackageServicesForEdit(pkg.package_id);
        if (error) throw error;
        
        servicesState.editSelectedPackageServices.clear();
        if (data) {
            data.forEach(d => servicesState.editSelectedPackageServices.add(d.service_id));
        }
    } catch(err) {
        console.error('Error fetching package services:', err);
    }

    populateEditPackageServicesDropdown();
    updateEditPackageServicesChips();
    recalculateOriginalPrice(servicesState.editSelectedPackageServices, 'editPkgOriginalPrice');
    
    document.getElementById('editPackageModal').classList.add('active');
}

export function triggerDeletePackage(pkgId, pkgName) {
    servicesState.packageToDelete = { id: pkgId, name: pkgName };
    const overlay = document.getElementById('deletePackageConfirmOverlay');
    if (overlay) overlay.classList.add('active');
}
