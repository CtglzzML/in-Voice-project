const editForm = document.getElementById('signup-form');
const cancelBtn = document.getElementById('cancel-btn');
const logoInput = document.getElementById('user-logo');
const logoImage = document.getElementById('edit-logo-image');
const logoPlaceholder = document.getElementById('edit-logo-placeholder');
const deleteLogoBtn = document.getElementById('edit-delete-logo-btn');
let currentProfile = {};
let removeLogo = false;

function getMergedProfile(profile, user) {
    const cachedProfile = typeof window.getProfileCache === 'function' ? window.getProfileCache() : {};
    const merged = Object.assign({}, cachedProfile, profile || {});
    merged.email = merged.email || (user && user.email) || '';
    merged.phone = merged.phone || (user && user.phone) || '';
    return merged;
}

function setLogoPreview(src) {
    if (!logoImage || !logoPlaceholder) return;

    if (src) {
        logoImage.src = src;
        logoImage.style.display = 'block';
        logoPlaceholder.style.display = 'none';
        return;
    }

    logoImage.removeAttribute('src');
    logoImage.style.display = 'none';
    logoPlaceholder.style.display = 'block';
}

async function loadProfileData() {
    if (!window.getCurrentUser || !window._supabase) return;

    var user = await window.getCurrentUser();
    if (!user) return;

    document.getElementById('user-email').value = user.email || '';

    var { data: profile } = await window._supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    currentProfile = getMergedProfile(profile, user);
    removeLogo = false;
    if (typeof window.setProfileCache === 'function') {
        window.setProfileCache(currentProfile);
    }

    document.getElementById('user-name').value = currentProfile.name || '';
    document.getElementById('company-name').value = currentProfile.Company_name || currentProfile.company_name || '';
    document.getElementById('ob-address').value = currentProfile.address || '';
    document.getElementById('ob-phone').value = currentProfile.phone || '';
    document.getElementById('ob-tva-number').value = currentProfile.tva_number || '';
    document.getElementById('ob-default-tva').value = currentProfile.default_tva ?? '';
    setLogoPreview(currentProfile.logo_url || '');
}

if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        var user = await window.getCurrentUser();
        if (!user) {
            alert('Not logged in!');
            return;
        }

        const submitBtn = editForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerText = 'Applying...';

        const name = document.getElementById('user-name').value;
        const companyName = document.getElementById('company-name') ? document.getElementById('company-name').value : '';
        const address = document.getElementById('ob-address').value;
        const phone = document.getElementById('ob-phone').value;
        const tvaNumber = document.getElementById('ob-tva-number').value;
        const defaultTva = document.getElementById('ob-default-tva').value;

        try {
            let logo_url = null;
            
            // Upload logo if one was selected
            if (logoInput.files && logoInput.files.length > 0) {
                const file = logoInput.files[0];
                const fileExt = file.name.split('.').pop();
                const fileName = `${user.id}_${Date.now()}.${fileExt}`;
                const filePath = `${user.id}/${fileName}`;
                
                const { error: uploadError, data: uploadData } = await window._supabase.storage
                    .from('Logo')
                    .upload(filePath, file);
                    
                if (uploadError) throw uploadError;
                
                const { data } = window._supabase.storage
                    .from('Logo')
                    .getPublicUrl(filePath);
                    
                logo_url = data.publicUrl;
                removeLogo = false;
            }

            const updatePayload = {
                name: name,
                Company_name: companyName || null,
                address: address || null,
                phone: phone || null,
                tva_number: tvaNumber || null,
                default_tva: defaultTva ? parseFloat(defaultTva) : null
            };

            if (logo_url) {
                updatePayload.logo_url = logo_url;
            } else if (removeLogo) {
                updatePayload.logo_url = null;
            }

            let { error: updateError } = await window._supabase
                .from('users')
                .update(updatePayload)
                .eq('id', user.id);

            if (updateError && updatePayload.phone !== undefined) {
                const fallbackPayload = Object.assign({}, updatePayload);
                delete fallbackPayload.phone;
                const fallbackResult = await window._supabase
                    .from('users')
                    .update(fallbackPayload)
                    .eq('id', user.id);
                updateError = fallbackResult.error || null;
            }

            if (updateError) throw updateError;

            currentProfile = Object.assign({}, currentProfile, updatePayload, {
                email: user.email || currentProfile.email || '',
                logo_url: removeLogo ? '' : (logo_url || currentProfile.logo_url || '')
            });
            if (typeof window.setProfileCache === 'function') {
                window.setProfileCache(currentProfile);
            }
            
            alert("Changes applied successfully!");
            window.location.href = 'account_page.html';

        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to update profile. ' + (error.message || ''));
            submitBtn.disabled = false;
            submitBtn.innerText = 'Apply';
        }
    });
}

if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'account_page.html';
    });
}

if (logoInput) {
    logoInput.addEventListener('change', () => {
        const file = logoInput.files && logoInput.files[0];
        if (!file) return;

        removeLogo = false;

        const reader = new FileReader();
        reader.onload = (event) => {
            setLogoPreview(event.target && event.target.result ? event.target.result : '');
        };
        reader.readAsDataURL(file);
    });
}

if (deleteLogoBtn) {
    deleteLogoBtn.addEventListener('click', () => {
        removeLogo = true;
        if (logoInput) {
            logoInput.value = '';
        }
        setLogoPreview('');
    });
}

// Ensure the profile loading starts when the script runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProfileData);
} else {
    loadProfileData();
}
