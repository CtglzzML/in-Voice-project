const newInvoiceBtn = document.querySelector('.primary-action-btn');
const historyBtn = document.getElementById('view-history-btn');
const directoryBtn = document.getElementById('manage-directory-btn');
const userBtn = document.querySelector('.user-button');

if (newInvoiceBtn) {
  newInvoiceBtn.addEventListener('click', function () {
    window.location.href = 'create_invoice.html';
  });
}

if (historyBtn) {
  historyBtn.addEventListener('click', function () {
    window.location.href = 'invoice_library.html';
  });
}

if (directoryBtn) {
  directoryBtn.addEventListener('click', function () {
    window.location.href = 'customer_info_page.html';
  });
}

if (userBtn) {
  userBtn.addEventListener('click', function () {
    window.location.href = 'account_page.html';
  });
}

document.addEventListener('click', function (e) {
  if (e.target && e.target.classList.contains('sign-out-link')) {
    e.preventDefault();
    logoutUser().then(function () { window.location.href = 'landing_page.html'; });
  }
});
