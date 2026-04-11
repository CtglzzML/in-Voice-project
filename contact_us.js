const contactForm = document.getElementById('contact-us-form');
const submitBtn = contactForm.querySelector('.submit-btn');
const returnBtn = contactForm.querySelector('.return-btn');

if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const successTemplate = document.getElementById('contact-us-success');
        const clone = successTemplate.content.cloneNode(true);
        
        document.body.innerHTML = ''; 
        document.body.appendChild(clone);

        document.querySelector('.orange-btn').addEventListener('click', () => {
            window.location.href = 'landing_page.html';
        });
    });
}

if (returnBtn) {
    returnBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.back();
    });
}
