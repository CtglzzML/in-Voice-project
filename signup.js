document.addEventListener('DOMContentLoaded', async function () {
  if (await isLoggedIn()) {
    window.location.replace('dashboard.html');
    return;
  }

  var signupForm = document.getElementById('signup-form');
  var googleBtn = document.getElementById('google-signup-btn');

  // Email/password sign-up logic removed in favor of Google-only auth

  if (googleBtn) {
    googleBtn.addEventListener('click', function () {
      loginWithGoogle(window.location.origin + '/pages/onboarding.html');
    });
  }
});
