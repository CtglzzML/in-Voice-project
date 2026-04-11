const addItemBtn = document.getElementById('add-line-item');
// FIX 1: Target the tbody directly instead of the table
const itemTable = document.getElementById('item-list-body'); 
const rowTemplate = document.getElementById('non-empty-row');
const emptyRowTemplate = document.getElementById('empty-row');
const taxInput = document.getElementById('inv-tax');
const seePreviewBtn = document.querySelector('.preview-btn');
const seePreviewBtnWrap = document.querySelector('.preview-btn-wrap');
const returnBtn = document.querySelector('.return-btn');
const invoiceNumberInput = document.getElementById('inv-number');
const previewBtnDefaultText = seePreviewBtn ? seePreviewBtn.textContent : 'See preview';
let profileLogoUrl = '';

function formatCurrency(value) {
    return `$${Number(value).toFixed(2)}`;
}

function formatDate(dateString) {
    if (!dateString) return '---';

    const date = new Date(dateString);
    if (isNaN(date)) return '---';

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function renderEmptyStateIfNeeded() {
    const rows = itemTable.querySelectorAll('.item-row');
    const existingEmptyRow = itemTable.querySelector('.empty-row');

    if (rows.length === 0 && !existingEmptyRow) {
        const clone = emptyRowTemplate.content.cloneNode(true);
        const tr = clone.querySelector('tr');
        if (tr) {
            tr.classList.add('empty-row');
        }
        itemTable.appendChild(clone);
    }

    if (rows.length > 0 && existingEmptyRow) {
        existingEmptyRow.remove();
    }
}

function calculateInvoice() {
    let subtotal = 0;
    // Look specifically inside the itemTable (tbody) for rows
    const rows = itemTable.querySelectorAll('.item-row');

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
        const rate = parseFloat(row.querySelector('.item-rate')?.value) || 0;
        const total = qty * rate;

        const totalElement = row.querySelector('.item-total');
        if (totalElement) {
            totalElement.innerText = formatCurrency(total);
        }

        subtotal += total;
    });

    const taxPercent = parseFloat(taxInput?.value) || 0;
    const taxAmount = subtotal * (taxPercent / 100);
    const totalAmount = subtotal + taxAmount;

    const subtotalEl = document.getElementById('total-subtotal');
    const taxEl = document.getElementById('total-tva');
    const finalEl = document.getElementById('total-final');
    const taxLabelEl = document.getElementById('total-tva-label');

    if (subtotalEl) subtotalEl.innerText = formatCurrency(subtotal);
    if (taxEl) taxEl.innerText = formatCurrency(taxAmount);
    if (finalEl) finalEl.innerText = formatCurrency(totalAmount);
    if (taxLabelEl) taxLabelEl.innerText = `Tax (${taxPercent}%):`;

    updateLivePreview();
}

function addNewRow(itemData = null) {
    if (!rowTemplate) return;

    const clone = rowTemplate.content.cloneNode(true);
    const row = clone.querySelector('tr');

    if (!row) return;

    if (itemData) {
        const descInput = row.querySelector('.item-desc');
        const qtyInput = row.querySelector('.item-qty');
        const rateInput = row.querySelector('.item-rate');

        if (descInput) descInput.value = itemData.description || '';
        if (qtyInput) qtyInput.value = itemData.qty ?? 0;
        if (rateInput) rateInput.value = itemData.rate ?? 0;
    }

    const deleteBtn = row.querySelector('.delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            row.remove();
            renderEmptyStateIfNeeded();
            calculateInvoice();
            saveDraftToSession();
        });
    }

    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            calculateInvoice();
            saveDraftToSession();
        });
    });

    itemTable.appendChild(row);
    renderEmptyStateIfNeeded();
    calculateInvoice();
}

if (taxInput) {
    taxInput.addEventListener('input', () => {
        calculateInvoice();
        saveDraftToSession();
    });
}

