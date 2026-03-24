const backBtn = document.querySelector('.btn-secondary');
const createBtn = document.querySelector('.btn-primary');

if (backBtn) {
    backBtn.addEventListener('click', () => {
        window.location.href = 'create_invoice.html';
    });
}

if (createBtn) {
    createBtn.addEventListener('click', () => {
        const template = document.getElementById('invoice-created-template');
        const clone = template.content.cloneNode(true);
        document.body.appendChild(clone);
        
        // Handle popup buttons after they appear
        document.querySelector('.popup-card').addEventListener('click', (e) => {
            if (e.target.innerText === 'Login to save invoice') {
                window.location.href = 'login_page.html';
            } else if (e.target.innerText === 'Go to dashboard') {
                window.location.href = 'dashboard.html';
            } else if (e.target.innerText === 'Download PDF') {
                window.print();
            }
        });
    });
}