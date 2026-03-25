// invoice_search.js
document.addEventListener("DOMContentLoaded", () => {
    const searchInput =
        document.querySelector('input[type="search"]') ||
        document.querySelector('input[placeholder*="Search"]') ||
        document.querySelector('input[placeholder*="search"]') ||
        document.querySelector("input");

    if (!searchInput) {
        console.warn("Search input not found.");
        return;
    }

    let rows = Array.from(document.querySelectorAll("table tbody tr"));

    if (rows.length === 0) {
        rows = Array.from(document.querySelectorAll("tr")).filter(row => {
            return !row.querySelector("th");
        });
    }

    if (rows.length === 0) {
        console.warn("No invoice rows found.");
        return;
    }

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.toLowerCase().trim();

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? "" : "none";
        });
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    const parentForm = searchInput.closest("form");

    if (parentForm) {
        parentForm.addEventListener("submit", (e) => {
            e.preventDefault();
        });
    }
});