const libraryBody = document.getElementById('library-items');
const rowTemplate = document.getElementById('library-item-row-template');
const emptyTemplate = document.getElementById('empty-library-row-template');
const searchInput = document.querySelector('input[placeholder="search"]');
const createInvoiceBtn = document.querySelector('.create-invoice-btn');
const downloadInvoiceBtn = document.querySelector('.download-invoice-btn');

let selectedInvoice = null;

function formatCurrency(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    if (isNaN(date)) return '-';

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function getSavedInvoices() {
    const raw = localStorage.getItem('savedInvoices');
    if (!raw) return [];

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error('Error reading saved invoices:', error);
        return [];
    }
}

function renderLibrary(data) {
    libraryBody.innerHTML = '';

    if (!data.length) {
        libraryBody.appendChild(emptyTemplate.content.cloneNode(true));
        resetPreview();
        return;
    }

    data.forEach(item => {
        const clone = rowTemplate.content.cloneNode(true);
        const row = clone.querySelector('tr');
        const cells = clone.querySelectorAll('td');
        const invoice = item.fullInvoice || {};

        row.dataset.dbId = item.dbId || '';

        const rowValues = [
            invoice.invoiceNumber || item.fileName || '-',
            formatDate(invoice.invoiceDate),
            formatDate(invoice.dueDate),
            invoice.companyName || '-',
            invoice.clientName || '-',
            invoice.clientEmail || '-',
            invoice.clientPhone || '-',
            formatCurrency(invoice.totalAmount)
        ];

        cells.forEach((cell, index) => {
            cell.textContent = rowValues[index];
        });

        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
            showPreview(item);
        });

        libraryBody.appendChild(clone);
    });
}

function resetPreview() {
    const previewTitle = document.querySelector('.preview-title');
    const previewSheet = document.querySelector('.preview-sheet');
    const descriptionText = document.querySelector('.description-text');
    const tagsList = document.getElementById('tags-list');

    selectedInvoice = null;
    previewTitle.textContent = 'Invoice preview';

    previewSheet.innerHTML = `
        <div class="preview-placeholder">
            <p class="preview-placeholder-title">No invoice selected</p>
            <p class="preview-placeholder-text">Select an invoice from the library to preview it here.</p>
        </div>
    `;

    descriptionText.textContent = 'No description available yet.';
    tagsList.innerHTML = `<button class="add-tag-btn" type="button" aria-label="Add tag">+</button>`;
}

