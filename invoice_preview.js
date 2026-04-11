const backBtn = document.querySelector('.btn-secondary');
const createBtn = document.querySelector('.btn-primary');
const pdfFrame = document.querySelector('.pdf-frame');
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

async function saveInvoiceToLibrary() {
    const currentInvoice = getStoredInvoice();
    if (!currentInvoice) {
        return { ok: false, error: new Error('No invoice data found.') };
    }

    if (!window.invoiceStorage || typeof window.invoiceStorage.saveInvoiceToSupabase !== 'function') {
        return { ok: false, error: new Error('Invoice storage is not available on this page.') };
    }

    try {
        await window.invoiceStorage.saveInvoiceToSupabase(currentInvoice);
        return { ok: true };
    } catch (error) {
        console.error('Error saving invoice to Supabase:', error);
        return { ok: false, error: error };
    }
}

function getLogoForInvoice(data) {
    return profileLogoUrl || ((data && data.companyLogo) || '');
}

function renderInvoicePreview() {
    const data = getStoredInvoice();
    const savedLogo = getLogoForInvoice(data);

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

async function syncDraftLogoFromProfile() {
    if (!window._supabase || typeof window.getCurrentUser !== 'function') return;

    try {
        const user = await window.getCurrentUser();
        if (!user || !user.id) return;

        const { data: profile } = await window._supabase
            .from('users')
            .select('logo_url')
            .eq('id', user.id)
            .maybeSingle();

        profileLogoUrl = (profile && profile.logo_url) || '';

        const invoiceDraft = getStoredInvoice();
        if (!invoiceDraft) return;

        invoiceDraft.companyLogo = profileLogoUrl;
        sessionStorage.setItem('invoiceDraft', JSON.stringify(invoiceDraft));
    } catch (error) {
        console.error('Error syncing profile logo for preview:', error);
    }
}

const pdfImageCache = new Map();

function waitForImageLoad(img) {
    return new Promise((resolve) => {
        if (!img) {
            resolve();
            return;
        }

        if (img.complete) {
            resolve();
            return;
        }

        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
        window.setTimeout(finish, 4000);
    });
}

async function waitForImages(root) {
    if (!root) return;
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(waitForImageLoad));
}

async function getPdfSafeImageSrc(src) {
    if (!src || src.startsWith('data:')) return src;

    if (pdfImageCache.has(src)) {
        return pdfImageCache.get(src);
    }

    try {
        const response = await fetch(src, {
            mode: 'cors',
            cache: 'force-cache'
        });

        if (!response.ok) {
            throw new Error(`Image request failed with status ${response.status}`);
        }

        const blob = await response.blob();
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Could not read image blob.'));
            reader.readAsDataURL(blob);
        });

        pdfImageCache.set(src, dataUrl);
        return dataUrl;
    } catch (error) {
        console.warn('Could not inline PDF image, falling back to original source:', error);
        pdfImageCache.set(src, src);
        return src;
    }
}

async function prepareImagesForPdf(root) {
    if (!root) {
        return () => {};
    }

    await waitForImages(root);

    const images = Array.from(root.querySelectorAll('img'));
    const originalState = [];

    for (const img of images) {
        originalState.push({
            img,
            src: img.getAttribute('src'),
            srcset: img.getAttribute('srcset'),
            crossOrigin: img.crossOrigin || ''
        });

        const safeSrc = await getPdfSafeImageSrc(img.currentSrc || img.src);
        if (!safeSrc) continue;

        img.crossOrigin = 'anonymous';
        img.removeAttribute('srcset');
        img.src = safeSrc;
        await waitForImageLoad(img);
    }

    return () => {
        originalState.forEach(({ img, src, srcset, crossOrigin }) => {
            if (src === null) {
                img.removeAttribute('src');
            } else {
                img.setAttribute('src', src);
            }

            if (srcset === null) {
                img.removeAttribute('srcset');
            } else {
                img.setAttribute('srcset', srcset);
            }

            img.crossOrigin = crossOrigin;
        });
    };
}

async function downloadInvoicePDF() {
    const element = document.querySelector('.pdf-frame');
    const invoiceNode = element?.firstElementChild || element;

    if (!invoiceNode) {
        alert('Could not find the invoice preview. Please refresh and try again.');
        return;
    }

    const opt = {
        margin: 0.5,
        filename: `Invoice_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            scrollX: 0,
            scrollY: 0
        },
        jsPDF: { unit: 'in', format: 'A4', orientation: 'portrait' }
    };

    let restoreImages = () => {};

    try {
        restoreImages = await prepareImagesForPdf(invoiceNode);
        await window.html2pdf().set(opt).from(invoiceNode).save();
    } catch (error) {
        console.error('Failed to generate the invoice PDF:', error);
        alert('Could not generate the PDF. Please refresh and try again.');
    } finally {
        restoreImages();
    }
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
    createBtn.addEventListener('click', async () => {
        createBtn.disabled = true;
        createBtn.textContent = 'Saving...';

        const saveResult = await saveInvoiceToLibrary();
        if (!saveResult.ok) {
            alert(saveResult.error && saveResult.error.message ? saveResult.error.message : 'Could not save this invoice.');
            createBtn.disabled = false;
            createBtn.textContent = 'Create invoice';
            return;
        }

        if (document.querySelector('.popup-card')) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create invoice';
            return;
        }

        const template = document.getElementById('invoice-created-template');
        const clone = template.content.cloneNode(true);
        document.body.appendChild(clone);

        const popup = document.querySelector('.popup-card');
        popup.style.display = 'block';

        popup.addEventListener('click', async (e) => {
            if (e.target.tagName !== 'BUTTON') return;

            if (e.target.innerText === 'Go to invoice library') {
                window.location.href = 'invoice_library.html';
            } else if (e.target.innerText === 'Create another invoice') {
                window.location.href = 'create_invoice.html'
            } else if (e.target.innerText === 'Download PDF') {
                hidePopupBeforePrint();
                try {
                    await downloadInvoicePDF();
                } finally {
                    restorePopupAfterPrint();
                }
            }
        });

        createBtn.disabled = false;
        createBtn.textContent = 'Create invoice';
    });
}
async function initInvoicePreviewPage() {
    await syncDraftLogoFromProfile();
    renderInvoicePreview();
}

initInvoicePreviewPage();
