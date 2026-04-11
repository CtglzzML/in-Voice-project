(function (global) {
  'use strict';

  var LEGACY_INVOICES_KEY = 'savedInvoices';
  var LEGACY_CUSTOMERS_KEY = 'savedCustomers';

  function getSupabase() {
    return global._supabase || null;
  }

  async function getCurrentUserOrThrow() {
    if (typeof global.getCurrentUser !== 'function') {
      throw new Error('Authentication is not available on this page.');
    }

    var user = await global.getCurrentUser();
    if (!user) {
      throw new Error('You need to be logged in to save invoices.');
    }

    return user;
  }

  function getProfileCacheSafe() {
    if (typeof global.getProfileCache === 'function') {
      return global.getProfileCache() || {};
    }
    return {};
  }

  async function fetchUserProfile(user) {
    var profile = {};
    var supabase = getSupabase();

    if (supabase && user && user.id) {
      try {
        var result = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        profile = result.data || {};
      } catch (_) {
        profile = {};
      }
    }

    profile = Object.assign({}, getProfileCacheSafe(), profile || {});
    profile.email = profile.email || (user && user.email) || '';

    if (typeof global.setProfileCache === 'function') {
      global.setProfileCache(profile);
    }

    return profile;
  }

  function readLegacyInvoices() {
    try {
      var raw = global.localStorage.getItem(LEGACY_INVOICES_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function clearLegacyInvoices() {
    try {
      global.localStorage.removeItem(LEGACY_INVOICES_KEY);
      global.localStorage.removeItem(LEGACY_CUSTOMERS_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function numberOrZero(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeInvoice(invoiceInput) {
    var invoice = invoiceInput && invoiceInput.fullInvoice ? invoiceInput.fullInvoice : invoiceInput || {};
    var items = Array.isArray(invoice.items) ? invoice.items : [];

    return {
      invoiceNumber: normalizeText(invoice.invoiceNumber),
      invoiceDate: normalizeText(invoice.invoiceDate) || new Date().toISOString().slice(0, 10),
      dueDate: normalizeText(invoice.dueDate),
      taxPercent: numberOrZero(invoice.taxPercent),
      taxAmount: numberOrZero(invoice.taxAmount),
      subtotal: numberOrZero(invoice.subtotal),
      totalAmount: numberOrZero(invoice.totalAmount),
      companyName: normalizeText(invoice.companyName),
      companyAddress: normalizeText(invoice.companyAddress),
      companyPhone: normalizeText(invoice.companyPhone),
      companyEmail: normalizeText(invoice.companyEmail),
      companyLogo: normalizeText(invoice.companyLogo),
      clientName: normalizeText(invoice.clientName),
      clientAddress: normalizeText(invoice.clientAddress),
      clientPhone: normalizeText(invoice.clientPhone),
      clientEmail: normalizeText(invoice.clientEmail),
      clientCompany: normalizeText(invoice.clientCompany),
      comment: normalizeText(invoice.comment),
      items: items.map(function (item) {
        var qty = numberOrZero(item && item.qty);
        var unitPrice = item && item.unit_price != null
          ? numberOrZero(item.unit_price)
          : numberOrZero(item && item.rate);
        var total = item && item.total != null
          ? numberOrZero(item.total)
          : qty * unitPrice;

        return {
          description: normalizeText(item && item.description),
          qty: qty,
          unit_price: unitPrice,
          total: total
        };
      })
    };
  }

  async function fetchClientsForUser(userId) {
    var supabase = getSupabase();
    if (!supabase) return [];

    var result = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (result.error) {
      throw result.error;
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  function clientMatches(existingClient, candidate) {
    var existingEmail = normalizeText(existingClient && existingClient.email).toLowerCase();
    var candidateEmail = normalizeText(candidate && candidate.email).toLowerCase();

    if (existingEmail && candidateEmail) {
      return existingEmail === candidateEmail;
    }

    var existingName = normalizeText(existingClient && existingClient.name).toLowerCase();
    var candidateName = normalizeText(candidate && candidate.name).toLowerCase();
    if (!existingName || !candidateName || existingName !== candidateName) {
      return false;
    }

    var existingPhone = normalizeText(existingClient && existingClient.phone).toLowerCase();
    var candidatePhone = normalizeText(candidate && candidate.phone).toLowerCase();
    if (existingPhone && candidatePhone && existingPhone === candidatePhone) {
      return true;
    }

    var existingAddress = normalizeText(existingClient && existingClient.address).toLowerCase();
    var candidateAddress = normalizeText(candidate && candidate.address).toLowerCase();
    if (existingAddress && candidateAddress && existingAddress === candidateAddress) {
      return true;
    }

    var existingCompany = normalizeText(existingClient && existingClient.company).toLowerCase();
    var candidateCompany = normalizeText(candidate && candidate.company).toLowerCase();
    if (existingCompany && candidateCompany && existingCompany === candidateCompany) {
      return true;
    }

    return !existingPhone && !candidatePhone && !existingAddress && !candidateAddress;
  }

  async function ensureClientRecord(userId, invoice, existingClients) {
    var supabase = getSupabase();
    if (!supabase) return null;

    var candidate = {
      user_id: userId,
      name: normalizeText(invoice.clientName),
      email: normalizeText(invoice.clientEmail) || null,
      address: normalizeText(invoice.clientAddress) || null,
      company: normalizeText(invoice.clientCompany) || null,
      phone: normalizeText(invoice.clientPhone) || null
    };

    if (!candidate.name) {
      candidate.name = candidate.company || (candidate.email ? candidate.email.split('@')[0] : '');
    }

    if (!candidate.name && !candidate.email && !candidate.address && !candidate.phone && !candidate.company) {
      return null;
    }

    if (!candidate.name) {
      return null;
    }

    var clients = Array.isArray(existingClients) ? existingClients : await fetchClientsForUser(userId);
    var existing = clients.find(function (client) {
      return clientMatches(client, candidate);
    });

    if (existing) {
      var updatePayload = {};

      ['name', 'email', 'address', 'company', 'phone'].forEach(function (field) {
        var nextValue = candidate[field];
        if (nextValue && normalizeText(existing[field]) !== normalizeText(nextValue)) {
          updatePayload[field] = nextValue;
        }
      });

      if (Object.keys(updatePayload).length) {
        var updateResult = await supabase
          .from('clients')
          .update(updatePayload)
          .eq('id', existing.id)
          .select()
          .single();

        if (updateResult.error) {
          throw updateResult.error;
        }

        Object.assign(existing, updateResult.data || {});
      }

      return existing;
    }

    var insertResult = await supabase
      .from('clients')
      .insert(candidate)
      .select()
      .single();

    if (insertResult.error) {
      throw insertResult.error;
    }

    if (Array.isArray(clients)) {
      clients.push(insertResult.data);
    }

    return insertResult.data;
  }

  async function findExistingInvoice(userId, invoice) {
    var supabase = getSupabase();
    if (!supabase) return null;

    if (!invoice.invoiceNumber) {
      return null;
    }

    var byNumberResult = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .eq('invoice_number', invoice.invoiceNumber)
      .limit(1);

    if (byNumberResult.error) {
      throw byNumberResult.error;
    }

    return Array.isArray(byNumberResult.data) && byNumberResult.data.length
      ? byNumberResult.data[0]
      : null;
  }

  function buildInvoicePayload(userId, invoice, clientId) {
    return {
      user_id: userId,
      client_id: clientId || null,
      status: 'confirmed',
      invoice_number: invoice.invoiceNumber || null,
      issue_date: invoice.invoiceDate || null,
      due_date: invoice.dueDate || null,
      lines: invoice.items.map(function (item) {
        return {
          description: item.description || '',
          qty: numberOrZero(item.qty),
          unit_price: numberOrZero(item.unit_price),
          total: numberOrZero(item.total)
        };
      }),
      tva_rate: numberOrZero(invoice.taxPercent),
      subtotal: numberOrZero(invoice.subtotal),
      tva_amount: numberOrZero(invoice.taxAmount),
      total: numberOrZero(invoice.totalAmount),
      payment_terms: invoice.comment || null
    };
  }

  async function saveInvoiceToSupabase(invoiceInput, options) {
    var user = options && options.user ? options.user : await getCurrentUserOrThrow();
    var profile = options && options.profile ? options.profile : await fetchUserProfile(user);
    var clients = options && Array.isArray(options.clients) ? options.clients : await fetchClientsForUser(user.id);
    var invoice = normalizeInvoice(invoiceInput);

    if (!invoice.invoiceNumber) {
      throw new Error('Invoice number is required.');
    }

    var client = await ensureClientRecord(user.id, invoice, clients);
    var payload = buildInvoicePayload(user.id, invoice, client && client.id);
    var supabase = getSupabase();

    var existing = await findExistingInvoice(user.id, invoice);
    if (existing) {
      throw new Error('Invoice number "' + invoice.invoiceNumber + '" already exists. Please choose a unique invoice number.');
    }

    var result = await supabase
      .from('invoices')
      .insert(payload)
      .select()
      .single();

    if (result.error) {
      throw result.error;
    }

    return {
      invoice: result.data,
      client: client,
      profile: profile,
      user: user
    };
  }

  function getCompanyName(profile) {
    return normalizeText(profile && (profile.Company_name || profile.company_name));
  }

  function transformInvoiceRow(row, context) {
    var ctx = context || {};
    var clientsById = ctx.clientsById || {};
    var client = clientsById[row.client_id] || {};
    var profile = ctx.profile || {};
    var user = ctx.user || {};
    var tagsById = ctx.tagsById || {};
    var items = Array.isArray(row.lines) ? row.lines : [];
    var invoiceNumber = normalizeText(row.invoice_number);
    var companyName = getCompanyName(profile);

    return {
      dbId: row.id,
      fileName: invoiceNumber ? 'INV-' + invoiceNumber : 'INV-' + String(row.id || '').slice(0, 8),
      client: client.name || '-',
      email: client.email || '-',
      phone: client.phone || '-',
      date: row.issue_date || '',
      description: normalizeText(row.payment_terms) || 'No description available yet.',
      tags: Array.isArray(tagsById[row.id]) ? tagsById[row.id] : [],
      fullInvoice: {
        invoiceNumber: invoiceNumber,
        invoiceDate: row.issue_date || '',
        dueDate: row.due_date || '',
        taxPercent: numberOrZero(row.tva_rate),
        taxAmount: numberOrZero(row.tva_amount),
        subtotal: numberOrZero(row.subtotal),
        totalAmount: numberOrZero(row.total),
        companyName: companyName || 'My Company',
        companyAddress: normalizeText(profile.address),
        companyPhone: normalizeText(profile.phone),
        companyEmail: normalizeText(profile.email || user.email),
        companyLogo: normalizeText(profile.logo_url),
        clientName: normalizeText(client.name),
        clientAddress: normalizeText(client.address),
        clientPhone: normalizeText(client.phone),
        clientEmail: normalizeText(client.email),
        clientCompany: normalizeText(client.company),
        comment: normalizeText(row.payment_terms),
        items: items.map(function (item) {
          var qty = numberOrZero(item && item.qty);
          var rate = item && item.unit_price != null
            ? numberOrZero(item.unit_price)
            : numberOrZero(item && item.rate);

          return {
            description: normalizeText(item && item.description),
            qty: qty,
            rate: rate,
            total: item && item.total != null ? numberOrZero(item.total) : qty * rate
          };
        })
      }
    };
  }

  async function fetchInvoicesFromSupabase(options) {
    var user = options && options.user ? options.user : await getCurrentUserOrThrow();
    var profile = options && options.profile ? options.profile : await fetchUserProfile(user);
    var clients = await fetchClientsForUser(user.id);
    var supabase = getSupabase();

    var result = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('issue_date', { ascending: false });

    if (result.error) {
      throw result.error;
    }

    var clientsById = {};
    clients.forEach(function (client) {
      clientsById[client.id] = client;
    });

    var tagsById = options && options.tagsById ? options.tagsById : {};

    return (Array.isArray(result.data) ? result.data : []).map(function (row) {
      return transformInvoiceRow(row, {
        clientsById: clientsById,
        profile: profile,
        user: user,
        tagsById: tagsById
      });
    });
  }

  async function migrateLegacyInvoices(options) {
    var legacyInvoices = readLegacyInvoices();
    if (!legacyInvoices.length) {
      return { migrated: 0, total: 0 };
    }

    var user = options && options.user ? options.user : await getCurrentUserOrThrow();
    var profile = options && options.profile ? options.profile : await fetchUserProfile(user);
    var clients = await fetchClientsForUser(user.id);
    var migrated = 0;

    for (var i = 0; i < legacyInvoices.length; i += 1) {
      try {
        await saveInvoiceToSupabase(legacyInvoices[i], {
          user: user,
          profile: profile,
          clients: clients
        });
        migrated += 1;
      } catch (error) {
        console.error('Failed to migrate legacy invoice:', error);
      }
    }

    if (migrated === legacyInvoices.length) {
      clearLegacyInvoices();
    }

    return {
      migrated: migrated,
      total: legacyInvoices.length
    };
  }

  global.invoiceStorage = {
    fetchUserProfile: fetchUserProfile,
    normalizeInvoice: normalizeInvoice,
    saveInvoiceToSupabase: saveInvoiceToSupabase,
    fetchInvoicesFromSupabase: fetchInvoicesFromSupabase,
    migrateLegacyInvoices: migrateLegacyInvoices,
    readLegacyInvoices: readLegacyInvoices
  };
})(typeof window !== 'undefined' ? window : global);
