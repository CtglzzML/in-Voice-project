const libraryItems = document.getElementById('library-items');
const rowTemplate = document.getElementById('library-item-row-template');
const emptyRowTemplate = document.getElementById('empty-library-row-template');

const previewSheet = document.querySelector('.preview-sheet');
const descriptionText = document.querySelector('.description-text');
const tagsList = document.getElementById('tags-list');
const downloadBtn = document.querySelector('.download-invoice-btn');
const createInvoiceBtn = document.querySelector('.create-invoice-btn');

const searchForm = document.getElementById('library-search-form');
const searchInput = document.querySelector('.search-input');

let savedInvoices = [];
let filteredInvoices = [];
let selectedInvoice = null;

function formatCurrency(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(dateString) {
    if (!dateString) return '---';

    const date = new Date(dateString);
    if (isNaN(date)) return '---';

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
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Error reading saved invoices:', error);
        return [];
    }
}

function getInvoiceTotal(invoice) {
    if (invoice?.fullInvoice?.totalAmount != null) {
        return Number(invoice.fullInvoice.totalAmount);
    }

    return 0;
}

function getInvoiceDueDate(invoice) {
    return invoice?.fullInvoice?.dueDate || '';
}

function clearLibraryTable() {
    libraryItems.innerHTML = '';
}

function renderEmptyState() {
    clearLibraryTable();
    const emptyRow = emptyRowTemplate.content.cloneNode(true);
    libraryItems.appendChild(emptyRow);
}

function createRow(invoice) {
    const clone = rowTemplate.content.cloneNode(true);
    const row = clone.querySelector('tr');
    const cells = row.querySelectorAll('td');

    row.dataset.dbId = invoice.dbId || '';

    cells[0].textContent = invoice.fileName || '-';
    cells[1].textContent = formatDate(invoice.date);
    cells[2].textContent = formatDate(getInvoiceDueDate(invoice));
    cells[3].textContent = invoice.fullInvoice?.companyName || '-';
    cells[4].textContent = invoice.client || '-';
    cells[5].textContent = invoice.email || '-';
    cells[6].textContent = invoice.phone || '-';
    cells[7].textContent = formatCurrency(getInvoiceTotal(invoice));

    row.addEventListener('click', () => {
        document.querySelectorAll('#library-items tr').forEach(item => {
            item.classList.remove('selected-row');
        });

        row.classList.add('selected-row');
        selectedInvoice = invoice;
        renderPreview(invoice);
    });

    return clone;
}

