document.addEventListener('DOMContentLoaded', async function () {
  await redirectIfAuthenticated();

  var loginForm = document.querySelector('.login-form');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var signupBtn = document.querySelector('.signup-button');
  var googleBtn = document.querySelector('.google-button');

  if (loginForm && emailInput && passwordInput) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = loginForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Logging in…';

      var ok = await loginUser(emailInput.value, passwordInput.value);
      if (ok) {
        await redirectAfterLoginWithProfileCheck();
      } else {
        btn.disabled = false;
        btn.textContent = 'Log in';
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
      // Google login → go to dashboard (profile check happens there if needed)
      loginWithGoogle(window.location.origin + '/pages/onboarding.html');
    });
  }
});

async function redirectAfterLoginWithProfileCheck() {
  var user = await getCurrentUser();
  if (!user) { redirectAfterLogin(); return; }

  var result = await _supabase.from('users').select('id').eq('id', user.id).maybeSingle();
  if (!result.data) {
    window.location.href = 'onboarding.html';
  } else {
    redirectAfterLogin();
  }
}
