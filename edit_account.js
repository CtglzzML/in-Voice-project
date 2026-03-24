const editForm = document.getElementById('signup-form');
const buttons = document.querySelectorAll('button[type="submit"]');

const applyBtn = buttons[0];
const cancelBtn = buttons[1];
const deleteBtn = buttons[2];

if (applyBtn) {
    applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        alert("Changes applied successfully!");
        window.location.href = 'account_page.html';
    });
}

if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'account_page.html';
    });
}

if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm("Are you sure you want to delete your account? This cannot be undone.")) {
            window.location.href = 'sign_up.html';
        }
    });
}