function getInvoiceData() {
    const items = Array.from(itemTable?.querySelectorAll('.item-row') || []).map(row => {
        const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
        const rate = parseFloat(row.querySelector('.item-rate')?.value) || 0;

        return {
            description: row.querySelector('.item-desc')?.value.trim() || '',
            qty,
            rate,
            total: qty * rate
        };
    });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxPercent = parseFloat(taxInput?.value) || 0;
    const taxAmount = subtotal * (taxPercent / 100);

    return {
        invoiceNumber: document.getElementById('inv-number')?.value.trim() || '',
        invoiceDate: document.getElementById('inv-date')?.value || '',
        dueDate: document.getElementById('inv-due')?.value || '',
        taxPercent: taxPercent,
        taxAmount: taxAmount,
        subtotal: subtotal,
        totalAmount: subtotal + taxAmount,
        companyName: document.getElementById('company-name')?.value.trim() || '',
        companyAddress: document.getElementById('company-address')?.value.trim() || '',
        companyPhone: document.getElementById('company-phone')?.value.trim() || '',
        companyEmail: document.getElementById('company-email')?.value.trim() || '',
        companyLogo: profileLogoUrl || '',
        clientName: document.getElementById('client-name')?.value.trim() || '',
        clientAddress: document.getElementById('client-address')?.value.trim() || '',
        clientPhone: document.getElementById('client-phone')?.value.trim() || '',
        clientEmail: document.getElementById('client-email')?.value.trim() || '',
        comment: document.getElementById('comment')?.value.trim() || '',
        items: items
    };
}

function getClientPreviewValidationState() {
    const invoiceNumber = invoiceNumberInput ? invoiceNumberInput.value.trim() : '';
    const clientNameInput = document.getElementById('client-name');
    const clientPhoneInput = document.getElementById('client-phone');
    const clientEmailInput = document.getElementById('client-email');
    const hasItem = document.querySelectorAll('.item-row').length > 0;

    const clientName = clientNameInput ? clientNameInput.value.trim() : '';
    const clientPhone = clientPhoneInput ? clientPhoneInput.value.trim() : '';
    const clientEmail = clientEmailInput ? clientEmailInput.value.trim() : '';

    return {
        invoiceNumber,
        invoiceNumberInput,
        clientNameInput,
        clientPhoneInput,
        clientEmailInput,
        hasInvoiceNumber: invoiceNumber.length > 0,
        hasClientName: clientName.length > 0,
        hasClientContact: clientPhone.length > 0 || clientEmail.length > 0,
        hasItem: hasItem
    };
}

function updatePreviewButtonState() {
    if (!seePreviewBtn) return;
    const state = getClientPreviewValidationState();
    const isValid = state.hasInvoiceNumber && state.hasClientName && state.hasClientContact && state.hasItem;
    const hint = isValid
        ? 'Ready to open preview.'
        : 'Fill invoice number, client name, at least one contact (phone or email), and add at least one item to preview.';

    seePreviewBtn.disabled = !isValid;
    seePreviewBtn.removeAttribute('title');
    seePreviewBtn.setAttribute('aria-label', hint);

    if (seePreviewBtnWrap) {
        seePreviewBtnWrap.setAttribute('data-preview-hint', hint);
    }
}

function showPreviewValidationError(state) {
    const missingFields = [];
    if (!state.hasInvoiceNumber) {
        missingFields.push('• Invoice number');
    }
    if (!state.hasClientName) {
        missingFields.push('• Client name');
    }
    if (!state.hasClientContact) {
        missingFields.push('• Client phone or client email');
    }
    if (!state.hasItem) {
        missingFields.push('• At least one invoice item');
    }

    alert('Please complete required invoice information before previewing:\n' + missingFields.join('\n'));

    if (!state.hasInvoiceNumber && state.invoiceNumberInput) {
        state.invoiceNumberInput.focus();
        return;
    }

    if (!state.hasClientName && state.clientNameInput) {
        state.clientNameInput.focus();
        return;
    }

    if (state.clientPhoneInput) {
        state.clientPhoneInput.focus();
    } else if (state.clientEmailInput) {
        state.clientEmailInput.focus();
    } else if (addItemBtn) {
        addItemBtn.focus();
    }
}

async function isInvoiceNumberUniqueForCurrentUser(invoiceNumber) {
    const normalized = String(invoiceNumber || '').trim();
    if (!normalized) {
        return false;
    }

    if (!window._supabase || typeof window.getCurrentUser !== 'function') {
        return true;
    }

    const user = await window.getCurrentUser();
    if (!user || !user.id) {
        return true;
    }

    const result = await window._supabase
        .from('invoices')
        .select('id')
        .eq('user_id', user.id)
        .eq('invoice_number', normalized)
        .limit(1);

    if (result.error) {
        throw result.error;
    }

    return !(Array.isArray(result.data) && result.data.length > 0);
}

function saveDraftToSession() {
    const data = getInvoiceData();
    const dataString = JSON.stringify(data);

    sessionStorage.setItem('invoiceDraft', dataString);
    localStorage.setItem('persistentInvoiceDraft', dataString);
}

