const newInvoiceBtn = document.querySelector('.primary-action-btn');
const historyBtn = document.getElementById('view-history-btn');
const directoryBtn = document.getElementById('manage-directory-btn');
const userBtn = document.querySelector('.user-button');

if (newInvoiceBtn) {
    newInvoiceBtn.addEventListener('click', () => {
        window.location.href = 'create_invoice.html';
    });
}

if (historyBtn) {
    historyBtn.addEventListener('click', () => {
        window.location.href = 'invoice_library.html';
    });
}

if (directoryBtn) {
    directoryBtn.addEventListener('click', () => {
        window.location.href = 'customer_library.html';
    });
}

if (userBtn) {
    userBtn.addEventListener('click', () => {
        window.location.href = 'account_page.html';
    });
}

document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('sign-out-link')) {
        e.preventDefault();
        window.location.href = 'login_page.html';
    }
});