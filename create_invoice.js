const addItemBtn = document.getElementById('add-line-item');
const itemTable = document.querySelector('.item-list');
const rowTemplate = document.getElementById('non-empty-row');
const emptyRowTemplate = document.getElementById('empty-row');
const taxInput = document.getElementById('inv-tax');
const fileInput = document.getElementById('company-logo');
const preview = document.getElementById('logo-preview');
const logoPlaceholder = document.getElementById('placeholder-logo');
const seePreviewBtn = document.querySelector('.preview-btn');
const returnBtn = document.querySelector('.return-btn');
const deleteLogoBtn = document.getElementById('delete-logo-btn');

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
    const rows = document.querySelectorAll('.item-row');

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

function getInvoiceData() {
    const items = Array.from(document.querySelectorAll('.item-row')).map(row => {
        const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
        const rate = parseFloat(row.querySelector('.item-rate')?.value) || 0;

        return {
            description: row.querySelector('.item-desc')?.value.trim() || '',
            qty: qty,
            rate: rate,
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
        clientName: document.getElementById('client-name')?.value.trim() || '',
        clientAddress: document.getElementById('client-address')?.value.trim() || '',
        clientPhone: document.getElementById('client-phone')?.value.trim() || '',
        clientEmail: document.getElementById('client-email')?.value.trim() || '',
        comment: document.getElementById('comment')?.value.trim() || '',
        items: items
    };
}

function saveDraftToSession() {
    const data = getInvoiceData();
    const dataString = JSON.stringify(data);

    sessionStorage.setItem('invoiceDraft', dataString);
    localStorage.setItem('persistentInvoiceDraft', dataString);
}

function loadDraftFromSession() {
    const raw = sessionStorage.getItem('invoiceDraft');

    const savedLogo = localStorage.getItem('invoiceLogo');
    if (savedLogo && preview) {
        preview.src = savedLogo;
        preview.style.display = 'block';

        if (logoPlaceholder) {
            logoPlaceholder.style.display = 'none';
        }
    }

    if (!raw) {
        renderEmptyStateIfNeeded();
        calculateInvoice();
        return;
    }

    try {
        const data = JSON.parse(raw);

        const invNumber = document.getElementById('inv-number');
        const invDate = document.getElementById('inv-date');
        const invDue = document.getElementById('inv-due');
        const invTax = document.getElementById('inv-tax');
        const companyName = document.getElementById('company-name');
        const companyAddress = document.getElementById('company-address');
        const companyPhone = document.getElementById('company-phone');
        const companyEmail = document.getElementById('company-email');
        const clientName = document.getElementById('client-name');
        const clientAddress = document.getElementById('client-address');
        const clientPhone = document.getElementById('client-phone');
        const clientEmail = document.getElementById('client-email');
        const comment = document.getElementById('comment');

        if (invNumber) invNumber.value = data.invoiceNumber || '';
        if (invDate) invDate.value = data.invoiceDate || '';
        if (invDue) invDue.value = data.dueDate || '';
        if (invTax) invTax.value = data.taxPercent ?? '';
        if (companyName) companyName.value = data.companyName || '';
        if (companyAddress) companyAddress.value = data.companyAddress || '';
        if (companyPhone) companyPhone.value = data.companyPhone || '';
        if (companyEmail) companyEmail.value = data.companyEmail || '';
        if (clientName) clientName.value = data.clientName || '';
        if (clientAddress) clientAddress.value = data.clientAddress || '';
        if (clientPhone) clientPhone.value = data.clientPhone || '';
        if (clientEmail) clientEmail.value = data.clientEmail || '';
        if (comment) comment.value = data.comment || '';

        itemTable.innerHTML = '';

        if (Array.isArray(data.items) && data.items.length > 0) {
            data.items.forEach(item => addNewRow(item));
        } else {
            renderEmptyStateIfNeeded();
        }

        calculateInvoice();
    } catch (error) {
        console.error('Error loading invoice draft:', error);
        renderEmptyStateIfNeeded();
        calculateInvoice();
    }
}

function updateLivePreview() {
    const data = getInvoiceData();

    const previewCompanyName = document.querySelector('.preview-company p');
    if (previewCompanyName) {
        previewCompanyName.textContent = data.companyName || 'My Company';
    }

    const previewInvoiceNumber = document.getElementById('preview-invoice-number');
    if (previewInvoiceNumber) {
        previewInvoiceNumber.textContent = `# ${data.invoiceNumber || '---'}`;
    }

    const previewDate = document.getElementById('preview-date');
    if (previewDate) {
        previewDate.textContent = `Date ${formatDate(data.invoiceDate)}`;
    }

    const previewDueDate = document.getElementById('preview-due-date');
    if (previewDueDate) {
        previewDueDate.textContent = data.dueDate ? `Due ${formatDate(data.dueDate)}` : '';
    }

    const previewCompanyAddress = document.getElementById('preview-company-address');
    const previewCompanyPhone = document.getElementById('preview-company-phone');
    const previewCompanyEmail = document.getElementById('preview-company-email');

    if (previewCompanyAddress) {
        previewCompanyAddress.textContent = `From: ${data.companyAddress || '-'}`;
    }

    if (previewCompanyPhone) {
        previewCompanyPhone.textContent = `Phone: ${data.companyPhone || '-'}`;
    }

    if (previewCompanyEmail) {
        previewCompanyEmail.textContent = `Email: ${data.companyEmail || '-'}`;
    }

    const previewClientName = document.getElementById('preview-client-name');
    const previewClientAddress = document.getElementById('preview-client-address');
    const previewClientPhone = document.getElementById('preview-client-phone');
    const previewClientEmail = document.getElementById('preview-client-email');

    if (previewClientName) {
        previewClientName.textContent = data.clientName || 'Client name: -';
    }

    if (previewClientAddress) {
        previewClientAddress.textContent = `Client address: ${data.clientAddress || '-'}`;
    }

    if (previewClientPhone) {
        previewClientPhone.textContent = `Client phone: ${data.clientPhone || '-'}`;
    }

    if (previewClientEmail) {
        previewClientEmail.textContent = `Client email: ${data.clientEmail || '-'}`;
    }

    const previewLogoDisplay = document.getElementById('preview-logo-display');
    const savedLogo = localStorage.getItem('invoiceLogo');

    if (previewLogoDisplay) {
        if (savedLogo) {
            previewLogoDisplay.src = savedLogo;
            previewLogoDisplay.style.display = 'block';
        } else {
            previewLogoDisplay.style.display = 'none';
            previewLogoDisplay.src = '';
        }
    }

    const previewComment = document.querySelector('.preview-note-content');
    if (previewComment) {
        previewComment.textContent = data.comment || 'Nothing to add';
    }
}

if (taxInput) {
    taxInput.addEventListener('input', () => {
        calculateInvoice();
        saveDraftToSession();
    });
}

if (addItemBtn) {
    addItemBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation(); // 🔥 evita duplicados de otros listeners
        addNewRow();
        saveDraftToSession();
    });
}

