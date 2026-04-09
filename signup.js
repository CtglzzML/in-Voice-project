document.addEventListener('DOMContentLoaded', async function () {
  if (await isLoggedIn()) {
    window.location.replace('dashboard.html');
    return;
  }

  var signupForm = document.getElementById('signup-form');
  var googleBtn = document.getElementById('google-signup-btn');

  if (signupForm) {
    signupForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = signupForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Creating account…';

      var name = document.getElementById('user-name').value;
      var email = document.getElementById('user-email').value;
      var password = document.getElementById('user-password').value;
      var company = document.getElementById('company-name');
      var companyName = company ? company.value : '';

      var ok = await registerUser(name, email, password, { companyName: companyName });
      if (ok) {
        // If session exists immediately (email confirmation disabled), go to onboarding
        // Otherwise show message
        var loggedIn = await isLoggedIn();
        if (loggedIn) {
          window.location.href = 'onboarding.html';
        } else {
          alert('Account created! Check your email to confirm your address, then log in.');
          window.location.href = 'login_page.html';
        }
      } else {
        btn.disabled = false;
        btn.textContent = 'Create account';
      }
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener('click', function () {
      loginWithGoogle(window.location.origin + '/pages/onboarding.html');
    });
  }
});
