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
    const companyName = data.company_name || data.Company_name || data.name || '';
    const companyAddress = data.address || '';
    const companyPhone = data.phone || '';
    const companyEmail = data.email || '';
    const companyNameInput = document.querySelector('#company-name');
    const companyAddressInput = document.querySelector('#company-address');
    const companyPhoneInput = document.querySelector('#company-phone');
    const companyEmailInput = document.querySelector('#company-email');
    const taxInput = document.querySelector('#inv-tax');

    // PROFILE SSE should fill missing account info, but never clobber
    // seller details that already came from the saved profile or user edits.
    _setInputIfBlank(companyNameInput, companyName);
    _setInputIfBlank(companyAddressInput, companyAddress);
    _setInputIfBlank(companyPhoneInput, companyPhone);
    _setInputIfBlank(companyEmailInput, companyEmail);

    if (taxInput && data.default_tva != null && (!taxInput.value || taxInput.value === '0')) {
      taxInput.value = data.default_tva;
    }

    const resolvedCompanyName = (companyNameInput && companyNameInput.value) || companyName || 'My Company';
    const resolvedAddress = (companyAddressInput && companyAddressInput.value) || companyAddress || '-';
    const resolvedPhone = (companyPhoneInput && companyPhoneInput.value) || companyPhone || '-';
    const resolvedEmail = (companyEmailInput && companyEmailInput.value) || companyEmail || '-';

    _setText('.preview-company p', resolvedCompanyName);
    _setText('#preview-company-address', `From: ${resolvedAddress}`);
    _setText('#preview-company-phone', `Phone: ${resolvedPhone}`);
    _setText('#preview-company-email', `Email: ${resolvedEmail}`);
  }

  function setInvoiceNumber(number) {
    _setInput('#inv-number', number);
    _setText('#preview-invoice-number', `# ${number}`);
    
    const inputEl = document.querySelector('#inv-number');
    if (inputEl) {
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
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

  function _setInputIfBlank(el, value) {
    if (!el || value == null) return;
    if (!el.value || !String(el.value).trim()) {
      el.value = value;
    }
  }

  function _setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null) el.textContent = value;
  }

  function _renderLines(lines) {
    console.log("FORM UPDATER _renderLines CALLED WITH:", lines);
    const tbody = document.querySelector('#item-list-body');
    const template = document.querySelector('#non-empty-row');
    
    if (!tbody) { console.error("No tbody #item-list-body found!"); return; }
    if (!template) { console.error("No template #non-empty-row found!"); return; }

    tbody.innerHTML = '';

    if (!lines || lines.length === 0) {
      console.log("Lines are empty, rendering empty row.");
      const empty = document.querySelector('#empty-row');
      if (empty) {
          const clone = empty.content.cloneNode(true);
          console.log("Appending empty row fragment:", clone);
          tbody.appendChild(clone);
      } else {
          console.error("No #empty-row template found!");
      }
      return;
    }

    console.log("Rendering", lines.length, "lines");

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

  document.addEventListener('input', (e) => {
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

  return { update, updateProfile, unlockForm, setInvoiceNumber };
})();
