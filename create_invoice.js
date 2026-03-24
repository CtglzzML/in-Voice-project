const addItemBtn = document.getElementById('add-line-item');
const itemTable = document.querySelector('.item-list');
const rowTemplate = document.getElementById('non-empty-row');
const taxInput = document.getElementById('inv-tax');

function calculateInvoice() {
    let subtotal = 0;
    const rows = document.querySelectorAll('.item-row');

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const rate = parseFloat(row.querySelector('.item-rate').value) || 0;
        const total = qty * rate;
        
        row.querySelector('.item-total').innerText = `$${total.toFixed(2)}`;
        subtotal += total;
    });

    const taxPercent = parseFloat(taxInput.value) || 0;
    const taxAmount = subtotal * (taxPercent / 100);
    const totalAmount = subtotal + taxAmount;

    const totalsArea = document.querySelector('.preview-totals');
    const totalRows = totalsArea.querySelectorAll('.preview-total-row span:last-child');

    totalRows[0].innerText = `$${subtotal.toFixed(2)}`;
    totalRows[1].innerText = `$${taxAmount.toFixed(2)}`;
    totalRows[2].innerText = `$${totalAmount.toFixed(2)}`;
    
    const taxLabel = totalsArea.querySelectorAll('.preview-total-row span:first-child')[1];
    taxLabel.innerText = `Tax (${taxPercent}%):`;
}

function addNewRow() {
    const clone = rowTemplate.content.cloneNode(true);
    const row = clone.querySelector('tr');
    
    row.querySelector('.delete-btn').addEventListener('click', () => {
        row.remove();
        calculateInvoice();
    });

    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', calculateInvoice);
    });

    itemTable.appendChild(clone);
    calculateInvoice();
}

addItemBtn.addEventListener('click', addNewRow);
taxInput.addEventListener('input', calculateInvoice);

const returnBtn = document.querySelector('.return-btn');
if (returnBtn) {
    returnBtn.addEventListener('click', () => {
        window.location.href = 'landing_page.html';
    });
}

const seePreviewBtn = document.querySelector('.preview-btn');
if (returnBtn) {
    returnBtn.addEventListener('click', () => {
        window.location.href = 'invoice_preview.html';
    });
}