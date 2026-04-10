document.addEventListener('DOMContentLoaded', async function () {
  // Must be logged in
  var user = await getCurrentUser();
  if (!user) {
    window.location.replace('login_page.html');
    return;
  }

  // If profile already exists, skip onboarding
  var existing = await _supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (existing.data) {
    window.location.replace('dashboard.html');
    return;
  }

  // Pre-fill name from Google metadata if available
  var nameInput = document.getElementById('ob-name');
  if (nameInput && user.user_metadata && user.user_metadata.full_name) {
    nameInput.value = user.user_metadata.full_name;
  }

  var skipBtn = document.getElementById('skip-onboarding');
  if (skipBtn) {
    skipBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      // Insert minimal profile so the backend can always find the user
      await _supabase.from('users').insert({ id: user.id, email: user.email });
      window.location.href = 'dashboard.html';
    });
  }

  var form = document.getElementById('onboarding-form');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    var name = document.getElementById('ob-name').value.trim();
    var companyName = document.getElementById('ob-company-name').value.trim();
    var address = document.getElementById('ob-address').value.trim();
    var phone = document.getElementById('ob-phone').value.trim();
    var tvaNuumber = document.getElementById('ob-tva-number').value.trim();
    var defaultTva = document.getElementById('ob-default-tva').value;

    var profileData = {
      id: user.id,
      email: user.email,
      name: name,
      Company_name: companyName || null,
      address: address || null,
      phone: phone || null,
      tva_number: tvaNuumber || null,
      default_tva: defaultTva ? parseFloat(defaultTva) : null
    };

    // Handle logo upload if provided
    var logoFile = document.getElementById('ob-logo').files[0];
    if (logoFile) {
      var logoPath = user.id + '/' + logoFile.name;
      var uploadResult = await _supabase.storage
        .from('Logo')
        .upload(logoPath, logoFile, { upsert: true });
      if (!uploadResult.error) {
        var urlResult = _supabase.storage.from('Logo').getPublicUrl(logoPath);
        profileData.logo_url = urlResult.data.publicUrl;
      }
    }

    var result = await _supabase.from('users').insert(profileData);
    if (result.error && profileData.phone !== undefined) {
      var fallbackProfileData = Object.assign({}, profileData);
      delete fallbackProfileData.phone;
      result = await _supabase.from('users').insert(fallbackProfileData);
    }
    if (result.error) {
      alert('Error saving profile: ' + result.error.message);
      btn.disabled = false;
      btn.textContent = 'Save and continue';
      return;
    }

    if (typeof setProfileCache === 'function') {
      setProfileCache(profileData);
    }

    window.location.href = 'dashboard.html';
  });
});
