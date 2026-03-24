const recordBtn = document.getElementById('recordBtn');
const contactLink = document.querySelector('.contact-link');

// Mic click opens Login Modal (since you need an account to save/record)
if (recordBtn) {
    recordBtn.addEventListener('click', () => {
        const template = document.getElementById('login-window');
        const clone = template.content.cloneNode(true);
        document.body.appendChild(clone);

        // Handle Modal Close
        const closeBtn = document.querySelector('.close-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('login-modal').remove();
            });
        }

        // Handle Redirects inside Modal
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            window.location.href = 'dashboard.html';
        });

        document.getElementById('sign-up-button').addEventListener('click', () => {
            window.location.href = 'sign_up.html';
        });
    });
}

// Contact Link
if (contactLink) {
    contactLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'contact_us.html';
    });
}