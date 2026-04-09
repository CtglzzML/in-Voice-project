document.addEventListener('DOMContentLoaded', function () {
  migrateLegacySession();
  if (getCurrentUser()) {
    window.location.replace('dashboard.html');
    return;
  }

  var signupForm = document.getElementById('signup-form');
  if (!signupForm) return;

  signupForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = document.getElementById('user-name').value;
    var email = document.getElementById('user-email').value;
    var password = document.getElementById('user-password').value;
    var company = document.getElementById('company-name');
    var companyName = company ? company.value : '';

    if (registerUser(name, email, password, { companyName: companyName })) {
      window.location.href = 'login_page.html';
    }
  });
});
