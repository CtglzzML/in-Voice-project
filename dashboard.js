const newInvoiceBtn = document.querySelector('.primary-action-btn');
const historyBtn = document.getElementById('view-history-btn');
const directoryBtn = document.getElementById('manage-directory-btn');
const userBtn = document.querySelector('.user-button');
const menuTemplate = document.getElementById('user-profile-menu');
const pastInvoicesStat = document.getElementById('past-invoices-stat');
const clientsStat = document.getElementById('clients-stat');
const LOCAL_CUSTOMERS_KEY = 'savedCustomers';

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
  const email = String(client && client.email || '').trim().toLowerCase();
  if (email) return 'email:' + email;

  const name = String(client && client.name || '').trim().toLowerCase();
  const phone = String(client && client.phone || '').trim().toLowerCase();
  const address = String(client && client.address || '').trim().toLowerCase();
  return ['client', name, phone, address].join('|');
}

function buildCustomerFromInvoice(invoice) {
  const data = invoice && invoice.fullInvoice ? invoice.fullInvoice : invoice;
  if (!data) return null;

  const name = String(data.clientName || invoice.client || '').trim();
  const email = String(data.clientEmail || invoice.email || '').trim();
  const phone = String(data.clientPhone || invoice.phone || '').trim();
  const address = String(data.clientAddress || invoice.country || '').trim();
  const company = String(data.clientCompany || invoice.company || '').trim();

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

  return Array.from(merged.values()).filter(isFilledClient);
}

async function applyUserGreeting() {
  const labelEl = getUserButtonLabelEl();
  if (!labelEl || typeof getCurrentUser !== 'function') return;

  try {
    const user = await getCurrentUser();
    if (!user) return;

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
  } catch (_) {
    // Keep the fallback label if profile lookup fails.
  }
}

async function loadPastInvoicesCount() {
  if (!pastInvoicesStat || !window._supabase || typeof getCurrentUser !== 'function') return;

  try {
    const user = await getCurrentUser();
    if (!user) return;

    const { count, error } = await window._supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    pastInvoicesStat.textContent = String(count || 0);
  } catch (error) {
    console.error('Error loading invoice count:', error);
  }
}

async function loadClientsCount() {
  if (!clientsStat || !window._supabase || typeof getCurrentUser !== 'function') return;

  try {
    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await window._supabase
      .from('clients')
      .select('name, email, phone, company, address')
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    const localClients = bootstrapSavedCustomersFromInvoices();
    const visibleClients = mergeClients(data || [], localClients);
    clientsStat.textContent = String(visibleClients.length);
  } catch (error) {
    console.error('Error loading clients count:', error);
  }
}

applyUserGreeting();
loadPastInvoicesCount();
loadClientsCount();

window.addEventListener('pageshow', function () {
  loadPastInvoicesCount();
  loadClientsCount();
});

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

if (userBtn && menuTemplate) {
  userBtn.addEventListener('click', function () {
    var existing = document.getElementById('user-profile-menu-modal');
    if (existing) {
      existing.remove();
      return;
    }

    var clone = menuTemplate.content.cloneNode(true);
    document.body.appendChild(clone);

    var nameEl = document.getElementById('username');
    var userBtnLabel = getUserButtonLabelEl();
    if (nameEl && userBtnLabel) {
      nameEl.textContent = userBtnLabel.textContent.replace(/^Hi\s+/i, '');
    }

    var dash = document.getElementById('go-to-dashboard');
    var inv = document.getElementById('go-to-invoices');
    var usr = document.getElementById('go-to-account');
    var out = document.getElementById('signout');

    if (dash) {
      dash.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = 'dashboard.html';
      });
    }
    if (inv) {
      inv.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = 'invoice_library.html';
      });
    }
    if (usr) {
      usr.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = 'account_page.html';
      });
    }
    if (out) {
      out.addEventListener('click', function (e) {
        e.preventDefault();
        logoutUser().then(function () { window.location.href = 'landing_page.html'; });
      });
    }
  });

  document.addEventListener('click', function (e) {
    var modal = document.getElementById('user-profile-menu-modal');
    if (modal && !userBtn.contains(e.target) && !modal.contains(e.target)) {
      modal.remove();
    }
  });
}