function loadDraftFromSession() {
    const raw = sessionStorage.getItem('invoiceDraft') || localStorage.getItem('persistentInvoiceDraft');

    if (!raw) {
        renderEmptyStateIfNeeded();
        calculateInvoice();
        updatePreviewButtonState();
        return;
    }

    try {
        const data = JSON.parse(raw);

        document.getElementById('inv-number').value = data.invoiceNumber || '';
        document.getElementById('inv-date').value = data.invoiceDate || '';
        document.getElementById('inv-due').value = data.dueDate || '';
        document.getElementById('inv-tax').value = data.taxPercent ?? '';
        document.getElementById('company-name').value = data.companyName || '';
        document.getElementById('company-address').value = data.companyAddress || '';
        document.getElementById('company-phone').value = data.companyPhone || '';
        document.getElementById('company-email').value = data.companyEmail || '';
        document.getElementById('client-name').value = data.clientName || '';
        document.getElementById('client-address').value = data.clientAddress || '';
        document.getElementById('client-phone').value = data.clientPhone || '';
        document.getElementById('client-email').value = data.clientEmail || '';
        document.getElementById('comment').value = data.comment || '';

        itemTable.innerHTML = ''; // Clear table before filling from data

        if (Array.isArray(data.items) && data.items.length > 0) {
            data.items.forEach(item => addNewRow(item));
        } else {
            renderEmptyStateIfNeeded();
        }
        calculateInvoice();
        updatePreviewButtonState();
    } catch (error) {
        console.error('Error loading invoice draft:', error);
        renderEmptyStateIfNeeded();
        calculateInvoice();
        updatePreviewButtonState();
    }
}

function updateLivePreview() {
    const data = getInvoiceData();
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const previewCompanyName = document.querySelector('.preview-company p');
    if (previewCompanyName) previewCompanyName.textContent = data.companyName || 'My Company';

    setText('preview-invoice-number', `# ${data.invoiceNumber || '---'}`);
    setText('preview-date', `Date ${formatDate(data.invoiceDate)}`);
    setText('preview-company-address', `From: ${data.companyAddress || '-'}`);
    setText('preview-company-phone', `Phone: ${data.companyPhone || '-'}`);
    setText('preview-company-email', `Email: ${data.companyEmail || '-'}`);
    setText('preview-client-name', data.clientName || 'Client name: -');
    setText('preview-client-address', `Client address: ${data.clientAddress || '-'}`);
    setText('preview-client-phone', `Client phone: ${data.clientPhone || '-'}`);
    setText('preview-client-email', `Client email: ${data.clientEmail || '-'}`);

    const previewLogoDisplay = document.getElementById('preview-logo-display');
    if (previewLogoDisplay) {
        if (profileLogoUrl) {
            previewLogoDisplay.src = profileLogoUrl;
            previewLogoDisplay.style.display = 'block';
        } else {
            previewLogoDisplay.src = '';
            previewLogoDisplay.style.display = 'none';
        }
    }

    const previewComment = document.querySelector('.preview-note-content');
    if (previewComment) {
        previewComment.textContent = data.comment || 'Nothing to add';
    }
}

// --- BUTTONS & INPUT LISTENERS ---

if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
        addNewRow();
        updatePreviewButtonState();
        saveDraftToSession();
    });
}

// Event delegation for item-list changes
if (itemTable) {
    itemTable.addEventListener('input', (e) => {
        if (e.target.matches('input')) {
            calculateInvoice();
            saveDraftToSession();
        }
    });

    itemTable.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) {
            const row = e.target.closest('.item-row');
            if (row) {
                row.remove();
                renderEmptyStateIfNeeded();
                calculateInvoice();
                updatePreviewButtonState();
                saveDraftToSession();
            }
        }
    });
}

document.querySelectorAll(
    '#inv-number, #inv-date, #inv-due, #company-name, #company-address, #company-phone, #company-email, #client-name, #client-address, #client-phone, #client-email, #comment'
).forEach(input => {
    input.addEventListener('input', () => {
        updateLivePreview();
        updatePreviewButtonState();
        saveDraftToSession();
    });
});

if (seePreviewBtn) {
    seePreviewBtn.addEventListener('click', async (e) => {
        const state = getClientPreviewValidationState();
        if (!(state.hasInvoiceNumber && state.hasClientName && state.hasClientContact && state.hasItem)) {
            e.preventDefault();
            showPreviewValidationError(state);
            updatePreviewButtonState();
            return;
        }

        seePreviewBtn.disabled = true;
        seePreviewBtn.textContent = 'Checking...';

        try {
            const isUnique = await isInvoiceNumberUniqueForCurrentUser(state.invoiceNumber);
            if (!isUnique) {
                alert('This invoice number already exists. Please choose a unique invoice number.');
                if (state.invoiceNumberInput) {
                    state.invoiceNumberInput.focus();
                    state.invoiceNumberInput.select();
                }
                updatePreviewButtonState();
                return;
            }
        } catch (error) {
            console.error('Error checking invoice number uniqueness:', error);
            alert('Could not validate invoice number uniqueness right now. Please try again.');
            updatePreviewButtonState();
            return;
        } finally {
            if (seePreviewBtn) {
                seePreviewBtn.textContent = previewBtnDefaultText;
            }
        }

        saveDraftToSession();
        window.location.href = 'invoice_preview.html';
    });
}

