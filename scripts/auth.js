/**
 * Auth — Supabase Auth wrapper.
 * All functions are async. Callers must await them.
 */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://jixjcksmeswhbqfdrrac.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppeGpja3NtZXN3aGJxZmRycmFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODA2MDcsImV4cCI6MjA4OTc1NjYwN30.gWyEySptecP_RLpzLjm7lE4shwPYdIckRd00Oeg5o_s';

  var sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  global._supabase = sb;

  async function getCurrentUser() {
    var result = await sb.auth.getUser();
    return result.data.user || null;
  }

  async function isLoggedIn() {
    var result = await sb.auth.getSession();
    return !!result.data.session;
  }

  async function loginUser(email, password) {
    var result = await sb.auth.signInWithPassword({ email: email, password: password });
    if (result.error) { alert(result.error.message); return false; }
    return true;
  }

  async function registerUser(name, email, password, extra) {
    var result = await sb.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: name || '',
          company_name: (extra && extra.companyName) ? extra.companyName : ''
        }
      }
    });
    if (result.error) { alert(result.error.message); return false; }
    return true;
  }

  async function logoutUser() {
    await sb.auth.signOut();
  }

  async function loginWithGoogle(redirectTo) {
    var dest = redirectTo || (global.location.origin + '/pages/dashboard.html');
    var result = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: dest }
    });
    if (result.error) alert(result.error.message);
  }

  function sanitizeReturnPage(name) {
    if (!name || typeof name !== 'string') return 'dashboard.html';
    var base = name.split('/').pop() || '';
    if (!/^[a-zA-Z0-9_.-]+\.html$/.test(base)) return 'dashboard.html';
    if (base === 'login_page.html' || base === 'sign_up.html') return 'dashboard.html';
    return base;
  }

  function redirectAfterLogin() {
    var params = new URLSearchParams(global.location.search);
    var ret = sanitizeReturnPage(params.get('return'));
    global.location.href = ret;
  }

  async function redirectIfAuthenticated() {
    if (await isLoggedIn()) redirectAfterLogin();
  }

  async function requireAuthOrRedirect(pageFileName) {
    if (!(await isLoggedIn())) {
      var q = pageFileName ? '?return=' + encodeURIComponent(pageFileName) : '';
      global.location.replace('../pages/login_page.html' + q);
      return false;
    }
    return true;
  }

  // Legacy no-ops kept for compatibility
  function migrateLegacySession() {}
  function setCurrentUser() {}
  function isValidSessionUser() { return true; }

  global.getCurrentUser = getCurrentUser;
  global.isLoggedIn = isLoggedIn;
  global.loginUser = loginUser;
  global.registerUser = registerUser;
  global.logoutUser = logoutUser;
  global.loginWithGoogle = loginWithGoogle;
  global.redirectAfterLogin = redirectAfterLogin;
  global.redirectIfAuthenticated = redirectIfAuthenticated;
  global.requireAuthOrRedirect = requireAuthOrRedirect;
  global.sanitizeReturnPage = sanitizeReturnPage;
  global.migrateLegacySession = migrateLegacySession;
  global.setCurrentUser = setCurrentUser;
  global.isValidSessionUser = isValidSessionUser;

})(typeof window !== 'undefined' ? window : global);
