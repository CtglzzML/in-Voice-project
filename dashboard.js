const newInvoiceBtn = document.querySelector('.primary-action-btn');
const historyBtn = document.getElementById('view-history-btn');
const directoryBtn = document.getElementById('manage-directory-btn');
const userBtn = document.querySelector('.user-button');
const menuTemplate = document.getElementById('user-profile-menu');

function getUserButtonLabelEl() {
  if (!userBtn) return null;
  return userBtn.querySelector('span:not(.user-icon)') || userBtn.querySelector('span');
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

applyUserGreeting();

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
