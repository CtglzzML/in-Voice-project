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

const fileInput = document.getElementById('company-logo');
const preview = document.getElementById('logo-preview');
const labelText = document.getElementById('label-text');

fileInput.addEventListener('change', function() {
  const file = this.files[0]; // Get the first selected file

  if (file) {
    const reader = new FileReader();

    // When the file is finished being read...
    reader.addEventListener('load', function() {
      // 1. Set the <img> src to the file data
      preview.setAttribute('src', this.result);
      // 2. Show the image
      preview.style.display = 'block';
      // 3. Hide the placeholder text
      labelText.style.display = 'none';
    });

    reader.readAsDataURL(file);
  }
});