function renderLibraryTable(invoices) {
    clearLibraryTable();

    if (!invoices.length) {
        renderEmptyState();
        renderEmptyPreview();
        return;
    }

    invoices.forEach(invoice => {
        const row = createRow(invoice);
        libraryItems.appendChild(row);
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildItemsRows(items) {
    if (!Array.isArray(items) || !items.length) {
        return `
            <tr>
                <td colspan="4" style="padding: 14px; text-align: center; color: #777;">
                    No items added.
                </td>
            </tr>
        `;
    }

    return items.map(item => `
        <tr>
            <td style="padding: 12px 10px; border-bottom: 1px solid #ece8f8;">${escapeHtml(item.description || '-')}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #ece8f8;">${escapeHtml(item.qty ?? 0)}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #ece8f8;">${formatCurrency(item.rate)}</td>
            <td style="padding: 12px 10px; border-bottom: 1px solid #ece8f8;">${formatCurrency(item.total)}</td>
        </tr>
    `).join('');
}

function buildInvoicePreviewHtml(invoice) {
    const data = invoice?.fullInvoice || {};
    const savedLogo = localStorage.getItem('invoiceLogo');
    const itemsRows = buildItemsRows(data.items);

    return `
        <div class="invoice-preview-print" style="background: #fff; width: 100%; max-width: 760px; margin: 0 auto; padding: 32px; border-radius: 18px; color: #1b1b1b; font-family: Inter, Arial, sans-serif;">
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 28px;">
                <div>
                    ${savedLogo ? `<img src="${savedLogo}" alt="Company logo" style="max-width: 150px; max-height: 80px; object-fit: contain; display: block; margin-bottom: 12px;">` : ''}
                    <div style="font-size: 1rem; font-weight: 700;">${escapeHtml(data.companyName || 'My company')}</div>
                    <div style="font-size: 0.92rem; color: #666; margin-top: 6px;">${escapeHtml(data.companyAddress || '-')}</div>
                    <div style="font-size: 0.92rem; color: #666;">${escapeHtml(data.companyPhone || '-')}</div>
                    <div style="font-size: 0.92rem; color: #666;">${escapeHtml(data.companyEmail || '-')}</div>
                </div>

                <div style="text-align: right;">
                    <div style="font-size: 2rem; font-weight: 800; color: #6f56d9; letter-spacing: 0.02em;">INVOICE</div>
                    <div style="margin-top: 10px; font-size: 0.95rem;"><strong>#</strong> ${escapeHtml(data.invoiceNumber || '---')}</div>
                    <div style="margin-top: 4px; font-size: 0.95rem;"><strong>Date:</strong> ${formatDate(data.invoiceDate)}</div>
                    <div style="margin-top: 4px; font-size: 0.95rem;"><strong>Due:</strong> ${formatDate(data.dueDate)}</div>
                </div>
            </div>

            <div style="background: #6f56d9; color: white; border-radius: 14px; padding: 14px 18px; margin-bottom: 24px;">
                <div style="font-size: 0.85rem; opacity: 0.95;">Bill to</div>
                <div style="font-size: 1.05rem; font-weight: 700; margin-top: 4px;">${escapeHtml(data.clientName || '-')}</div>
                <div style="font-size: 0.92rem; margin-top: 6px;">${escapeHtml(data.clientAddress || '-')}</div>
                <div style="font-size: 0.92rem;">${escapeHtml(data.clientPhone || '-')}</div>
                <div style="font-size: 0.92rem;">${escapeHtml(data.clientEmail || '-')}</div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; overflow: hidden; border-radius: 14px;">
                <thead>
                    <tr style="background: #f3efff; color: #4b3aa3;">
                        <th style="text-align: left; padding: 14px 10px; font-size: 0.92rem;">Description</th>
                        <th style="text-align: left; padding: 14px 10px; font-size: 0.92rem;">Qty</th>
                        <th style="text-align: left; padding: 14px 10px; font-size: 0.92rem;">Price</th>
                        <th style="text-align: left; padding: 14px 10px; font-size: 0.92rem;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>

            <div style="width: 260px; margin-left: auto; background: #faf8ff; border: 1px solid #ece8f8; border-radius: 14px; padding: 18px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>Subtotal</span>
                    <span>${formatCurrency(data.subtotal)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>Tax (${escapeHtml(data.taxPercent || 0)}%)</span>
                    <span>${formatCurrency(data.taxAmount)}</span>
                </div>
                <div style="height: 1px; background: #ddd6fe; margin: 12px 0;"></div>
                <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1.05rem; color: #4b3aa3;">
                    <span>Total</span>
                    <span>${formatCurrency(data.totalAmount)}</span>
                </div>
            </div>

            <div style="margin-top: 26px;">
                <div style="font-weight: 700; margin-bottom: 8px;">Comments</div>
                <div style="line-height: 1.6; color: #555; white-space: pre-wrap;">${escapeHtml(data.comment || 'Nothing to add.')}</div>
            </div>
        </div>
    `;
}

function renderTags(tags) {
    if (!tagsList) return;

    tagsList.innerHTML = '';

    if (!Array.isArray(tags) || !tags.length) {
        return;
    }

    tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.textContent = tag;
        tagEl.style.display = 'inline-flex';
        tagEl.style.alignItems = 'center';
        tagEl.style.padding = '6px 10px';
        tagEl.style.borderRadius = '999px';
        tagEl.style.background = '#f3efff';
        tagEl.style.color = '#5b43c7';
        tagEl.style.fontSize = '0.85rem';
        tagEl.style.fontWeight = '600';
        tagsList.appendChild(tagEl);
    });
}

function renderEmptyPreview() {
    selectedInvoice = null;

    previewSheet.innerHTML = `
        <div class="preview-placeholder">
            <p class="preview-placeholder-title">No invoice selected</p>
            <p class="preview-placeholder-text">Select an invoice from the library to preview it here.</p>
        </div>
    `;

    if (descriptionText) {
        descriptionText.textContent = 'No description available yet.';
    }

    renderTags([]);
}

function renderPreview(invoice) {
    previewSheet.innerHTML = buildInvoicePreviewHtml(invoice);

    if (descriptionText) {
        descriptionText.textContent = invoice.description || 'No description available yet.';
    }

    renderTags(invoice.tags || []);
}

function buildPrintableDocument(invoiceHtml) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice PDF</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                html, body {
                    margin: 0;
                    padding: 0;
                    background: white;
                    font-family: Inter, Arial, sans-serif;
                }

                body {
                    padding: 18mm;
                }

                img {
                    display: block;
                    max-width: 100%;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                }

                @page {
                    size: A4;
                    margin: 12mm;
                }

                @media print {
                    html, body {
                        background: white;
                    }

                    body {
                        padding: 0;
                    }
                }
            </style>
        </head>
        <body>
            ${invoiceHtml}
            <script>
                window.onload = function () {
                    setTimeout(function () {
                        window.print();
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `;
}

function downloadSelectedInvoicePdf() {
    if (!selectedInvoice) {
        alert('Please select an invoice first.');
        return;
    }

    const invoiceHtml = buildInvoicePreviewHtml(selectedInvoice);
    const printWindow = window.open('', '_blank', 'width=1000,height=1400');

    if (!printWindow) {
        alert('Popup blocked. Please allow popups for this site.');
        return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintableDocument(invoiceHtml));
    printWindow.document.close();
}

function normalizeText(value) {
    return String(value ?? '').toLowerCase().trim();
}

function matchesInvoice(invoice, query) {
    const data = invoice.fullInvoice || {};

    const searchPool = [
        invoice.fileName,
        invoice.client,
        invoice.email,
        invoice.phone,
        invoice.description,
        invoice.date,
        data.dueDate,
        data.companyName,
        data.clientName,
        data.clientEmail,
        data.clientPhone,
        data.invoiceNumber,
        ...(invoice.tags || [])
    ]
        .map(normalizeText)
        .join(' ');

    return searchPool.includes(query);
}

function applySearch() {
    const query = normalizeText(searchInput?.value || '');

    if (!query) {
        filteredInvoices = [...savedInvoices];
    } else {
        filteredInvoices = savedInvoices.filter(invoice => matchesInvoice(invoice, query));
    }

    renderLibraryTable(filteredInvoices);

    if (!filteredInvoices.length) {
        renderEmptyPreview();
    }
}

function initSearch() {
    if (!searchForm || !searchInput) return;

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        applySearch();
    });

    searchInput.addEventListener('input', () => {
        applySearch();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });
}

function initButtons() {
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            downloadSelectedInvoicePdf();
        });
    }

    if (createInvoiceBtn) {
        createInvoiceBtn.addEventListener('click', () => {
            window.location.href = 'create_invoice.html';
        });
    }
}

function initLibrary() {
    savedInvoices = getSavedInvoices();
    filteredInvoices = [...savedInvoices];

    if (!savedInvoices.length) {
        renderEmptyState();
        renderEmptyPreview();
    } else {
        renderLibraryTable(filteredInvoices);
        renderEmptyPreview();
    }

    initSearch();
    initButtons();
}

document.addEventListener('DOMContentLoaded', initLibrary);