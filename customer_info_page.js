const addLineItemBtn = document.getElementById('add-line-item');
const tableBody = document.querySelector('table');
const rowTemplate = document.getElementById('non-empty-row');
const userBtn = document.querySelector('.user-button');
const menuTemplate = document.getElementById('user-profile-menu');

if (addLineItemBtn && tableBody && rowTemplate) {
  addLineItemBtn.addEventListener('click', () => {
    const clone = rowTemplate.content.cloneNode(true);
    const newRow = clone.querySelector('tr');

    newRow.querySelector('.delete-btn').addEventListener('click', () => {
      newRow.remove();
    });

    tableBody.appendChild(newRow);
  });
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'go-to-dashboard') {
    e.preventDefault();
    window.location.href = 'dashboard.html';
  }
  if (e.target && e.target.id === 'go-to-invoices') {
    e.preventDefault();
    window.location.href = 'invoice_library.html';
  }
  if (e.target && e.target.id === 'signout') {
    e.preventDefault();
    logoutUser();
    window.location.href = 'landing_page.html';
  }
});

if (userBtn && menuTemplate) {
  userBtn.addEventListener('click', () => {
    const existing = document.getElementById('user-profile-menu-modal');
    if (existing) {
      existing.remove();
      return;
    }
    const clone = menuTemplate.content.cloneNode(true);
    document.body.appendChild(clone);
  });

  document.addEventListener('click', (e) => {
    const modal = document.getElementById('user-profile-menu-modal');
    if (modal && userBtn && !userBtn.contains(e.target) && !modal.contains(e.target)) {
      modal.remove();
    }
  });
}
