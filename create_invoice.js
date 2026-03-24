const addItemBtn = document.getElementById('add-line-item');
const itemTable = document.querySelector('.item-list');
const rowTemplate = document.getElementById('non-empty-row');
const emptyRowTemplate = document.getElementById('empty-row');
const taxInput = document.getElementById('inv-tax');

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

    totalRows[0].innerText = formatCurrency(subtotal);
    totalRows[1].innerText = formatCurrency(taxAmount);
    totalRows[2].innerText = formatCurrency(totalAmount);

    const taxLabel = totalsArea.querySelectorAll('.preview-total-row span:first-child')[1];
    taxLabel.innerText = `Tax (${taxPercent}%):`;

    updateLivePreview();
}

function attachRowEvents(row) {
    row.querySelector('.delete-btn').addEventListener('click', () => {
        row.remove();
        renderEmptyStateIfNeeded();
        calculateInvoice();
        saveDraftToSession();
    });

    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            renderEmptyStateIfNeeded();
            calculateInvoice();
            saveDraftToSession();
        });
    });
}

function addNewRow(itemData = null) {
    const emptyRow = itemTable.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    const clone = rowTemplate.content.cloneNode(true);
    const row = clone.querySelector('tr');

    if (itemData) {
        row.querySelector('.item-desc').value = itemData.description || '';
        row.querySelector('.item-qty').value = itemData.qty ?? 1;
        row.querySelector('.item-rate').value = itemData.rate ?? 0;
    }

    attachRowEvents(row);
    itemTable.appendChild(clone);
    renderEmptyStateIfNeeded();
    calculateInvoice();
}

function getInvoiceData() {
    const items = Array.from(document.querySelectorAll('.item-row')).map(row => {
        const description = row.querySelector('.item-desc').value.trim();
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(row.querySelector('.item-rate').value) || 0;

        return {
            description,
            qty,
            rate,
            total: qty * rate
        };
    });

    const filteredItems = items.filter(item =>
        item.description !== '' || item.qty !== 0 || item.rate !== 0
    );

    const taxPercent = parseFloat(document.getElementById('inv-tax').value) || 0;
    const subtotal = filteredItems.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = subtotal * (taxPercent / 100);
    const totalAmount = subtotal + taxAmount;

    return {
        invoiceNumber: document.getElementById('inv-number').value.trim(),
        invoiceDate: document.getElementById('inv-date').value,
        dueDate: document.getElementById('inv-due').value,
        taxPercent,

        companyName: document.getElementById('company-name').value.trim(),
        companyAddress: document.getElementById('company-address').value.trim(),
        companyPhone: document.getElementById('company-phone').value.trim(),
        companyEmail: document.getElementById('company-email').value.trim(),

        clientName: document.getElementById('client-name').value.trim(),
        clientAddress: document.getElementById('client-address').value.trim(),
        clientPhone: document.getElementById('client-phone').value.trim(),
        clientEmail: document.getElementById('client-email').value.trim(),

        comment: document.getElementById('comment').value.trim(),

        items: filteredItems,
        subtotal,
        taxAmount,
        totalAmount
    };
}

function saveDraftToSession() {
    const data = getInvoiceData();
    sessionStorage.setItem('invoiceDraft', JSON.stringify(data));
}

function loadDraftFromSession() {
    const raw = sessionStorage.getItem('invoiceDraft');
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

    const previewCompany = document.querySelector('.preview-company');
    const previewInvoiceNumber = document.querySelector('.preview-invoice-meta p');
    const previewInvoiceDate = document.querySelector('.preview-invoice-meta span');
    const previewBillTo = document.querySelector('.bill-box p');
    const previewTable = document.querySelector('.item-list');

    previewCompany.textContent = data.companyName || 'My company';
    previewInvoiceNumber.textContent = data.invoiceNumber ? `# ${data.invoiceNumber}` : '# ---';
    previewInvoiceDate.textContent = `Date ${formatDate(data.invoiceDate)}`;
    previewBillTo.textContent = data.clientName || 'xClient Inc.';

    previewTable.innerHTML = '';

    if (data.items.length === 0) {
        const clone = emptyRowTemplate.content.cloneNode(true);
        const tr = clone.querySelector('tr');
        tr.classList.add('empty-row');
        previewTable.appendChild(clone);
    } else {
        data.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.description || '-'}</td>
                <td>${item.qty}</td>
                <td>${formatCurrency(item.rate)}</td>
                <td>${formatCurrency(item.total)}</td>
                <td></td>
            `;
            previewTable.appendChild(tr);
        });
    }
}

const returnBtn = document.querySelector('.return-btn');
if (returnBtn) {
    returnBtn.addEventListener('click', () => {
        window.location.href = 'landing_page.html';
    });
}

const seePreviewBtn = document.querySelector('.preview-btn');
if (seePreviewBtn) {
    seePreviewBtn.addEventListener('click', () => {
        saveDraftToSession();
        window.location.href = 'invoice_preview.html';
    });
}

addItemBtn.addEventListener('click', () => {
    addNewRow();
    saveDraftToSession();
});

taxInput.addEventListener('input', () => {
    calculateInvoice();
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

loadDraftFromSession();