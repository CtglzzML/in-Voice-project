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
const LOCAL_CUSTOMERS_KEY = 'savedCustomers';

let allClients = [];
let selectedClient = null;

function getUserButtonLabelEl() {
    if (!userBtn) return null;
    return userBtn.querySelector('span:not(.user-icon)') || userBtn.querySelector('span');
}

function hasMeaningfulValue(value) {
    const normalized = String(value || '').trim();
    return normalized !== '' && normalized !== '-' && normalized !== '—';
}

function isFilledClient(client) {
    if (!client || typeof client !== 'object') return false;

    return [
        client.name,
        client.email,
        client.phone,
        client.company,
        client.address
    ].some(hasMeaningfulValue);
}

async function applyUserGreeting(user) {
    const labelEl = getUserButtonLabelEl();
    if (!labelEl || !user) return;

    let displayName = '';

    if (window._supabase) {
        const { data: profile } = await window._supabase
            .from('users')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();
        displayName = (profile && profile.name) || '';
    }

    if (!displayName) displayName = (user.user_metadata && user.user_metadata.full_name) || '';
    if (!displayName) displayName = user.email ? user.email.split('@')[0] : 'User';

    labelEl.textContent = 'Hi ' + displayName;
}

function getSavedCustomers() {
    try {
        const raw = localStorage.getItem(LOCAL_CUSTOMERS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function setSavedCustomers(customers) {
    localStorage.setItem(LOCAL_CUSTOMERS_KEY, JSON.stringify(customers));
}

function getSavedInvoices() {
    try {
        const raw = localStorage.getItem('savedInvoices');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function makeCustomerKey(client) {
    const email = (client.email || '').trim().toLowerCase();
    if (email) return 'email:' + email;

    const name = (client.name || '').trim().toLowerCase();
    const phone = (client.phone || '').trim().toLowerCase();
    const address = (client.address || '').trim().toLowerCase();
    return ['client', name, phone, address].join('|');
}

function buildCustomerFromInvoice(invoice) {
    const data = invoice && invoice.fullInvoice ? invoice.fullInvoice : invoice;
    if (!data) return null;

    const name = (data.clientName || invoice.client || '').trim();
    const email = (data.clientEmail || invoice.email || '').trim();
    const phone = (data.clientPhone || invoice.phone || '').trim();
    const address = (data.clientAddress || invoice.country || '').trim();
    const company = (data.clientCompany || invoice.company || '').trim();

    if (!name && !email && !phone && !address) return null;

    return {
        id: invoice.dbId || invoice.id || 'local-' + Date.now(),
        localKey: makeCustomerKey({ name, email, phone, address }),
        name: name || '—',
        email: email || '',
        phone: phone || '',
        address: address || '',
        company: company || '',
        source: 'local'
    };
}

function bootstrapSavedCustomersFromInvoices() {
    const savedCustomers = getSavedCustomers();
    if (savedCustomers.length) return savedCustomers;

    const invoices = getSavedInvoices();
    const deduped = new Map();

    invoices.forEach(function (invoice) {
        const customer = buildCustomerFromInvoice(invoice);
        if (!customer) return;
        deduped.set(customer.localKey, customer);
    });

    const customers = Array.from(deduped.values());
    if (customers.length) setSavedCustomers(customers);
    return customers;
}

function mergeClients(remoteClients, localClients) {
    const merged = new Map();

    (remoteClients || []).forEach(function (client) {
        const normalized = Object.assign({}, client, {
            source: 'remote',
            localKey: makeCustomerKey(client)
        });
        merged.set(normalized.localKey, normalized);
    });

    (localClients || []).forEach(function (client) {
        if (!client || !client.localKey) return;
        if (!merged.has(client.localKey)) {
            merged.set(client.localKey, client);
        }
    });

    return Array.from(merged.values()).filter(isFilledClient).sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

// ───────────────── Load clients from DB ─────────────────
async function loadClients() {
    if (!window._supabase || typeof window.getCurrentUser !== 'function') return;

    const user = await window.getCurrentUser();
    if (!user) return;

    await applyUserGreeting(user);

    const { data, error } = await window._supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

    if (error) {
        console.error('Error loading clients:', error);
    }

    const localClients = bootstrapSavedCustomersFromInvoices();
    allClients = mergeClients(data || [], localClients);
    selectedClient = null;
    updateActionButtons();
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
        const rawId = String(client.id || '').replace(/^local-/, '');
        const shortId = 'CIV#' + rawId.substring(0, 4).toUpperCase();

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

        if (selectedClient.source === 'local') {
            const remaining = getSavedCustomers().filter(function (client) {
                return client.localKey !== selectedClient.localKey;
            });
            setSavedCustomers(remaining);
        } else {
            const { error } = await window._supabase
                .from('clients')
                .delete()
                .eq('id', selectedClient.id);

            if (error) {
                alert('Failed to delete client: ' + (error.message || ''));
                return;
            }
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

        const nameEl = document.getElementById('username');
        const userBtnLabel = getUserButtonLabelEl();
        if (nameEl && userBtnLabel) {
            nameEl.textContent = userBtnLabel.textContent.replace(/^Hi\s+/i, '');
        }

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
