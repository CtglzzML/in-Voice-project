// src/frontend/form-updater.js

export const formUpdater = (() => {
  function update(field, value) {
    switch (field) {
      case 'client_name':
        _setInput('#client-name', value);
        _setText('#preview-client-name', value);
        break;
      case 'client_address':
        _setInput('#client-address', value);
        _setText('#preview-client-address', value);
        break;
      case 'client_email':
        _setInput('#client-email', value);
        _setText('#preview-client-email', value);
        break;
      case 'client_phone':
        _setInput('#client-phone', value);
        _setText('#preview-client-phone', value);
        break;
      case 'due_date':
        _setInput('#inv-due', value);
        _setText('#preview-due-date', `Due ${value}`);
        break;
      case 'tva_rate':
        _setInput('#inv-tax', value);
        const tvaLabel = document.querySelector('#total-tva-label');
        if (tvaLabel) tvaLabel.textContent = `Tax (${value}%):`;
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
    }
  }

  function updateProfile(data) {
    _setInput('#company-name', data.name);
    _setInput('#company-address', data.address);
    _setInput('#company-email', data.email);
    _setText('.preview-company', data.name);
    _setText('#preview-company-address', data.address);
    _setText('#preview-company-email', data.email);
  }

  function setInvoiceNumber(number) {
    _setInput('#inv-number', number);
    _setText('#preview-invoice-number', `# ${number}`);
  }

  function initDate() {
    const today = new Date();
    const label = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    _setText('#preview-date', `Date ${label}`);
    const iso = today.toISOString().split('T')[0];
    _setInput('#inv-date', iso);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDate);
  } else {
    initDate();
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

  function _renderLines(lines) {
    const tbody = document.querySelector('#item-list-body');
    const template = document.querySelector('#non-empty-row');
    if (!tbody || !template) return;

    tbody.innerHTML = '';

    if (!lines || lines.length === 0) {
      const empty = document.querySelector('#empty-row');
      if (empty) tbody.appendChild(empty.content.cloneNode(true));
      return;
    }

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

  function recalcTotals() {
    const rows = document.querySelectorAll('#item-list-body .item-row');
    const tva = parseFloat(document.querySelector('#inv-tax')?.value) || 0;
    let subtotal = 0;

    rows.forEach(row => {
      const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
      const rate = parseFloat(row.querySelector('.item-rate')?.value) || 0;
      const lineTotal = qty * rate;
      const totalCell = row.querySelector('.item-total');
      if (totalCell) totalCell.textContent = `$${lineTotal.toFixed(2)}`;
      subtotal += lineTotal;
    });

    const tvaAmount = subtotal * tva / 100;
    const total = subtotal + tvaAmount;

    _setText('#total-subtotal', `$${subtotal.toFixed(2)}`);
    _setText('#total-tva', `$${tvaAmount.toFixed(2)}`);
    _setText('#total-final', `$${total.toFixed(2)}`);
    const tvaLabel = document.querySelector('#total-tva-label');
    if (tvaLabel) tvaLabel.textContent = `Tax (${tva}%):`;
  }

  document.addEventListener('input', (e) => {
    if (e.target.matches('.item-qty, .item-rate, #inv-tax')) {
      recalcTotals();
    }
    if (e.target.matches('#inv-number')) {
      _setText('#preview-invoice-number', `# ${e.target.value || '---'}`);
    }
    if (e.target.matches('#inv-date')) {
      const d = e.target.value ? new Date(e.target.value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      _setText('#preview-date', d ? `Date ${d}` : '');
    }
    if (e.target.matches('#inv-due')) {
      _setText('#preview-due-date', e.target.value ? `Due ${e.target.value}` : '');
    }
    if (e.target.matches('#company-name')) {
      _setText('.preview-company', e.target.value);
    }
    if (e.target.matches('#company-address')) {
      _setText('#preview-company-address', e.target.value);
    }
    if (e.target.matches('#company-phone')) {
      _setText('#preview-company-phone', e.target.value);
    }
    if (e.target.matches('#company-email')) {
      _setText('#preview-company-email', e.target.value);
    }
    if (e.target.matches('#client-name')) {
      _setText('#preview-client-name', e.target.value);
    }
    if (e.target.matches('#client-address')) {
      _setText('#preview-client-address', e.target.value);
    }
    if (e.target.matches('#client-phone')) {
      _setText('#preview-client-phone', e.target.value);
    }
    if (e.target.matches('#client-email')) {
      _setText('#preview-client-email', e.target.value);
    }
  });

  return { update, updateProfile, unlockForm, recalcTotals, setInvoiceNumber };
})();
