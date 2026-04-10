const libraryItems = document.getElementById('library-items');
const rowTemplate = document.getElementById('library-item-row-template');

const emptyTemplate = document.getElementById('empty-library-row-template');
const searchInput = document.querySelector('.search-input');
const searchForm = document.getElementById('library-search-form');
const createInvoiceBtn = document.querySelector('.create-invoice-btn');
const downloadInvoiceBtn = document.querySelector('.download-invoice-btn');
const previewTitle = document.querySelector('.preview-title');


const emptyRowTemplate = document.getElementById('empty-library-row-template');


const previewSheet = document.querySelector('.preview-sheet');
const descriptionText = document.querySelector('.description-text');
const tagsList = document.getElementById('tags-list');
const downloadBtn = document.querySelector('.download-invoice-btn');

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
        selectedLibraryItem = invoice;
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
    const data = invoice?.fullInvoice || invoice || {};
    const savedLogo = localStorage.getItem('invoiceLogo');
    const itemsRows = buildItemsRows(data.items);

    return `
    <div style="
        width: 100%; 
        max-width: 700px; 
        min-height: 850px; /* Adjust based on your aspect ratio */
        margin: 18px auto 0; 
        color: #111; 
        font-family: Inter, sans-serif;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: white;
        padding: 40px;
        box-sizing: border-box;
    ">
        <div class="invoice-header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 28px;">
                <div style="display: flex; align-items: flex-start; gap: 25px;">
                    <div>
                        ${savedLogo ? `<img src="${savedLogo}" alt="Logo" style="max-width: 140px; max-height: 70px; object-fit: contain; display: block; margin-bottom: 8px;">` : ''}
                        <div style="font-size: 1rem; font-weight: 600; line-height: 1.2;">
                            ${data.companyName || 'My company'}
                        </div>
                    </div>
                    <div style="font-size: 0.85rem; line-height: 1.5; padding-top: 5px; color: #444;">
                        <div><strong>Address:</strong> ${data.companyAddress || '-'}</div>
                        <div><strong>Phone:</strong> ${data.companyPhone || '-'}</div>
                        <div><strong>Email:</strong> ${data.companyEmail || '-'}</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600;">INVOICE</h3>
                    <p style="margin: 4px 0;"># ${data.invoiceNumber || '---'}</p>
                    <p style="margin: 0; font-size: 0.9rem;">Date: ${formatDate(data.invoiceDate)}</p>
                    <p style="margin: 4px 0 0; font-size: 0.9rem;">Due: ${formatDate(data.dueDate)}</p>
                </div>
            </div>

            <div style="background: #000; color: #fff; border-radius: 4px; padding: 10px 14px; margin-bottom: 20px;">
                <div>Bill to:</div>
                <div style="margin-top: 4px; font-weight: 500;">${data.clientName || 'xClient Inc.'}</div>
            </div>

            <div style="margin-bottom: 18px; line-height: 1.6; font-size: 0.9rem;">
                <div><strong>Client address:</strong> ${data.clientAddress || '-'}</div>
                <div><strong>Client phone:</strong> ${data.clientPhone || '-'}</div>
                <div><strong>Client email:</strong> ${data.clientEmail || '-'}</div>
            </div>
        </div>

        <div style="flex: 1; margin-bottom: 30px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #000; color: #fff;">
                        <th style="text-align: left; padding: 12px;">Description</th>
                        <th style="text-align: left; padding: 12px;">Qty</th>
                        <th style="text-align: left; padding: 12px;">Price</th>
                        <th style="text-align: left; padding: 12px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
        </div>

        <div class="invoice-footer" style="margin-top: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #eee; padding-top: 20px;">
                <div style="max-width: 60%;">
                    <strong style="font-size: 0.9rem;">Comments:</strong>
                    <p style="margin-top: 8px; white-space: pre-wrap; font-size: 0.85rem; color: #555;">${data.comment || ''}</p>
                </div>

                <div style="width: 220px; line-height: 1.8;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Subtotal:</span>
                        <span>${formatCurrency(data.subtotal || 0)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Tax (${data.taxPercent || 0}%):</span>
                        <span>${formatCurrency(data.taxAmount || 0)}</span>
                    </div>
                    <div style="height: 1px; background: #000; margin: 8px 0;"></div>
                    <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem;">
                        <span>TOTAL:</span>
                        <span>${formatCurrency(data.totalAmount || 0)}</span>
                    </div>
                </div>
            </div>
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
    selectedLibraryItem = null;
    previewTitle.textContent = 'Invoice preview';


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
    const previewSheet = document.querySelector('.preview-sheet');
    const descriptionText = document.querySelector('.description-text');
    const tagsList = document.getElementById('tags-list');
    const invoice = item.fullInvoice;

    selectedInvoice = item || null;
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

function handleSearch() {
    const invoices = getSavedInvoices();
    const searchState = getSearchState();
    const filtered = filterInvoices(invoices, searchState);

    renderLibraryTable(filtered);

    // Keep preview consistent with the list filter.
    if (!selectedLibraryItem) return;
    const updated = invoices.find(i => i.dbId === selectedLibraryItem.dbId);
    const stillVisible = filtered.some(i => i.dbId === selectedLibraryItem.dbId);

    if (!updated || !stillVisible) {
        renderEmptyPreview();
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

function getInvoiceForPdf() {
    if (selectedLibraryItem && selectedLibraryItem.fullInvoice) {
        return selectedLibraryItem;
    }

    if (selectedInvoice && selectedInvoice.fullInvoice) {
        return selectedInvoice;
    }

    if (selectedInvoice) {
        return { fullInvoice: selectedInvoice };
    }

    return null;
}

async function downloadInvoicePDF() {
    const invoiceForPdf = getInvoiceForPdf();

    if (!invoiceForPdf) {
        alert('Please select an invoice first.');
        return;
    }

    if (!window.html2pdf) {
        alert('PDF exporter failed to load. Please refresh and try again.');
        return;
    }

    const sourceHtml = buildInvoicePreviewHtml(invoiceForPdf);

    const invoiceNumber = invoiceForPdf?.fullInvoice?.invoiceNumber || 'invoice';
    const safeInvoiceNumber = String(invoiceNumber).replace(/[^a-zA-Z0-9-_]+/g, '_');

    const opt = {
        margin: [0.35, 0.35, 0.35, 0.35],
        filename: `Invoice_${safeInvoiceNumber}_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            scrollX: 0,
            scrollY: 0
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
        await window.html2pdf().set(opt).from(sourceHtml, 'string').save();
    } catch (error) {
        console.error('Failed to generate PDF from HTML string, trying preview fallback:', error);

        const previewNode = previewSheet?.firstElementChild;
        if (previewNode) {
            try {
                await window.html2pdf().set(opt).from(previewNode).save();
                return;
            } catch (fallbackError) {
                console.error('Fallback PDF generation also failed:', fallbackError);
            }
        }

        alert('Could not generate the PDF. Please refresh and try again.');
    }
}

