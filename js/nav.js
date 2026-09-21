/*
 * Renders the shared top navigation bar into any page that includes
 * a <div id="topnav"></div>. Pass the current page key to highlight it.
 */
function renderNav(activeKey) {
  const container = document.getElementById("topnav");
  if (!container) return;

  const links = [
    { key: "home", href: "index.html", label: "Home" },
    { key: "inventory", href: "inventory.html", label: "Inventory Management" },
    { key: "orders", href: "orders.html", label: "Order Fulfillment" },
    { key: "surveys", href: "surveys.html", label: "Site Surveying" },
  ];

  const linksHtml = links
    .map(
      (l) =>
        `<a href="${l.href}" class="${l.key === activeKey ? "active" : ""}">${l.label}</a>`
    )
    .join("");

  container.innerHTML = `
    <header class="topnav">
      <div class="brand"><span class="dot"></span> BlueSun Systems Mockup</div>
      <nav>${linksHtml}</nav>
    </header>
  `;
}