function showPreview(item) {
    const previewTitle = document.querySelector('.preview-title');
    const previewSheet = document.querySelector('.preview-sheet');
    const descriptionText = document.querySelector('.description-text');
    const tagsList = document.getElementById('tags-list');
    const invoice = item.fullInvoice;

    selectedInvoice = invoice || null;

    previewTitle.textContent = `Preview: ${invoice?.invoiceNumber || item.fileName || 'Invoice'}`;
    descriptionText.textContent = item.description || invoice?.comment || 'No description available yet.';

    tagsList.innerHTML = `<button class="add-tag-btn" type="button" aria-label="Add tag">+</button>`;

    if (Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'tag-chip';
            tagElement.textContent = tag;
            tagsList.appendChild(tagElement);
        });
    }

    if (!invoice) {
        previewSheet.innerHTML = `
            <div class="preview-placeholder">
                <p class="preview-placeholder-title">No invoice data</p>
                <p class="preview-placeholder-text">This saved entry has no full preview available.</p>
            </div>
        `;
        return;
    }

    const itemsHtml = invoice.items && invoice.items.length > 0
        ? invoice.items.map(line => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${line.description || '-'}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${line.qty}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${formatCurrency(line.rate)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${formatCurrency(line.total)}</td>
            </tr>
        `).join('')
        : `
            <tr>
                <td colspan="4" style="padding: 16px; text-align: center; color: #666;">
                    There are currently no items in the invoice.
                </td>
            </tr>
        `;

    previewSheet.innerHTML = `
        <div class="invoice-preview-printable" style="width: 100%; color: #111; font-family: Inter, sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 22px;">
                <div style="font-size: 1rem; font-weight: 600;">
                    ${invoice.companyName || 'My company'}
                </div>

                <div style="text-align: right;">
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;">INVOICE</h3>
                    <p style="margin: 4px 0;"># ${invoice.invoiceNumber || '---'}</p>
                    <p style="margin: 0;">Date ${formatDate(invoice.invoiceDate)}</p>
                    <p style="margin: 4px 0 0;">Due ${formatDate(invoice.dueDate)}</p>
                </div>
            </div>

            <div style="background: #62588f; color: white; padding: 10px 14px; border-radius: 4px; margin-bottom: 18px;">
                <div>Bill to:</div>
                <div style="margin-top: 4px; font-weight: 600;">${invoice.clientName || '-'}</div>
            </div>

            <div style="margin-bottom: 16px; line-height: 1.6;">
                <div><strong>Company email:</strong> ${invoice.companyEmail || '-'}</div>
                <div><strong>Company phone:</strong> ${invoice.companyPhone || '-'}</div>
                <div><strong>Company address:</strong> ${invoice.companyAddress || '-'}</div>
            </div>

            <div style="margin-bottom: 16px; line-height: 1.6;">
                <div><strong>Client email:</strong> ${invoice.clientEmail || '-'}</div>
                <div><strong>Client phone:</strong> ${invoice.clientPhone || '-'}</div>
                <div><strong>Client address:</strong> ${invoice.clientAddress || '-'}</div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
                <thead>
                    <tr style="background: #62588f; color: white;">
                        <th style="text-align: left; padding: 10px;">Description</th>
                        <th style="text-align: left; padding: 10px;">Qty</th>
                        <th style="text-align: left; padding: 10px;">Price</th>
                        <th style="text-align: left; padding: 10px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div style="width: 220px; margin-left: auto; line-height: 1.8;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Subtotal:</span>
                    <span>${formatCurrency(invoice.subtotal || 0)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Tax (${invoice.taxPercent || 0}%):</span>
                    <span>${formatCurrency(invoice.taxAmount || 0)}</span>
                </div>
                <div style="border-top: 1px solid rgba(0,0,0,0.4); margin: 8px 0;"></div>
                <div style="display: flex; justify-content: space-between; font-weight: 700;">
                    <span>TOTAL:</span>
                    <span>${formatCurrency(invoice.totalAmount || 0)}</span>
                </div>
            </div>
        </div>
    `;
}

function handleSearch() {
    const invoices = getSavedInvoices();
    const term = searchInput.value.trim().toLowerCase();

    const filtered = invoices.filter(inv => {
        const invoice = inv.fullInvoice || {};

        return (
            (invoice.invoiceNumber || '').toLowerCase().includes(term) ||
            (invoice.companyName || '').toLowerCase().includes(term) ||
            (invoice.clientName || '').toLowerCase().includes(term) ||
            (invoice.clientEmail || '').toLowerCase().includes(term)
        );
    });

    renderLibrary(filtered);
}

if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
}

if (createInvoiceBtn) {
    createInvoiceBtn.addEventListener('click', () => {
        window.location.href = 'create_invoice.html';
    });
}

if (downloadInvoiceBtn) {
    downloadInvoiceBtn.addEventListener('click', () => {
        if (!selectedInvoice) {
            alert('Please select an invoice first.');
            return;
        }

        const printableContent = document.querySelector('.invoice-preview-printable');
        if (!printableContent) {
            alert('No printable invoice found.');
            return;
        }

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Invoice ${selectedInvoice.invoiceNumber || ''}</title>
                </head>
                <body style="font-family: Inter, Arial, sans-serif; padding: 24px;">
                    ${printableContent.outerHTML}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    });
}

renderLibrary(getSavedInvoices());