if (returnBtn) {
    returnBtn.addEventListener('click', () => {
        // Change this to your actual home or library page
        window.history.back();
    });
}

const cancelInvoiceBtn = document.getElementById('cancel-invoice-btn');
if (cancelInvoiceBtn) {
    cancelInvoiceBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to cancel? Any unsaved progress will be permanently lost.")) {
            // Clear all trace of the draft exactly as if they started over
            sessionStorage.removeItem('invoiceDraft');
            localStorage.removeItem('persistentInvoiceDraft');
            
            // Send back to dashboard
            window.location.href = 'dashboard.html';
        }
    });
}

async function autofillFromProfile() {
    if (!window._supabase || typeof window.getCurrentUser !== 'function') return;
    
    try {
        const user = await window.getCurrentUser();
        if (!user) return;
        
        const { data: profile } = await window._supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        const cachedProfile = typeof window.getProfileCache === 'function' ? window.getProfileCache() : {};
        const mergedProfile = Object.assign({}, cachedProfile, profile || {});
        mergedProfile.email = mergedProfile.email || user.email || '';
        mergedProfile.phone = mergedProfile.phone || user.phone || '';
        if (typeof window.setProfileCache === 'function') {
            window.setProfileCache(mergedProfile);
        }
        if (!Object.keys(mergedProfile).length) return;
        
        const companyName = document.getElementById('company-name');
        const companyAddress = document.getElementById('company-address');
        const companyPhone = document.getElementById('company-phone');
        const companyEmail = document.getElementById('company-email');
        const taxInput = document.getElementById('inv-tax');
        const profileCompanyName = mergedProfile.Company_name || mergedProfile.company_name || mergedProfile.name || (user.user_metadata && user.user_metadata.full_name) || '';
        const profileAddress = mergedProfile.address || '';
        const profilePhone = mergedProfile.phone || '';
        const profileEmail = mergedProfile.email || '';
        const nextProfileLogoUrl = mergedProfile.logo_url || '';
        
        let changed = false;

        // Keep seller/account info aligned with the saved profile.
        if (companyName && companyName.value !== profileCompanyName) {
            companyName.value = profileCompanyName;
            changed = true;
        }
        if (companyAddress && companyAddress.value !== profileAddress) {
            companyAddress.value = profileAddress;
            changed = true;
        }
        if (companyPhone && companyPhone.value !== profilePhone) {
            companyPhone.value = profilePhone;
            changed = true;
        }
        if (companyEmail && companyEmail.value !== profileEmail) {
            companyEmail.value = profileEmail;
            changed = true;
        }
        if (taxInput && mergedProfile.default_tva != null && String(taxInput.value) !== String(mergedProfile.default_tva)) {
            taxInput.value = mergedProfile.default_tva;
            changed = true;
        }

        if (profileLogoUrl !== nextProfileLogoUrl) {
            profileLogoUrl = nextProfileLogoUrl;
            changed = true;
        }

        if (changed) {
            updateLivePreview();
            calculateInvoice();
            saveDraftToSession();
        }

        updatePreviewButtonState();

    } catch (e) {
        console.error("Error autofilling profile:", e);
    }
}

// ── Autofill client fields from the Customer Info page selection ──
function autofillFromSelectedClient() {
    try {
        const raw = sessionStorage.getItem('selectedClient');
        if (!raw) return;

        const client = JSON.parse(raw);
        // Remove so it doesn't persist on refresh
        sessionStorage.removeItem('selectedClient');

        const clientName = document.getElementById('client-name');
        const clientAddress = document.getElementById('client-address');
        const clientEmail = document.getElementById('client-email');
        const clientPhone = document.getElementById('client-phone');

        if (clientName) clientName.value = client.name || '';
        if (clientAddress) clientAddress.value = client.address || '';
        if (clientEmail) clientEmail.value = client.email || '';
        if (clientPhone) clientPhone.value = client.phone || '';

        updateLivePreview();
        updatePreviewButtonState();
        saveDraftToSession();
    } catch (e) {
        console.error('Error autofilling selected client:', e);
    }
}

loadDraftFromSession();
updateLivePreview();
calculateInvoice();
updatePreviewButtonState();
autofillFromProfile();
autofillFromSelectedClient();
