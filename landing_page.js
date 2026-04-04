const recordBtn = document.getElementById('recordBtn');
const contactLink = document.querySelector('.contact-link');
const hamburgerBtn = document.getElementById('hamburger-btn');
const container = document.getElementById('menu-container');
const navigationTemplate = document.getElementById('navigation-menu');
const authBtn = document.getElementById('auth-btn');

function applyLandingAuthUi() {
  migrateLegacySession();
  const user = getCurrentUser();
  const header = document.getElementById('landing-header');

  if (header) {
    header.classList.toggle('page-header--guest', !user);
    header.classList.toggle('page-header--user', !!user);
  }

  if (authBtn) {
    if (user) {
      authBtn.onclick = null;
    } else {
      authBtn.onclick = function () {
        window.location.href = 'login_page.html?return=landing_page.html';
      };
    }
  }

}

if (recordBtn) {
  recordBtn.addEventListener('click', function () {
    migrateLegacySession();
    if (!getCurrentUser()) {
      window.location.href = 'login_page.html?return=create_invoice.html';
      return;
    }
    window.location.href = 'create_invoice.html';
  });
}

if (contactLink) {
  contactLink.addEventListener('click', function (e) {
    e.preventDefault();
    window.location.href = 'contact_us.html';
  });
}

if (hamburgerBtn && container && navigationTemplate) {
  hamburgerBtn.addEventListener('click', function () {
    const existingMenu = document.getElementById('navigation-menu-modal');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }
    const menuContent = navigationTemplate.content.cloneNode(true);
    container.appendChild(menuContent);

    const logoutEl = document.getElementById('landing-logout');
    if (logoutEl) {
      logoutEl.addEventListener('click', function (e) {
        e.preventDefault();
        logoutUser();
        window.location.href = 'landing_page.html';
      });
    }
  });

  document.addEventListener('click', function (e) {
    const existingMenu = document.getElementById('navigation-menu-modal');
    if (existingMenu && hamburgerBtn && !hamburgerBtn.contains(e.target) && !existingMenu.contains(e.target)) {
      existingMenu.remove();
    }
  });
}

document.addEventListener('DOMContentLoaded', applyLandingAuthUi);
