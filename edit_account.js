const editForm = document.getElementById('signup-form');
const cancelBtn = document.getElementById('cancel-btn');

async function loadProfileData() {
    if (!window.getCurrentUser || !window._supabase) return;

    var user = await window.getCurrentUser();
    if (!user) return;

    document.getElementById('user-email').value = user.email || '';

    var { data: profile } = await window._supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    
    if (profile) {
        document.getElementById('user-name').value = profile.name || '';
        document.getElementById('company-name').value = profile.company_name || '';
        document.getElementById('ob-siret').value = profile.siret || '';
        document.getElementById('ob-address').value = profile.address || '';
        document.getElementById('ob-tva-number').value = profile.tva_number || '';
        document.getElementById('ob-default-tva').value = profile.default_tva ?? '';
    }
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
        const companyName = document.getElementById('company-name').value;
        const siret = document.getElementById('ob-siret').value;
        const address = document.getElementById('ob-address').value;
        const tvaNumber = document.getElementById('ob-tva-number').value;
        const defaultTva = document.getElementById('ob-default-tva').value;
        const logoInput = document.getElementById('user-logo');

        try {
            let logo_url = null;
            
            // Upload logo if one was selected
            if (logoInput.files && logoInput.files.length > 0) {
                const file = logoInput.files[0];
                const fileExt = file.name.split('.').pop();
                const fileName = `${user.id}_${Date.now()}.${fileExt}`;
                const filePath = `${user.id}/${fileName}`;
                
                const { error: uploadError, data: uploadData } = await window._supabase.storage
                    .from('avatars')
                    .upload(filePath, file);
                    
                if (uploadError) throw uploadError;
                
                const { data } = window._supabase.storage
                    .from('avatars')
                    .getPublicUrl(filePath);
                    
                logo_url = data.publicUrl;
            }

            const updatePayload = {
                name: name,
                company_name: companyName,
                siret: siret || null,
                address: address || null,
                tva_number: tvaNumber || null,
                default_tva: defaultTva ? parseFloat(defaultTva) : null
            };

            if (logo_url) {
                updatePayload.logo_url = logo_url;
            }

            const { error: updateError } = await window._supabase
                .from('users')
                .update(updatePayload)
                .eq('id', user.id);

            if (updateError) throw updateError;
            
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

// Ensure the profile loading starts when the script runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProfileData);
} else {
    loadProfileData();
}