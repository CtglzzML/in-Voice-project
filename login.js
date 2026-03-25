const loginForm = document.querySelector('.login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signupBtn = document.querySelector('.signup-button');

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = emailInput.value;
        const password = passwordInput.value;

        if (email && password) {
            window.location.href = 'dashboard.html';
        }
    });
}

if (signupBtn) {
    signupBtn.addEventListener('click', () => {
        window.location.href = 'sign_up.html';
    });
}