document.querySelectorAll(
    '#inv-number, #inv-date, #inv-due, #company-name, #company-address, #company-phone, #company-email, #client-name, #client-address, #client-phone, #client-email, #comment'
).forEach(input => {
    input.addEventListener('input', () => {
        updateLivePreview();
        saveDraftToSession();
    });
});

if (fileInput) {
    fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            const reader = new FileReader();

            reader.onload = (e) => {
                const imageData = e.target.result;

                if (preview) {
                    preview.src = imageData;
                    preview.style.display = 'block';
                }

                if (logoPlaceholder) {
                    logoPlaceholder.style.display = 'none';
                }

                localStorage.setItem('invoiceLogo', imageData);
                updateLivePreview();
            };

            reader.readAsDataURL(this.files[0]);
        }
    });
}

if (deleteLogoBtn) {
    deleteLogoBtn.addEventListener('click', () => {
        if (preview) {
            preview.src = '';
            preview.style.display = 'none';
        }

        if (logoPlaceholder) {
            logoPlaceholder.style.display = 'block';
        }

        if (fileInput) {
            fileInput.value = '';
        }

        localStorage.removeItem('invoiceLogo');
        updateLivePreview();
    });
}

if (seePreviewBtn) {
    seePreviewBtn.addEventListener('click', () => {
        saveDraftToSession();
        window.location.href = 'invoice_preview.html';
    });
}

if (returnBtn) {
    returnBtn.addEventListener('click', () => {
        window.history.back();
    });
}

loadDraftFromSession();
updateLivePreview();
calculateInvoice();