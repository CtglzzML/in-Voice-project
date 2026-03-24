const libraryBody = document.getElementById('library-items');
const rowTemplate = document.getElementById('library-item-row-template');
const searchInput = document.querySelector('input[placeholder="search"]');
const userButton = document.querySelector('.user-button');

// Sample data to simulate saved invoices
const invoices = [
    { name: "INV-001", client: "Google", email: "billing@google.com", vat: "123", phone: "555-01", country: "USA", city: "Mountain View", code: "94043", id: "001", date: "2026-03-20" },
    { name: "INV-002", client: "Netflix", email: "accounts@netflix.com", vat: "456", phone: "555-02", country: "USA", city: "Los Gatos", code: "95032", id: "002", date: "2026-03-21" }
];

function renderLibrary(data) {
    libraryBody.innerHTML = '';

    if (data.length === 0) {
        const emptyTemplate = document.getElementById('empty-library-row-template');
        libraryBody.appendChild(emptyTemplate.content.cloneNode(true));
        return;
    }

    data.forEach(item => {
        const clone = rowTemplate.content.cloneNode(true);
        const cells = clone.querySelectorAll('td');
        const values = Object.values(item);

        cells.forEach((cell, index) => {
            cell.innerText = values[index];
        });

        const row = clone.querySelector('tr');
        row.addEventListener('click', () => showPreview(item));
        
        libraryBody.appendChild(clone);
    });
}

function showPreview(item) {
    const previewSheet = document.querySelector('.preview-sheet');
    document.querySelector('.preview-title').innerText = `Preview: ${item.name}`;
    
    previewSheet.innerHTML = `
        <div style="padding: 20px;">
            <h4>${item.client}</h4>
            <p>Date: ${item.date}</p>
            <p>Email: ${item.email}</p>
            <hr>
            <p>Location: ${item.city}, ${item.country}</p>
        </div>
    `;
    
    document.querySelector('.description-text').innerText = `Invoice for services provided to ${item.client} on ${item.date}.`;
}

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = invoices.filter(inv => 
        inv.client.toLowerCase().includes(term) || 
        inv.name.toLowerCase().includes(term)
    );
    renderLibrary(filtered);
});

// Initialize the table
renderLibrary(invoices);