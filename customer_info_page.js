// customer_info_page.js
// Loads clients from Supabase, allows selection, and passes data to create_invoice

const customerTableBody = document.getElementById('customer-table-body');
const searchInput = document.getElementById('customer-search');
const searchBtn = document.getElementById('customer-search-btn');
const createInvoiceBtn = document.getElementById('create-invoice-btn');
const deleteCustomerBtn = document.getElementById('delete-customer-btn');
const goDashboardBtn = document.getElementById('go-dashboard-btn');
const userBtn = document.querySelector('.user-button');
const menuTemplate = document.getElementById('user-profile-menu');

let allClients = [];
let selectedClient = null;

// ───────────────── Load clients from DB ─────────────────
async function loadClients() {
    if (!window._supabase || typeof window.getCurrentUser !== 'function') return;

    const user = await window.getCurrentUser();
    if (!user) return;

    const { data, error } = await window._supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

    if (error) {
        console.error('Error loading clients:', error);
        return;
    }

    allClients = data || [];
    renderTable(allClients);
}

// ───────────────── Render table rows ─────────────────
function renderTable(clients) {
    if (!customerTableBody) return;
    customerTableBody.innerHTML = '';

    if (clients.length === 0) {
        customerTableBody.innerHTML = `
            <tr class="empty-state-row">
                <td colspan="6">
                    <div class="customer-empty-state">
                        <p>No customers found. They will appear here once created.</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    clients.forEach(function (client) {
        const tr = document.createElement('tr');
        tr.dataset.clientId = client.id;

        // Shorten the UUID for display
        const shortId = 'CIV#' + (client.id || '').substring(0, 4).toUpperCase();

        tr.innerHTML = `
            <td>${shortId}</td>
            <td>${client.name || '—'}</td>
            <td>${client.email || '—'}</td>
            <td>${client.phone || '—'}</td>
            <td>${client.company || '—'}</td>
            <td>${client.address || '—'}</td>
        `;

        tr.addEventListener('click', function () {
            selectRow(tr, client);
        });

        customerTableBody.appendChild(tr);
    });
}

// ───────────────── Row selection ─────────────────
function selectRow(tr, client) {
    // Deselect previous
    const prev = customerTableBody.querySelector('.selected-row');
    if (prev) prev.classList.remove('selected-row');

    // If clicking the same row, deselect
    if (selectedClient && selectedClient.id === client.id) {
        selectedClient = null;
        updateActionButtons();
        return;
    }

    tr.classList.add('selected-row');
    selectedClient = client;
    updateActionButtons();
}

function updateActionButtons() {
    if (createInvoiceBtn) createInvoiceBtn.disabled = !selectedClient;
    if (deleteCustomerBtn) deleteCustomerBtn.disabled = !selectedClient;
}

// ───────────────── Search / Filter ─────────────────
function filterClients(query) {
    if (!query || !query.trim()) {
        renderTable(allClients);
        return;
    }
    const q = query.toLowerCase().trim();
    const filtered = allClients.filter(function (c) {
        return (
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.phone && c.phone.toLowerCase().includes(q)) ||
            (c.company && c.company.toLowerCase().includes(q)) ||
            (c.address && c.address.toLowerCase().includes(q))
        );
    });
    renderTable(filtered);
}

if (searchInput) {
    searchInput.addEventListener('input', function () {
        filterClients(this.value);
    });
}

if (searchBtn) {
    searchBtn.addEventListener('click', function () {
        filterClients(searchInput ? searchInput.value : '');
    });
}

// ───────────────── Create Invoice with selected client ─────────────────
if (createInvoiceBtn) {
    createInvoiceBtn.addEventListener('click', function () {
        if (!selectedClient) return;

        // Store the selected client data in sessionStorage so the create_invoice page can read it
        sessionStorage.setItem('selectedClient', JSON.stringify({
            id: selectedClient.id,
            name: selectedClient.name || '',
            email: selectedClient.email || '',
            phone: selectedClient.phone || '',
            address: selectedClient.address || '',
            company: selectedClient.company || ''
        }));

        window.location.href = 'create_invoice.html';
    });
}

// ───────────────── Delete customer ─────────────────
if (deleteCustomerBtn) {
    deleteCustomerBtn.addEventListener('click', async function () {
        if (!selectedClient) return;
        if (!confirm('Are you sure you want to delete "' + selectedClient.name + '"? This cannot be undone.')) return;

        const { error } = await window._supabase
            .from('clients')
            .delete()
            .eq('id', selectedClient.id);

        if (error) {
            alert('Failed to delete client: ' + (error.message || ''));
            return;
        }

        selectedClient = null;
        updateActionButtons();
        await loadClients();
    });
}

// ───────────────── User profile menu ─────────────────
if (userBtn && menuTemplate) {
    userBtn.addEventListener('click', function () {
        const existing = document.getElementById('user-profile-menu-modal');
        if (existing) { existing.remove(); return; }
        document.body.appendChild(menuTemplate.content.cloneNode(true));

        var out = document.getElementById('signout');
        if (out) {
            out.addEventListener('click', function (e) {
                e.preventDefault();
                logoutUser().then(function () { window.location.href = 'landing_page.html'; });
            });
        }
    });

    document.addEventListener('click', function (e) {
        const modal = document.getElementById('user-profile-menu-modal');
        if (modal && !userBtn.contains(e.target) && !modal.contains(e.target)) {
            modal.remove();
        }
    });
}

// ───────────────── Init ─────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadClients);
} else {
    loadClients();
}
