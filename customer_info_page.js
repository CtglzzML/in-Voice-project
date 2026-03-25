const addLineItemBtn = document.getElementById('add-line-item');
const tableBody = document.querySelector('table');
const rowTemplate = document.getElementById('non-empty-row');

if (addLineItemBtn) {
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
        window.location.href = 'dashboard.html';
    }
    if (e.target && e.target.id === 'signout') {
        window.location.href = 'login_page.html';
    }
});