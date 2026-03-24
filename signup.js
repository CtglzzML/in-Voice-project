const signupForm = document.getElementById('signup-form');
const passwordInput = document.getElementById('user-password');
const emailInput = document.getElementById('user-email');

if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const passwordValue = passwordInput.value;
        const emailValue = emailInput.value;

        if (passwordValue.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        // Logic to simulate account creation
        console.log("Creating account for:", emailValue);
        
        // Redirect to login page after "successful" signup
        window.location.href = 'login_page.html';
    });
}