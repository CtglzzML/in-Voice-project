document.addEventListener("DOMContentLoaded", () => {

  const authBtn = document.getElementById("auth-btn");
  const modal = document.getElementById("login-modal");
  const closeModal = document.getElementById("close-modal");
  const form = document.getElementById("login-form");
  const menu = document.getElementById("menu");
  const hamburger = document.getElementById("hamburger-btn");

  // 👉 ABRIR MODAL
  authBtn.onclick = () => modal.style.display = "block";
  closeModal.onclick = () => modal.style.display = "none";

  // 👉 LOGIN
  form.onsubmit = (e) => {
    e.preventDefault();

    const email = document.getElementById("email-login").value;
    const password = document.getElementById("password-login").value;

    if (loginUser(email, password)) {
      location.reload();
    }
  };

  // 👉 GOOGLE FAKE
  document.getElementById("google-login").onclick = () => {
    localStorage.setItem("currentUser", JSON.stringify({
      name: "Google User",
      email: "google@gmail.com"
    }));
    location.reload();
  };

  // 👉 SIGNUP
  document.getElementById("go-signup").onclick = () => {
    window.location.href = "pages/sign_up.html";
  };

  // 👉 CHECK USER
  const user = getCurrentUser();

  if (user) {
    authBtn.textContent = "Welcome " + user.name;
  }

  // 👉 MENU
  hamburger.onclick = () => {
    menu.classList.toggle("hidden");

    if (!user) {
      menu.innerHTML = `<a href="#">Login required</a>`;
    } else {
      menu.innerHTML = `
        <a href="pages/dashboard.html">Dashboard</a>
        <a href="pages/invoice_library.html">Invoices</a>
        <a href="pages/account_page.html">Account</a>
        <a href="#" id="logout">Logout</a>
      `;

      document.getElementById("logout").onclick = () => {
        logoutUser();
      };
    }
  };

});