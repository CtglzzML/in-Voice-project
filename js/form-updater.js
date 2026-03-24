// js/form-updater.js
// Responsabilité : mapper les events invoice_update et profile du backend sur les inputs DOM

const formUpdater = (() => {
  function update(field, value) {
    switch (field) {
      case 'client_name':
        _setInput('#client-name', value);
        _setPreview('.bill-box p', value);
        break;
      case 'due_date':
        _setInput('#inv-due', value);
        break;
      case 'tva_rate':
        _setInput('#inv-tax', value);
        document.querySelector('#total-tva-label').textContent = `Tax (${value}%):`;
        break;
      case 'lines':
        _renderLines(value);
        break;
      case 'subtotal':
        _setText('#total-subtotal', `$${parseFloat(value).toFixed(2)}`);
        break;
      case 'tva_amount':
        _setText('#total-tva', `$${parseFloat(value).toFixed(2)}`);
        break;
      case 'total':
        _setText('#total-final', `$${parseFloat(value).toFixed(2)}`);
        break;
      // client_id et status ignorés (pas d'input dédié)
    }
  }

  function updateProfile(data) {
    _setInput('#company-name', data.name);
    _setInput('#company-address', data.address);
    _setInput('#company-email', data.email);
    _setPreview('.preview-company', data.name);
  }

  function unlockForm() {
    document.querySelectorAll('#inv-number, #inv-date, #inv-due, #inv-tax').forEach(el => {
      el.disabled = false;
    });
    document.querySelectorAll('#company-name, #company-address, #company-phone, #company-email').forEach(el => {
      el.disabled = false;
    });
    document.querySelectorAll('#client-name, #client-address, #client-phone, #client-email').forEach(el => {
      el.disabled = false;
    });
  }

  function _setInput(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null) el.value = value;
  }

  function _setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null) el.textContent = value;
  }

  function _setPreview(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null) el.textContent = value;
  }

  function _renderLines(lines) {
    // Cibler le tbody, pas la table (pour ne pas écraser les headers)
    const tbody = document.querySelector('#item-list-body');
    const template = document.querySelector('#non-empty-row');
    if (!tbody || !template) return;

    tbody.innerHTML = '';

    if (!lines || lines.length === 0) {
      const empty = document.querySelector('#empty-row');
      if (empty) tbody.appendChild(empty.content.cloneNode(true));
      return;
    }

    // Note: InvoiceLine backend utilise `qty` (pas `quantity`)
    lines.forEach(line => {
      const row = template.content.cloneNode(true);
      row.querySelector('.item-desc').value = line.description || '';
      row.querySelector('.item-qty').value = line.qty || 1;
      row.querySelector('.item-rate').value = line.unit_price || 0;
      const total = (line.qty || 1) * (line.unit_price || 0);
      row.querySelector('.item-total').textContent = `$${total.toFixed(2)}`;
      tbody.appendChild(row);
    });
  }

  return { update, updateProfile, unlockForm };
})();
