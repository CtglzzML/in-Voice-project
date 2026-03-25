const recordBtn = document.getElementById('recordBtn');
const contactLink = document.querySelector('.contact-link');

// Mic click opens Login Modal (since you need an account to save/record)
if (recordBtn) {
    recordBtn.addEventListener('click', () => {
        window.location.href = 'create_invoice.html';
    });
}

// Contact Link
if (contactLink) {
    contactLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'contact_us.html';
    });
}