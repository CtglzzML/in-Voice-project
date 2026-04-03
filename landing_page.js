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

const hamburgerBtn = document.getElementById('hamburger-btn');
const container = document.getElementById('menu-container');
const navigationTemplate = document.getElementById('navigation-menu');

hamburgerBtn.addEventListener('click', () => {
  // Check if the menu is already open
  const existingMenu = document.getElementById('navigation-menu-modal');
  
  if (existingMenu) {
    // If it's already there, remove it (close the menu)
    existingMenu.remove();
  } else {
    // 1. Grab the content inside the template
    const menuContent = navigationTemplate.content.cloneNode(true);
    
    // 2. Put it inside our wrapper container
    container.appendChild(menuContent);
  }
});

// Optional: Close the menu if the user clicks anywhere else on the screen
document.addEventListener('click', (e) => {
  const existingMenu = document.getElementById('navigation-menu-modal');
  if (existingMenu && !hamburgerBtn.contains(e.target) && !existingMenu.contains(e.target)) {
    existingMenu.remove();
  }
});