if (createInvoiceBtn) {
    createInvoiceBtn.addEventListener('click', () => {
        window.location.href = 'create_invoice.html';
    });
}
/*
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
*/

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
            downloadInvoicePDF();
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

// Re-initialize whenever the page becomes visible (back button, tab switch, etc.)
window.addEventListener('pageshow', (event) => {
    // Re-fetch data and re-render the table
    savedInvoices = getSavedInvoices();
    filteredInvoices = [...savedInvoices];
    renderLibraryTable(filteredInvoices);
});

const userBtn = document.querySelector('.user-button');
const menuTemplate = document.getElementById('user-profile-menu');

function getUserButtonLabelEl() {
    if (!userBtn) return null;
    return userBtn.querySelector('span:not(.user-icon)') || userBtn.querySelector('span');
}

async function resolveDisplayName(user) {
    if (!user) return 'User';

    let profileName = '';
    if (window._supabase) {
        try {
            const { data: profile } = await window._supabase
                .from('users')
                .select('name')
                .eq('id', user.id)
                .maybeSingle();
            profileName = (profile && profile.name) || '';
        } catch (_) {
            profileName = '';
        }
    }

    return (
        profileName ||
        (user.user_metadata && user.user_metadata.full_name) ||
        (user.email ? user.email.split('@')[0] : '') ||
        'User'
    );
}

async function applyUserGreeting() {
    const labelEl = getUserButtonLabelEl();
    if (!labelEl || typeof getCurrentUser !== 'function') {
        return 'User';
    }

    try {
        const user = await getCurrentUser();
        if (!user) return 'User';

        const displayName = await resolveDisplayName(user);
        labelEl.textContent = 'Hi ' + displayName;
        return displayName;
    } catch (_) {
        return 'User';
    }
}

let cachedDisplayName = 'User';
applyUserGreeting().then((displayName) => {
    cachedDisplayName = displayName || 'User';
});

if (userBtn && menuTemplate) {
    userBtn.addEventListener('click', async () => {
        const existing = document.getElementById('user-profile-menu-modal');
        if (existing) {
            existing.remove();
            return;
        }

        const clone = menuTemplate.content.cloneNode(true);
        document.body.appendChild(clone);

        cachedDisplayName = await applyUserGreeting();
        const nameEl = document.getElementById('username');
        if (nameEl) {
            nameEl.textContent = cachedDisplayName;
        }

        const dash = document.getElementById('go-to-dashboard');
        const inv = document.getElementById('go-to-invoices');
        const usr = document.getElementById('go-to-account');
        const out = document.getElementById('signout');

        if (dash) {
            dash.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'dashboard.html';
            });
        }
        if (inv) {
            inv.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'invoice_library.html';
            });
        }
        if (usr) {
            usr.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'account_page.html';
            });
        }
        if (out) {
            out.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof logoutUser === 'function') {
                    logoutUser().then(() => {
                        window.location.href = 'landing_page.html';
                    });
                    return;
                }
                window.location.href = 'landing_page.html';
            });
        }
    });

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('user-profile-menu-modal');
        if (menu && !userBtn.contains(e.target) && !menu.contains(e.target)) {
            menu.remove();
        }
    });
}

document.addEventListener('DOMContentLoaded', initLibrary);