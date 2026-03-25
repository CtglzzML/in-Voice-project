const libraryItems = document.getElementById('library-items');
const rowTemplate = document.getElementById('library-item-row-template');

const emptyTemplate = document.getElementById('empty-library-row-template');
const searchInput = document.querySelector('.search-input');
const searchForm = document.getElementById('library-search-form');
const createInvoiceBtn = document.querySelector('.create-invoice-btn');
const downloadInvoiceBtn = document.querySelector('.download-invoice-btn');

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
let selectedLibraryItem = null;

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
<<<<<<< HEAD
    selectedLibraryItem = null;
    previewTitle.textContent = 'Invoice preview';
=======
>>>>>>> 2cde5cda246ba31452c9177575e911287b67f90f

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

<<<<<<< HEAD
function getInvoiceTags(inv) {
    const directTags = Array.isArray(inv?.tags) ? inv.tags : [];
    const fullInvoiceTags = Array.isArray(inv?.fullInvoice?.tags) ? inv.fullInvoice.tags : [];
    const merged = [...directTags, ...fullInvoiceTags].map(t => String(t).trim()).filter(Boolean);

    // Dedupe case-insensitively while preserving first-seen casing.
    const seen = new Set();
    const result = [];
    merged.forEach(tag => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(tag);
    });
    return result;
}

function normalizeTag(tag) {
    // Allow users to type "#tag", but store without the "#".
    return String(tag).trim().replace(/^#+/, '');
}

function parseTagsInput(raw) {
    // Supports comma-separated input or space-separated input.
    return String(raw)
        .split(',')
        .flatMap(part => part.split(/\s+/g))
        .map(t => normalizeTag(t))
        .filter(Boolean);
}

function persistInvoiceTags(dbId, tags) {
    const savedInvoices = getSavedInvoices();
    const idx = savedInvoices.findIndex(i => i.dbId === dbId);
    if (idx < 0) return null;

    savedInvoices[idx].tags = tags;
    if (savedInvoices[idx].fullInvoice && typeof savedInvoices[idx].fullInvoice === 'object') {
        savedInvoices[idx].fullInvoice.tags = tags;
    }

    localStorage.setItem('savedInvoices', JSON.stringify(savedInvoices));
    return savedInvoices[idx];
}

function getSearchState() {
    const raw = searchInput?.value?.trim() || '';
    const lowered = raw.toLowerCase();
    const isTagOnly = lowered.startsWith('#');
    const tagTerm = lowered.replace(/^#+/, '').trim();

    return {
        rawLower: lowered,
        term: isTagOnly ? tagTerm : lowered,
        isTagOnly
    };
}

function filterInvoices(invoices, searchState) {
    const term = searchState.term;
    if (!term) return invoices;

    return invoices.filter(inv => {
        const invoice = inv.fullInvoice || {};
        const tags = getInvoiceTags(inv);

        const tagMatches = tags.some(t => (t || '').toLowerCase().includes(term));

        if (searchState.isTagOnly) return tagMatches;

        const textMatches = (
            (invoice.invoiceNumber || '').toLowerCase().includes(term) ||
            (invoice.companyName || '').toLowerCase().includes(term) ||
            (invoice.clientName || '').toLowerCase().includes(term) ||
            (invoice.clientEmail || '').toLowerCase().includes(term)
        );

        return textMatches || tagMatches;
    });
}

function showPreview(item) {
    const previewTitle = document.querySelector('.preview-title');
    const previewSheet = document.querySelector('.preview-sheet');
    const descriptionText = document.querySelector('.description-text');
    const tagsList = document.getElementById('tags-list');
    const invoice = item.fullInvoice;

    selectedInvoice = invoice || null;
    selectedLibraryItem = item || null;

    previewTitle.textContent = `Preview: ${invoice?.invoiceNumber || item.fileName || 'Invoice'}`;
    descriptionText.textContent = item.description || invoice?.comment || 'No description available yet.';

    tagsList.innerHTML = `<button class="add-tag-btn" type="button" aria-label="Add tag">+</button>`;

    getInvoiceTags(item).forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';

        const text = document.createElement('span');
        text.textContent = tag;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-tag-btn';
        removeBtn.dataset.tag = tag;
        removeBtn.setAttribute('aria-label', `Remove tag ${tag}`);
        removeBtn.textContent = '×';

        chip.appendChild(text);
        chip.appendChild(removeBtn);
        tagsList.appendChild(chip);
    });
=======
function renderPreview(invoice) {
    previewSheet.innerHTML = buildInvoicePreviewHtml(invoice);

    if (descriptionText) {
        descriptionText.textContent = invoice.description || 'No description available yet.';
    }
>>>>>>> 2cde5cda246ba31452c9177575e911287b67f90f

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

<<<<<<< HEAD
function handleSearch() {
    const invoices = getSavedInvoices();
    const searchState = getSearchState();
    const filtered = filterInvoices(invoices, searchState);

    renderLibrary(filtered);

    // Keep preview consistent with the list filter.
    if (!selectedLibraryItem) return;
    const updated = invoices.find(i => i.dbId === selectedLibraryItem.dbId);
    const stillVisible = filtered.some(i => i.dbId === selectedLibraryItem.dbId);

    if (!updated || !stillVisible) {
        resetPreview();
        return;
    }

    showPreview(updated);
}

if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
}

if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSearch();
    });
}

// Tagging (add/remove) for the currently selected invoice.
const tagsListEl = document.getElementById('tags-list');
if (tagsListEl) {
    tagsListEl.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.add-tag-btn');
        if (addBtn) {
            e.preventDefault();
            if (!selectedLibraryItem) {
                alert('Select an invoice in the library first.');
                return;
            }

            const raw = prompt('Add tag(s) (comma-separated):', '');
            if (raw === null) return;

            const parsed = parseTagsInput(raw);
            const newTags = parsed.map(t => normalizeTag(t)).filter(Boolean);
            if (!newTags.length) return;

            const currentTags = getInvoiceTags(selectedLibraryItem);
            const merged = currentTags.concat(newTags);

            // Deduplicate tags case-insensitively.
            const seen = new Set();
            const deduped = [];
            merged.forEach(t => {
                const key = t.toLowerCase();
                if (!key || seen.has(key)) return;
                seen.add(key);
                deduped.push(t);
            });

            persistInvoiceTags(selectedLibraryItem.dbId, deduped);
            handleSearch();
            return;
        }

        const removeBtn = e.target.closest('.remove-tag-btn');
        if (removeBtn) {
            e.preventDefault();
            if (!selectedLibraryItem) return;

            const tagToRemove = removeBtn.dataset.tag;
            if (!tagToRemove) return;

            const currentTags = getInvoiceTags(selectedLibraryItem);
            const nextTags = currentTags.filter(t => t.toLowerCase() !== tagToRemove.toLowerCase());
            persistInvoiceTags(selectedLibraryItem.dbId, nextTags);
            handleSearch();
        }
    });
}

if (createInvoiceBtn) {
    createInvoiceBtn.addEventListener('click', () => {
        window.location.href = 'create_invoice.html';
=======
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
>>>>>>> 2cde5cda246ba31452c9177575e911287b67f90f
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