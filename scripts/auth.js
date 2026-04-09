/**
 * Client-side session + local account store (demo / offline).
 * Replace loginUser/registerUser with Supabase calls when backend auth is ready.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'invoiceApp_currentUser';
  var LEGACY_KEY = 'currentUser';
  var REGISTERED_KEY = 'invoiceApp_registeredUsers';

  function migrateLegacySession() {
    try {
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, legacy);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function isValidSessionUser(u) {
    if (!u || typeof u !== 'object') return false;
    var email = u.email && String(u.email).trim();
    if (email) return true;
    // Allow persisted sessions that only have id (e.g. future OAuth)
    if (u.id && String(u.id).trim()) return true;
    return false;
  }

  function getCurrentUser() {
    migrateLegacySession();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var u = JSON.parse(raw);
      if (!isValidSessionUser(u)) return null;
      return u;
    } catch (e) {
      return null;
    }
  }

  function setCurrentUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function getRegisteredUsers() {
    try {
      var raw = localStorage.getItem(REGISTERED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRegisteredUsers(users) {
    localStorage.setItem(REGISTERED_KEY, JSON.stringify(users));
  }

  function registerUser(name, email, password, extra) {
    if (!email || !password) {
      alert('Email and password are required.');
      return false;
    }
    if (password.length < 6) {
      alert('Password must be at least 6 characters long.');
      return false;
    }
    var users = getRegisteredUsers();
    var em = email.trim().toLowerCase();
    if (users.some(function (u) {
      return u.email === em;
    })) {
      alert('An account with this email already exists.');
      return false;
    }
    var id = global.crypto && global.crypto.randomUUID
      ? global.crypto.randomUUID()
      : 'id-' + String(Date.now());
    users.push({
      id: id,
      name: (name && String(name).trim()) || em.split('@')[0],
      email: em,
      password: password,
      provider: 'email',
      createdAt: Date.now(),
      companyName: extra && extra.companyName ? extra.companyName : ''
    });
    saveRegisteredUsers(users);
    return true;
  }

  function loginUser(email, password) {
    if (!email || !password) {
      alert('Please enter email and password.');
      return false;
    }
    var em = email.trim().toLowerCase();
    var users = getRegisteredUsers();
    var found = users.find(function (u) {
      return u.email === em;
    });
    if (!found) {
      alert('No account found for this email. Please sign up first.');
      return false;
    }
    if (found.password !== password) {
      alert('Invalid email or password.');
      return false;
    }
    setCurrentUser({
      id: found.id,
      name: found.name,
      email: found.email,
      provider: found.provider || 'email',
      companyName: found.companyName || ''
    });
    return true;
  }

  /**
   * Placeholder until Supabase OAuth is wired:
   * supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ... } })
   */
  function loginWithGoogleStub() {
    var id = global.crypto && global.crypto.randomUUID
      ? global.crypto.randomUUID()
      : 'google-' + String(Date.now());
    setCurrentUser({
      id: id,
      name: 'Google User',
      email: 'demo.google@invoice.local',
      provider: 'google'
    });
    return true;
  }

  function logoutUser() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function isLoggedIn() {
    return !!getCurrentUser();
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

  function redirectIfAuthenticated() {
    migrateLegacySession();
    if (getCurrentUser()) {
      redirectAfterLogin();
    }
  }

  function requireAuthOrRedirect(pageFileName) {
    migrateLegacySession();
    if (!getCurrentUser()) {
      var q = pageFileName ? '?return=' + encodeURIComponent(pageFileName) : '';
      global.location.replace('login_page.html' + q);
      return false;
    }
    return true;
  }

  global.migrateLegacySession = migrateLegacySession;
  global.getCurrentUser = getCurrentUser;
  global.setCurrentUser = setCurrentUser;
  global.registerUser = registerUser;
  global.loginUser = loginUser;
  global.loginWithGoogleStub = loginWithGoogleStub;
  global.logoutUser = logoutUser;
  global.isLoggedIn = isLoggedIn;
  global.redirectAfterLogin = redirectAfterLogin;
  global.redirectIfAuthenticated = redirectIfAuthenticated;
  global.requireAuthOrRedirect = requireAuthOrRedirect;
  global.sanitizeReturnPage = sanitizeReturnPage;
  global.isValidSessionUser = isValidSessionUser;
})(typeof window !== 'undefined' ? window : global);
