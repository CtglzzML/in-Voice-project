document.addEventListener('DOMContentLoaded', function () {
  migrateLegacySession();
  redirectIfAuthenticated();

  var loginForm = document.querySelector('.login-form');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var signupBtn = document.querySelector('.signup-button');
  var googleBtn = document.querySelector('.google-button');

  if (loginForm && emailInput && passwordInput) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (loginUser(emailInput.value, passwordInput.value)) {
        redirectAfterLogin();
      }
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener('click', function () {
      window.location.href = 'sign_up.html';
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener('click', function () {
      if (loginWithGoogleStub()) {
        redirectAfterLogin();
      }
    });
  }
});
