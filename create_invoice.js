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
        tr.classList.add('empty-row');
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
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(row.querySelector('.item-rate').value) || 0;
        const total = qty * rate;

        row.querySelector('.item-total').innerText = formatCurrency(total);
        subtotal += total;
    });

    const taxPercent = parseFloat(taxInput.value) || 0;
    const taxAmount = subtotal * (taxPercent / 100);
    const totalAmount = subtotal + taxAmount;

    const totalsArea = document.querySelector('.preview-totals');
    const totalRows = totalsArea.querySelectorAll('.preview-total-row span:last-child');

    if (totalRows.length >= 3) {
        totalRows[0].innerText = formatCurrency(subtotal);
        totalRows[1].innerText = formatCurrency(taxAmount);
        totalRows[2].innerText = formatCurrency(totalAmount);
        const taxLabel = totalsArea.querySelectorAll('.preview-total-row span:first-child')[1];
        if (taxLabel) taxLabel.innerText = `Tax (${taxPercent}%):`;
    }

    updateLivePreview();
}

// 1. UPDATED: addNewRow now accepts data to fill the fields
function addNewRow(itemData = null) {
    const clone = rowTemplate.content.cloneNode(true);
    const row = clone.querySelector('tr');

    // Fill fields if data is provided (from Load)
    if (itemData) {
        row.querySelector('.item-desc').value = itemData.description || '';
        row.querySelector('.item-qty').value = itemData.qty || 0;
        row.querySelector('.item-rate').value = itemData.rate || 0;
    }

    row.querySelector('.delete-btn').addEventListener('click', () => {
        row.remove();
        renderEmptyStateIfNeeded();
        calculateInvoice();
        saveDraftToSession();
    });

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

taxInput.addEventListener('input', () => {
    calculateInvoice();
    saveDraftToSession();
});

function getInvoiceData() {
    const items = Array.from(document.querySelectorAll('.item-row')).map(row => {
        return {
            description: row.querySelector('.item-desc').value.trim(),
            qty: parseFloat(row.querySelector('.item-qty').value) || 0,
            rate: parseFloat(row.querySelector('.item-rate').value) || 0,
            total: (parseFloat(row.querySelector('.item-qty').value) || 0) * (parseFloat(row.querySelector('.item-rate').value) || 0)
        };
    });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxPercent = parseFloat(taxInput.value) || 0;
    const taxAmount = subtotal * (taxPercent / 100);

    return {
        invoiceNumber: document.getElementById('inv-number').value.trim(),
        invoiceDate: document.getElementById('inv-date').value,
        dueDate: document.getElementById('inv-due').value,
        taxPercent: taxPercent,
        taxAmount: taxAmount,
        subtotal: subtotal,
        totalAmount: subtotal + taxAmount,
        companyName: document.getElementById('company-name').value.trim(),
        companyAddress: document.getElementById('company-address').value.trim(),
        companyPhone: document.getElementById('company-phone').value.trim(),
        companyEmail: document.getElementById('company-email').value.trim(),
        clientName: document.getElementById('client-name').value.trim(),
        clientAddress: document.getElementById('client-address').value.trim(),
        clientPhone: document.getElementById('client-phone').value.trim(),
        clientEmail: document.getElementById('client-email').value.trim(),
        comment: document.getElementById('comment').value.trim(),
        items: items
    };
}

function saveDraftToSession() {
    const data = getInvoiceData();
    const dataString = JSON.stringify(data);
    sessionStorage.setItem('invoiceDraft', dataString);
    localStorage.setItem('persistentInvoiceDraft', dataString); // Persistent copy
}

function loadDraftFromSession() {
    const raw = sessionStorage.getItem('invoiceDraft');

    // Load Logo from LocalStorage
    const savedLogo = localStorage.getItem('invoiceLogo');
    if (savedLogo && preview) {
        preview.src = savedLogo;
        preview.style.display = 'block';
        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
    }

    if (!raw) {
        renderEmptyStateIfNeeded();
        calculateInvoice();
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
    } catch (error) {
        console.error('Error loading invoice draft:', error);
        renderEmptyStateIfNeeded();
    }
}

// 2. UPDATED: Stop updateLivePreview from overwriting the item list table
function updateLivePreview() {
    const data = getInvoiceData();

    // Update text fields
    document.querySelector('.preview-company').textContent = data.companyName || 'My Company';
    document.querySelector('.preview-invoice-meta p').textContent = `# ${data.invoiceNumber || '---'}`;
    document.querySelector('.bill-box p').textContent = data.clientName || 'xClient Inc.';

    document.getElementById('preview-company-address').textContent = `From: ${data.companyAddress || '-'}`;
    document.getElementById('preview-company-phone').textContent = `Phone: ${data.companyPhone || '-'}`;
    document.getElementById('preview-company-email').textContent = `Email: ${data.companyEmail || '-'}`;

    document.getElementById('preview-client-address').textContent = `Client address: ${data.clientAddress || '-'}`;
    document.getElementById('preview-client-phone').textContent = `Client phone: ${data.clientPhone || '-'}`;
    document.getElementById('preview-client-email').textContent = `Client email: ${data.clientEmail || '-'}`;

    // Logo
    const previewLogoDisplay = document.querySelector('.preview-note');
    if (previewComments) {
        previewComments.textContent = data.comment || 'Nothing to add';
    }

    const savedLogo = localStorage.getItem('invoiceLogo');
    if (savedLogo) {
        previewLogoDisplay.src = savedLogo;
        previewLogoDisplay.style.display = 'block';
    } else {
        previewLogoDisplay.style.display = 'none';
    }

    const previewComment = document.getElementById('')

    // Table rows in Live Preview
    const previewTable = document.querySelector('.item-list');
    // Important: Only clear and re-render if you have a separate preview table 
    // or just update the totals if the items are already handled in the editor.
}

// --- BUTTONS & INPUT LISTENERS ---

addItemBtn.addEventListener('click', () => {
    addNewRow(); // Just adds one empty row
    saveDraftToSession();
});

document.querySelectorAll(
    '#inv-number, #inv-date, #inv-due, #company-name, #company-address, #company-phone, #company-email, #client-name, #client-address, #client-phone, #client-email, #comment'
).forEach(input => {
    input.addEventListener('input', () => {
        updateLivePreview();
        saveDraftToSession();
    });
});

fileInput.addEventListener('change', function () {
    if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;

            // Update the Left Panel (Upload area)
            preview.src = imageData;
            preview.style.display = 'block';
            logoPlaceholder.style.display = 'none';

            // Save it
            localStorage.setItem('invoiceLogo', imageData);

            // TRIGGER the preview update immediately
            updateLivePreview();
        };
        reader.readAsDataURL(this.files[0]);
    }
});

const deleteLogoBtn = document.getElementById('delete-logo-btn');

if (deleteLogoBtn) {
    deleteLogoBtn.addEventListener('click', () => {
        // Clear Left Panel
        preview.src = "";
        preview.style.display = 'none';
        logoPlaceholder.style.display = 'block';
        fileInput.value = "";

        // Clear Storage
        localStorage.removeItem('invoiceLogo');

        // Update Live Preview
        updateLivePreview();
    });
}

if (seePreviewBtn) {
    seePreviewBtn.addEventListener('click', () => {
        saveDraftToSession(); // Save data first
        window.location.href = 'invoice_preview.html';
    });
}

if (returnBtn) {
    returnBtn.addEventListener('click', () => {
        // Change this to your actual home or library page
        window.history.back();
    });
}

loadDraftFromSession();