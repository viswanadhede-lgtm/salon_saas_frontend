// scripts/services/services-packages.js
// Package UI management: multi-select service dropdowns, chips, package modals.
// Preserves exact DOM interactions, styles, and Set data structures.

import { servicesState } from './services-state.js';
import { fetchPackageServicesForEdit } from './services-api.js';

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
    const pkgServicesDropdownMenu = document.getElementById('pkgServicesDropdownMenu');
    if (!pkgServicesDropdownMenu) return;
    pkgServicesDropdownMenu.innerHTML = '';
    servicesState.selectedPackageServices.clear();
    updatePackageServicesChips();

    (window.liveServicesData || servicesState.liveServicesData || []).filter(s => s.status === 'active').forEach(s => {
        const itemDiv = document.createElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.flexDirection = 'row';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.justifyContent = 'flex-start';
        itemDiv.style.padding = '10px 16px';
        itemDiv.style.cursor = 'pointer';
        itemDiv.style.width = '100%';
        itemDiv.style.boxSizing = 'border-box';
        itemDiv.style.margin = '0';
        itemDiv.style.borderBottom = '1px solid #f1f5f9';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = s.service_id || s.id;
        checkbox.dataset.name = s.service_name || s.name;
        checkbox.style.display = 'inline-block';
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        checkbox.style.margin = '0 12px 0 0';
        checkbox.style.padding = '0';
        checkbox.style.accentColor = '#1e3a8a';
        checkbox.style.flexShrink = '0';
        checkbox.style.cursor = 'pointer';

        const textSpan = document.createElement('span');
        textSpan.textContent = s.service_name || s.name;
        textSpan.style.display = 'inline-block';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.fontSize = '0.9rem';
        textSpan.style.color = '#374151';
        textSpan.style.flexGrow = '1';
        textSpan.style.textAlign = 'left';
        
        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(textSpan);
        
        itemDiv.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) servicesState.selectedPackageServices.add(s.service_id || s.id);
            else servicesState.selectedPackageServices.delete(s.service_id || s.id);
            updatePackageServicesChips();
        });

        itemDiv.addEventListener('mouseenter', () => itemDiv.style.background = '#f8fafc');
        itemDiv.addEventListener('mouseleave', () => itemDiv.style.background = 'transparent');
        
        pkgServicesDropdownMenu.appendChild(itemDiv);
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
    const editPkgServicesDropdownMenu = document.getElementById('editPkgServicesDropdownMenu');
    if (!editPkgServicesDropdownMenu) return;
    editPkgServicesDropdownMenu.innerHTML = '';
    updateEditPackageServicesChips();

    (window.liveServicesData || servicesState.liveServicesData || []).filter(s => s.status === 'active').forEach(s => {
        const itemDiv = document.createElement('div');
        itemDiv.style.display = 'flex';
        itemDiv.style.flexDirection = 'row';
        itemDiv.style.alignItems = 'center';
        itemDiv.style.justifyContent = 'flex-start';
        itemDiv.style.padding = '10px 16px';
        itemDiv.style.cursor = 'pointer';
        itemDiv.style.width = '100%';
        itemDiv.style.boxSizing = 'border-box';
        itemDiv.style.margin = '0';
        itemDiv.style.borderBottom = '1px solid #f1f5f9';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = s.service_id || s.id;
        checkbox.dataset.name = s.service_name || s.name;
        checkbox.style.display = 'inline-block';
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        checkbox.style.margin = '0 12px 0 0';
        checkbox.style.padding = '0';
        checkbox.style.accentColor = '#1e3a8a';
        checkbox.style.flexShrink = '0';
        checkbox.style.cursor = 'pointer';
        
        if (servicesState.editSelectedPackageServices.has(checkbox.value)) {
            checkbox.checked = true;
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = s.service_name || s.name;
        textSpan.style.display = 'inline-block';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.fontSize = '0.9rem';
        textSpan.style.color = '#374151';
        textSpan.style.flexGrow = '1';
        textSpan.style.textAlign = 'left';
        
        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(textSpan);
        
        itemDiv.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) servicesState.editSelectedPackageServices.add(s.service_id || s.id);
            else servicesState.editSelectedPackageServices.delete(s.service_id || s.id);
            updateEditPackageServicesChips();
        });

        itemDiv.addEventListener('mouseenter', () => itemDiv.style.background = '#f8fafc');
        itemDiv.addEventListener('mouseleave', () => itemDiv.style.background = 'transparent');
        
        editPkgServicesDropdownMenu.appendChild(itemDiv);
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
    document.getElementById('editPkgOriginalPrice').value = pkg.original_price;
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
    
    document.getElementById('editPackageModal').classList.add('active');
}

export function triggerDeletePackage(pkgId, pkgName) {
    servicesState.packageToDelete = { id: pkgId, name: pkgName };
    const overlay = document.getElementById('deletePackageConfirmOverlay');
    if (overlay) overlay.classList.add('active');
}
