const backBtn = document.querySelector('.btn-secondary');
const createBtn = document.querySelector('.btn-primary');
const pdfFrame = document.querySelector('.pdf-frame');

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

function getStoredInvoice() {
    const raw = sessionStorage.getItem('invoiceDraft');
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error('Error reading stored invoice:', error);
        return null;
    }
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

function saveInvoiceToLibrary() {
    const currentInvoice = getStoredInvoice();
    if (!currentInvoice) return false;

    const savedInvoices = getSavedInvoices();

    const invoiceToSave = {
        dbId: Date.now().toString(),
        fileName: currentInvoice.invoiceNumber
            ? `INV-${currentInvoice.invoiceNumber}`
            : `INV-${Date.now()}`,
        client: currentInvoice.clientName || '-',
        email: currentInvoice.clientEmail || '-',
        vat: currentInvoice.taxPercent != null ? `${currentInvoice.taxPercent}%` : '0%',
        phone: currentInvoice.clientPhone || '-',
        country: currentInvoice.clientAddress || '-',
        city: '-',
        code: '-',
        id: currentInvoice.invoiceNumber || Date.now().toString(),
        date: currentInvoice.invoiceDate || '',
        description: currentInvoice.comment || 'No description available yet.',
        tags: [],
        fullInvoice: currentInvoice
    };

    const alreadyExists = savedInvoices.some(invoice => {
        return (
            invoice.fullInvoice &&
            invoice.fullInvoice.invoiceNumber === currentInvoice.invoiceNumber &&
            invoice.fullInvoice.invoiceDate === currentInvoice.invoiceDate &&
            invoice.fullInvoice.clientName === currentInvoice.clientName
        );
    });

    if (!alreadyExists) {
        savedInvoices.unshift(invoiceToSave);
        localStorage.setItem('savedInvoices', JSON.stringify(savedInvoices));
    }

    return true;
}

function renderInvoicePreview() {
    const data = getStoredInvoice();
    // 1. Fetch the logo from storage
    const savedLogo = localStorage.getItem('invoiceLogo');

    if (!data) {
        pdfFrame.innerHTML = `<p>No invoice data found.</p>`;
        return;
    }

    const itemsHtml = data.items && data.items.length > 0
        ? data.items.map(item => `
            <tr>
                <td>${item.description || '-'}</td>
                <td>${item.qty}</td>
                <td>${formatCurrency(item.rate)}</td>
                <td>${formatCurrency(item.total)}</td>
            </tr>
        `).join('')
        : `
            <tr>
                <td colspan="4" style="text-align:center; padding: 20px; color: #666;">
                    There are currently no items in the invoice.
                </td>
            </tr>
        `;

    pdfFrame.innerHTML = `
    <div style="
        width: 100%; 
        max-width: 700px; 
        min-height: 850px; /* Adjust based on your aspect ratio */
        margin: 0 auto; 
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
                    ${itemsHtml}
                </tbody>
            </table>
        </div>

        <div class="invoice-footer">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #eee; padding-top: 20px;">
                <div style="max-width: 60%;">
                    <strong style="font-size: 0.9rem;">Comments:</strong>
                    <p style="margin-top: 8px; white-space: pre-wrap; font-size: 0.85rem; color: #555;">${data.comment || 'Thank you for your business!'}</p>
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

function downloadInvoicePDF() {
    const element = document.querySelector('.pdf-frame'); // The container holding your invoice

    // Optional settings to make it look professional
    const opt = {
        margin: 0.5,
        filename: `Invoice_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 }, // Higher scale = better quality
        jsPDF: { unit: 'in', format: 'A4', orientation: 'portrait' }
    };

    // New Promise-based usage:
    window.html2pdf().set(opt).from(element).save();
}

function hidePopupBeforePrint() {
    const popup = document.querySelector('.popup-card');
    if (popup) {
        popup.dataset.previousDisplay = popup.style.display || 'block';
        popup.style.display = 'none';
    }
}

function restorePopupAfterPrint() {
    const popup = document.querySelector('.popup-card');
    if (popup) {
        popup.style.display = popup.dataset.previousDisplay || 'block';
    }
}

window.addEventListener('afterprint', () => {
    restorePopupAfterPrint();
});

if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = 'create_invoice.html';
    });
}

if (createBtn) {
    createBtn.addEventListener('click', () => {
        const savedOk = saveInvoiceToLibrary();
        if (!savedOk) {
            alert('No invoice data found to save.');
            return;
        }

        if (document.querySelector('.popup-card')) return;

        const template = document.getElementById('invoice-created-template');
        const clone = template.content.cloneNode(true);
        document.body.appendChild(clone);

        const popup = document.querySelector('.popup-card');
        popup.style.display = 'block';

        popup.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') return;

            if (e.target.innerText === 'Go to invoice library') {
                window.location.href = 'invoice_library.html';
            } else if (e.target.innerText === 'Create another invoice') {
                window.location.href = 'create_invoice.html'
            } else if (e.target.innerText === 'Download PDF') {
                hidePopupBeforePrint();
                downloadInvoicePDF();

                setTimeout(() => {
                    restorePopupAfterPrint();
                }, 500);
            }
        });
    });
}
renderInvoicePreview();

const fileInput = document.getElementById('company-logo');
const preview = document.getElementById('logo-preview');
const labelText = document.getElementById('label-text');

fileInput.addEventListener('change', function () {
    const file = this.files[0]; // Get the first selected file

    if (file) {
        const reader = new FileReader();

        // When the file is finished being read...
        reader.addEventListener('load', function () {
            // 1. Set the <img> src to the file data
            preview.setAttribute('src', this.result);
            // 2. Show the image
            preview.style.display = 'block';
            // 3. Hide the placeholder text
            labelText.style.display = 'none';
        });

        reader.readAsDataURL(file);
    }
});