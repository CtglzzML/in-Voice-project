const backBtn = document.querySelector('button[typ="button"]');
const editBtn = document.querySelector('button[type="button"]');

if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
}

if (editBtn && editBtn.innerText === "Edit Account") {
    editBtn.addEventListener('click', () => {
        window.location.href = 'edit_profile.html';
    });
}

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'signout') {
        e.preventDefault();
        window.location.href = 'login_page.html';
    }
});