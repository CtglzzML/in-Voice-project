async function fillAccountPage() {
  var user = await getCurrentUser();
  if (!user) return;

  var { data: profile } = await _supabase.from('users').select('*').eq('id', user.id).maybeSingle();
  var cachedProfile = typeof getProfileCache === 'function' ? getProfileCache() : {};
  profile = Object.assign({}, cachedProfile, profile || {});
  profile.email = profile.email || user.email || '';
  profile.phone = profile.phone || user.phone || '';
  if (typeof setProfileCache === 'function') setProfileCache(profile);

  var title = document.querySelector('main .account-username');
  var emailEl = document.querySelector('main .account-email');
  var companyEl = document.querySelector('main .account-company-name');
  var tvaEl = document.querySelector('main .account-tva');
  var defaultTvaEl = document.querySelector('main .account-default-tva');
  var addressEl = document.querySelector('main .account-address');
  var phoneEl = document.querySelector('main .account-phone');
  var logoContainer = document.getElementById('account-logo-container');

  var displayEmail = profile.email || user.email || '';
  var displayUsername = profile.name || (user.user_metadata && user.user_metadata.full_name) || displayEmail || 'User';
  var userBtnLabel = document.querySelector('.user-button span:not(.user-icon)') || document.querySelector('.user-button span');

  if (title) title.textContent = displayUsername;
  if (userBtnLabel) userBtnLabel.textContent = 'Hi ' + displayUsername;
  if (emailEl) emailEl.textContent = displayEmail;

  if (companyEl) companyEl.textContent = profile.Company_name || profile.company_name || '—';
  if (tvaEl) tvaEl.textContent = profile.tva_number || '—';
  if (defaultTvaEl) defaultTvaEl.textContent = profile.default_tva != null ? profile.default_tva + '%' : '—';
  if (addressEl) addressEl.textContent = profile.address || '—';
  if (phoneEl) phoneEl.textContent = profile.phone || '—';

  if (logoContainer && profile.logo_url) {
    logoContainer.innerHTML = '';
    logoContainer.classList.add('has-profile-image');
    var img = document.createElement('img');
    img.src = profile.logo_url;
    img.alt = 'Company Logo';
    logoContainer.appendChild(img);
  } else if (logoContainer) {
    logoContainer.classList.remove('has-profile-image');
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  await fillAccountPage();

  var backBtn = document.getElementById('back-to-dashboard');
  var editBtn = document.getElementById('edit-account-btn');
  var userBtn = document.querySelector('.user-button');
  var menuTemplate = document.getElementById('user-profile-menu');

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      window.location.href = 'dashboard.html';
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', function () {
      window.location.href = 'edit_account_page.html';
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
      var modal = document.getElementById('user-profile-menu-modal');
      if (!modal) return;

      var nameEl = document.getElementById('username');
      var mainNameEl = document.querySelector('main .account-username');
      if (nameEl && mainNameEl) {
        nameEl.textContent = mainNameEl.textContent;
      }

      var dash = document.getElementById('go-to-dashboard');
      var inv = document.getElementById('go-to-invoices');
      var cust = document.getElementById('go-to-customers');
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
      if (cust) {
        cust.addEventListener('click', function (e) {
          e.preventDefault();
          window.location.href = 'customer_info_page.html';
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
      if (modal && userBtn && !userBtn.contains(e.target) && !modal.contains(e.target)) {
        modal.remove();
      }
    });
  }
});
