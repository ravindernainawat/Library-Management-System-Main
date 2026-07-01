/* ==============================
   BookSphere — Full Feature Logic
   MongoDB Backend Connected
   ============================== */

var API_BASE = "/api"; // Relative path allows access from localhost, local IP, or public tunnels
var DEPARTMENT_LIST = [
  "Zenith School of AI", "School of Engineering & Technology", "School of Management & Commerce",
  "School of Legal Studies", "School of Medical & Allied Sciences", "School of Physiotherapy and Rehabilitation Sciences",
  "School of Liberal Arts", "School of Architecture & Design", "School of Basic & Applied Sciences",
  "School of Emerging Media & Creator Economy", "School of Hotel Management & Catering Technology",
  "School of Education", "School of Agricultural Sciences"
];
var BRANCH_LIST = [
  "Automobile Engineering",
  "Civil Engineering",
  "Computer Science Engineering/ IT",
  "Electronics & Communication Engineering",
  "Mechanical Engineering",
  "Management",
  "Applied Science & Humanities",
  "School of Law"
];

// ============ API HELPERS ============
function getAuthHeaders(extraHeaders) {
  var token = localStorage.getItem("bs_token");
  var headers = extraHeaders || {};
  if (token) headers["Authorization"] = "Bearer " + token;
  headers["Bypass-Tunnel-Reminder"] = "true"; // Prevents localtunnel warning page from breaking API calls
  return headers;
}
function handleApiResponse(r, endpoint) {
  var ct = (r.headers.get("content-type") || "");
  if (!r.ok && !ct.includes("application/json")) {
    throw new Error("Server returned " + r.status + " (non-JSON). The API route \"" + endpoint + "\" may not exist or the server encountered an error.");
  }
  if (ct.includes("text/html")) {
    throw new Error("Server returned an HTML page instead of JSON for \"" + endpoint + "\". Check backend API routing and CORS configuration.");
  }
  return r.json();
}
function apiGet(endpoint) {
  return fetch(API_BASE + endpoint, { headers: getAuthHeaders() }).then(function (r) { return handleApiResponse(r, endpoint); });
}
function apiPost(endpoint, body) {
  var headers = getAuthHeaders({ "Content-Type": "application/json" });
  return fetch(API_BASE + endpoint, { method: "POST", headers: headers, body: JSON.stringify(body) }).then(function (r) { return handleApiResponse(r, endpoint); });
}
function apiPut(endpoint, body) {
  var headers = getAuthHeaders({ "Content-Type": "application/json" });
  return fetch(API_BASE + endpoint, { method: "PUT", headers: headers, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return handleApiResponse(r, endpoint); });
}
function apiDelete(endpoint) {
  return fetch(API_BASE + endpoint, { method: "DELETE", headers: getAuthHeaders() }).then(function (r) { return handleApiResponse(r, endpoint); });
}

// ============ PAGINATION ============
// Per-section state: { page, limit, totalPages, totalRecords }
var _pgState = {};

function _pgKey(section) { return section; }

function getPaginationState(section) {
  if (!_pgState[section]) _pgState[section] = { page: 1, limit: 20, totalPages: 1, totalRecords: 0 };
  return _pgState[section];
}

function setPaginationState(section, pagination) {
  _pgState[section] = {
    page:         pagination.page         || 1,
    limit:        pagination.limit        || 20,
    totalPages:   pagination.totalPages   || 1,
    totalRecords: pagination.totalRecords || 0,
    hasNextPage:  pagination.hasNextPage  || false,
    hasPrevPage:  pagination.hasPrevPage  || false
  };
}

/**
 * Renders a pagination bar into containerId.
 * onPageChange(newPage) is called when the user clicks Prev / Next.
 * onLimitChange(newLimit) is called when the user changes rows per page.
 */
function renderPaginationBar(section, containerId, onPageChangeFnName, onLimitChangeFnName) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var st = getPaginationState(section);
  if (st.totalRecords === 0 && st.page === 1) { container.innerHTML = ""; return; }

  var from = (st.page - 1) * st.limit + 1;
  var to   = Math.min(st.page * st.limit, st.totalRecords);

  var prevDisabled = !st.hasPrevPage ? "disabled" : "";
  var nextDisabled = !st.hasNextPage ? "disabled" : "";

  var prevIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';
  var nextIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';

  container.innerHTML =
    '<div class="pagination-bar">' +
      '<span class="pagination-info">Showing ' + from + '–' + to + ' of ' + st.totalRecords + ' records</span>' +
      '<div class="pagination-controls">' +
        '<div class="pagination-limit-wrap">' +
          '<span>Per page:</span>' +
          '<select onchange="' + (onLimitChangeFnName ? onLimitChangeFnName + '(parseInt(this.value))' : '') + '">' +
          [10, 20, 50, 100].map(function(n) {
            return '<option value="' + n + '"' + (n === st.limit ? ' selected' : '') + '>' + n + '</option>';
          }).join('') +
          '</select>' +
        '</div>' +
        '<button class="pagination-btn" ' + prevDisabled + ' onclick="' + onPageChangeFnName + '(' + (st.page - 1) + ')">' + prevIcon + ' Previous</button>' +
        '<span class="pagination-page-label">Page ' + st.page + ' of ' + st.totalPages + '</span>' +
        '<button class="pagination-btn" ' + nextDisabled + ' onclick="' + onPageChangeFnName + '(' + (st.page + 1) + ')">Next ' + nextIcon + '</button>' +
      '</div>' +
    '</div>';
}

// ============ PAGINATION HANDLERS ============
function goToBooksPage(p) { var st = getPaginationState("books"); st.page = p; renderBooks(); }
function changeBooksLimit(l) { var st = getPaginationState("books"); st.page = 1; st.limit = l; renderBooks(); }

function goToTransactionsPage(p) { var st = getPaginationState("transactions"); st.page = p; renderTransactions(); }
function changeTransactionsLimit(l) { var st = getPaginationState("transactions"); st.page = 1; st.limit = l; renderTransactions(); }

function goToUsersPage(p) { var st = getPaginationState("users"); st.page = p; renderUsers(); }
function changeUsersLimit(l) { var st = getPaginationState("users"); st.page = 1; st.limit = l; renderUsers(); }

function goToHistoryPage(p) { var st = getPaginationState("history"); st.page = p; renderBorrowingHistory(); }
function changeHistoryLimit(l) { var st = getPaginationState("history"); st.page = 1; st.limit = l; renderBorrowingHistory(); }

function goToNotificationsPage(p) { var st = getPaginationState("notifications"); st.page = p; renderNotifications(); }
function changeNotificationsLimit(l) { var st = getPaginationState("notifications"); st.page = 1; st.limit = l; renderNotifications(); }

function goToActivityPage(p) { var st = getPaginationState("activity"); st.page = p; renderActivityLogs(); }
function changeActivityLimit(l) { var st = getPaginationState("activity"); st.page = 1; st.limit = l; renderActivityLogs(); }

function goToReservationsPage(p) { var st = getPaginationState("reservations"); st.page = p; renderReservations(); }
function changeReservationsLimit(l) { var st = getPaginationState("reservations"); st.page = 1; st.limit = l; renderReservations(); }

function goToAdminExchangesPage(p) { var st = getPaginationState("admin-exchanges"); st.page = p; renderAdminExchanges(); }
function changeAdminExchangesLimit(l) { var st = getPaginationState("admin-exchanges"); st.page = 1; st.limit = l; renderAdminExchanges(); }

// ============ AUTH ============
function getCurrentUser() { var d = localStorage.getItem("bs_currentUser"); return d ? JSON.parse(d) : null; }
function isAdmin() { var u = getCurrentUser(); return u && (u.role === "admin" || u.role === "owner"); }
function isOwner() { var u = getCurrentUser(); return u && u.role === "owner"; }
function checkAuth() { var u = getCurrentUser(); if (!u) { window.location.href = "login.html"; return null; } return u; }
function logout() { localStorage.removeItem("bs_currentUser"); localStorage.removeItem("bs_token"); window.location.href = "login.html"; }

// ============ TOAST ============
function showToast(message, type) {
  type = type || "info";
  var container = document.getElementById("toastContainer");
  var toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
}

// ============ UTILITIES ============
function formatDate(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(iso) {
  if (!iso) return "--";
  var d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function calculateFine(t) {
  var now = new Date(), due = new Date(t.dueDate), diff;
  if (t.status === "returned") { diff = new Date(t.returnDate) - due; }
  else { diff = now - due; }
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) * 5;
}
function renderStars(rating, interactive, bookId) {
  var html = '<span class="stars">';
  for (var i = 1; i <= 5; i++) {
    if (interactive) {
      html += '<span class="star ' + (i <= rating ? "filled" : "") + '" onclick="submitRating(\'' + bookId + "', " + i + ')" onmouseover="hoverStars(this,' + i + ')" onmouseout="unhoverStars(this,' + rating + ')">★</span>';
    } else {
      html += '<span class="star ' + (i <= rating ? "filled" : "") + '">★</span>';
    }
  }
  html += "</span>";
  return html;
}
function animateCounter(id, target) {
  var el = document.getElementById(id);
  if (!el) return;
  var start = parseInt(el.textContent) || 0, diff = target - start;
  if (diff === 0) { el.textContent = target; return; }
  var startTime = performance.now();
  function step(now) {
    var p = Math.min((now - startTime) / 600, 1);
    el.textContent = Math.round(start + diff * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============ NOTIFICATION BADGE ============
function updateNotificationBadge(count) {
  var badge = document.getElementById("notifBadge");
  if (badge) { badge.textContent = count || 0; badge.style.display = count > 0 ? "flex" : "none"; }
}
function updateSidebarRequestBadge(count) {
  var badge = document.getElementById("sidebarReqBadge");
  if (!badge) return;
  badge.textContent = count > 0 ? count : "";
  badge.style.display = count > 0 ? "inline-flex" : "none";
}

// ============ ROLE-BASED UI ============
function setupRoleBasedUI(user) {
  var sidebar = document.getElementById("sidebar");

  // Populate navbar profile
  var nameEl = document.getElementById("navbar-profile-name");
  if (nameEl) nameEl.textContent = user.name;
  var ddName = document.getElementById("dropdown-name");
  if (ddName) ddName.textContent = user.name;
  var ddRole = document.getElementById("dropdown-role");
  if (ddRole) ddRole.textContent = user.role;
  // Load profile picture for navbar avatar
  loadNavbarAvatar();

  if (user.role === "admin" || user.role === "owner") {
    sidebar.innerHTML =
      '<span class="sidebar-label">Main</span>' +
      sidebarLink("dashboard", "Dashboard", '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>') +
      sidebarLink("books", "Books", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') +
      sidebarLink("users", "Users & Accounts", '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') +
      '<span class="sidebar-label">Operations</span>' +
      sidebarLink("issue-return", "Issue / Return", '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>') +
      sidebarLink("requests", "Requests", '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', true) +
      sidebarLink("shelf", "Shelf Locations", '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>') +
      '<span class="sidebar-label">Insights</span>' +
      sidebarLink("analytics", "Analytics", '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>') +
      sidebarLink("reports", "Reports", '<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>') +
      sidebarLink("fines", "Fine Reports", '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>') +
      sidebarLink("activity", "Activity Logs", '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>') +
      sidebarLink("notifications", "Notifications", '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') +
      '<span class="sidebar-label">Library</span>' +
      sidebarLink("digital-library", "E-Books", '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>') +
      sidebarLink("export", "Export Data", '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');

    document.querySelectorAll(".admin-only").forEach(function (el) { el.style.display = ""; });
    document.querySelectorAll(".admin-only-col").forEach(function (el) { el.style.display = ""; });
    document.querySelectorAll(".student-only").forEach(function (el) { el.style.display = "none"; });
    // Show owner-only elements
    if (user.role === "owner") {
      document.querySelectorAll(".owner-only").forEach(function (el) { el.style.display = ""; });
    }
  } else {
    sidebar.innerHTML =
      '<span class="sidebar-label">Main</span>' +
      sidebarLink("dashboard", "Dashboard", '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>') +
      sidebarLink("books", "Browse Books", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') +
      '<span class="sidebar-label">My Activity</span>' +
      sidebarLink("issue-return", "My Books", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') +
      sidebarLink("my-requests", "My Requests", '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') +
      sidebarLink("reservations", "My Reservations", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') +
      sidebarLink("exchange", "Book Exchange", '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>') +
      sidebarLink("wishlist", "Wishlist", '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>') +
      sidebarLink("history", "Borrowing History", '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>') +
      sidebarLink("my-fines", "My Fines", '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>') +
      sidebarLink("achievements", "My Achievements", '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>') +
      sidebarLink("notifications", "Notifications", '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') +
      '<span class="sidebar-label">Library</span>' +
      sidebarLink("digital-library", "E-Books", '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');

    document.querySelectorAll(".admin-only").forEach(function (el) { el.style.display = "none"; });
    document.querySelectorAll(".admin-only-col").forEach(function (el) { el.style.display = "none"; });
    document.querySelectorAll(".student-only").forEach(function (el) { el.style.display = ""; });
    var uc = document.getElementById("stat-card-users"); if (uc) uc.style.display = "none";
    var it = document.getElementById("issue-section-title"); if (it) it.textContent = "My Books";
    var tt = document.getElementById("transactions-table-title"); if (tt) tt.textContent = "My Issued Books";
  }
  // Restore dark mode preference
  if (localStorage.getItem("bs_darkMode") === "light") {
    document.body.classList.add("light-mode");
    var icon = document.getElementById("darkModeIcon");
    if (icon) icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
  // Set first link active
  var first = sidebar.querySelector(".sidebar-link"); if (first) first.classList.add("active");
}

// ============ NAVBAR PROFILE DROPDOWN ============
function loadNavbarAvatar() {
  apiGet("/auth/profile").then(function(d) {
    if (!d.success) return;
    var pic = d.profile.profilePicture;
    // Navbar avatar
    var img = document.getElementById("navbar-avatar-img");
    var ph = document.getElementById("navbar-avatar-placeholder");
    var ddImg = document.getElementById("dropdown-avatar-img");
    var ddPh = document.getElementById("dropdown-avatar-placeholder");
    if (pic) {
      if (img) { img.src = pic; img.style.display = "block"; }
      if (ph) ph.style.display = "none";
      if (ddImg) { ddImg.src = pic; ddImg.style.display = "block"; }
      if (ddPh) ddPh.style.display = "none";
    } else {
      if (img) img.style.display = "none";
      if (ph) ph.style.display = "block";
      if (ddImg) ddImg.style.display = "none";
      if (ddPh) ddPh.style.display = "block";
    }
  }).catch(function() { console.warn("[BookSphere] Could not load profile avatar"); });
}

function toggleProfileDropdown(e) {
  e.stopPropagation();
  var el = document.getElementById("navbarProfile");
  if (el) el.classList.toggle("open");
}
function closeProfileDropdown() {
  var el = document.getElementById("navbarProfile");
  if (el) el.classList.remove("open");
}
// Close dropdown on outside click
document.addEventListener("click", function(e) {
  var dd = document.getElementById("navbarProfile");
  if (dd && !dd.contains(e.target)) dd.classList.remove("open");
});

function sidebarLink(section, label, svgContent, hasBadge) {
  return '<a class="sidebar-link" data-section="' + section + '" onclick="switchSection(\'' + section + '\')">' +
    '<span class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + svgContent + '</svg></span> ' + label +
    (hasBadge ? ' <span class="sidebar-badge" id="sidebarReqBadge"></span>' : '') + '</a>';
}

// ============ MOBILE SIDEBAR TOGGLE ============
function toggleSidebar() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sidebarOverlay");
  if (!sidebar) return;
  var isOpen = sidebar.classList.toggle("mobile-open");
  if (overlay) overlay.classList.toggle("active", isOpen);
  document.body.classList.toggle("sidebar-open", isOpen);
}
function closeSidebar() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("mobile-open");
  if (overlay) overlay.classList.remove("active");
  document.body.classList.remove("sidebar-open");
}

// ============ NAVIGATION ============
function switchSection(name) {
  document.querySelectorAll(".content-section").forEach(function (s) { s.classList.remove("active"); });
  var t = document.getElementById("section-" + name);
  if (t) t.classList.add("active");
  document.querySelectorAll(".sidebar-link").forEach(function (l) {
    l.classList.remove("active");
    if (l.dataset.section === name) l.classList.add("active");
  });
  // Auto-close sidebar on mobile/tablet after navigation
  if (window.innerWidth <= 1024) closeSidebar();
  if (name === "dashboard") updateDashboardStats();
  if (name === "books") renderBooks();
  if (name === "users") renderUsers();
  if (name === "issue-return") { if (isAdmin()) { populateIssueDropdowns(); populateQRUserDropdown(); } renderTransactions(); }
  if (name === "requests") { renderRequests(); renderAdminExchanges(); }
  if (name === "my-requests") renderMyRequests();
  if (name === "wishlist") renderWishlist();
  if (name === "history") renderBorrowingHistory();
  if (name === "my-fines") renderMyFines();
  if (name === "achievements") { renderGamificationStats(); renderLeaderboard(); }
  if (name === "notifications") renderNotifications();
  if (name === "analytics") renderAnalyticsDashboard();
  if (name === "reports") renderReports();
  if (name === "fines") renderFineReport();
  if (name === "activity") renderActivityLogs();
  if (name === "digital-library") renderDigitalLibrary();

  if (name === "shelf") renderShelfManagement();

  if (name === "reservations") renderReservations();
  if (name === "exchange") renderExchanges();

  if (name === "export") { /* static page, no load needed */ }
  if (name === "profile") renderProfile();
}

// ============ DASHBOARD ============
function updateDashboardStats() {
  var user = getCurrentUser();

  // Greeting
  var h = new Date().getHours();
  var greetText = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  var greetEl = document.getElementById("dash-greeting-text");
  if (greetEl) greetEl.textContent = greetText + ", " + user.name + " \uD83D\uDC4B";

  // Date chip
  var dateEl = document.getElementById("dash-date-chip");
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  apiGet("/stats?role=" + user.role + "&name=" + encodeURIComponent(user.name)).then(function (d) {
    animateCounter("stat-total-books", d.totalBooks);
    if (isAdmin()) animateCounter("stat-total-users", d.totalUsers);
    animateCounter("stat-issued-books", d.issuedBooks);
    document.getElementById("stat-total-fines").textContent = "\u20B9" + d.totalFines;
    renderRecentTransactions(d.recent);
    if (isAdmin()) { updateNotificationBadge(d.pendingRequests); updateSidebarRequestBadge(d.pendingRequests); }
    else { loadStudentNotifCount(); }

    // Populate new dashboard panels
    renderDashStockDonut(d);
    renderDashOverdue(d.recent);
  }).catch(function() {
    showToast("Could not load dashboard stats. Database may be unreachable.", "error");
    // Show zeroes so dashboard isn't blank
    animateCounter("stat-total-books", 0);
    animateCounter("stat-issued-books", 0);
    var finesEl = document.getElementById("stat-total-fines");
    if (finesEl) finesEl.textContent = "\u20B90";
  });

  // Load extra dashboard data
  renderDashCategoryDonut();
  renderDashTopBooks();
  if (isAdmin()) renderDashRecentActivities();
  if (!isAdmin()) { loadRecommendations(); renderGamificationStats(); renderLeaderboard(); }
}
function loadStudentNotifCount() {
  var user = getCurrentUser();
  apiGet("/notifications/" + encodeURIComponent(user.email) + "?limit=1000").then(function (n) {
    var list = Array.isArray(n) ? n : (n.data || []);
    var unread = list.filter(function (x) { return !x.read; }).length;
    updateNotificationBadge(unread);
  });
}
function renderRecentTransactions(txs) {
  var tb = document.getElementById("recent-transactions-body");
  if (!txs || txs.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No transactions yet.</p></td></tr>'; return; }
  tb.innerHTML = txs.map(function (t) {
    var f = calculateFine(t);
    return "<tr><td>" + (t.bookTitle || "Deleted") + "</td><td>" + (t.userName || "?") + "</td><td>" + formatDate(t.issueDate) + "</td><td>" + formatDate(t.dueDate) + "</td><td>" +
      (t.status === "issued" ? '<span class="badge badge-warning">Issued</span>' : '<span class="badge badge-success">Returned</span>') + "</td><td>" +
      (f > 0 ? '<span style="color:var(--danger);font-weight:600">\u20B9' + f + "</span>" : '<span style="color:var(--text-muted)">--</span>') + "</td></tr>";
  }).join("");
}

// ============ DASHBOARD: DONUT CHARTS ============
function drawDonut(canvasId, segments, total) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var cx = canvas.width / 2, cy = canvas.height / 2, r = 70, lineW = 18;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  var isLight = document.body.classList.contains("light-mode");
  var bgRingColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
  var bgRingColorMuted = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)";

  if (!segments || segments.length === 0 || total === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = bgRingColor; ctx.lineWidth = lineW; ctx.stroke();
    return;
  }
  var startAngle = -Math.PI / 2;
  var animProgress = { v: 0 };
  var startTime = performance.now();
  function animFrame(now) {
    var elapsed = now - startTime;
    animProgress.v = Math.min(elapsed / 800, 1);
    var ease = 1 - Math.pow(1 - animProgress.v, 3);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // bg ring
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = bgRingColorMuted; ctx.lineWidth = lineW; ctx.stroke();
    var angle = -Math.PI / 2;
    segments.forEach(function(seg) {
      var sweep = (seg.value / total) * Math.PI * 2 * ease;
      ctx.beginPath(); ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.strokeStyle = seg.color; ctx.lineWidth = lineW; ctx.lineCap = "round"; ctx.stroke();
      angle += sweep + 0.04;
    });
    if (animProgress.v < 1) requestAnimationFrame(animFrame);
  }
  requestAnimationFrame(animFrame);
}

function renderDashStockDonut(stats) {
  var total = stats.totalBooks || 0;
  var issued = stats.issuedBooks || 0;
  var available = total - issued;
  var segments = [
    { label: "Available", value: available, color: "#2ed573" },
    { label: "Issued", value: issued, color: "#f59e0b" }
  ];
  drawDonut("dash-stock-canvas", segments, total);
  var numEl = document.getElementById("dash-stock-total");
  if (numEl) numEl.textContent = total;
  var legend = document.getElementById("dash-stock-legend");
  if (legend) {
    legend.innerHTML = segments.map(function(s) {
      return '<span class="dash-legend-item"><span class="dash-legend-dot" style="background:' + s.color + '"></span>' + s.label + ' <b>' + s.value + '</b></span>';
    }).join("");
  }
}

function renderDashCategoryDonut() {
  apiGet("/books?paginate=false").then(function(books) {
    if (!books || !books.length) return;
    var catMap = {};
    books.forEach(function(b) {
      var cat = b.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + 1;
    });
    var colors = ["#3b82f6","#2ed573","#f59e0b","#ff4757","#a855f7","#06b6d4","#ec4899","#84cc16"];
    var entries = Object.keys(catMap).map(function(k, i) {
      return { label: k, value: catMap[k], color: colors[i % colors.length] };
    }).sort(function(a,b) { return b.value - a.value; }).slice(0, 6);
    var total = entries.reduce(function(s,e) { return s + e.value; }, 0);
    drawDonut("dash-category-canvas", entries, total);
    var legend = document.getElementById("dash-category-legend");
    if (legend) {
      legend.innerHTML = entries.map(function(e) {
        var pct = Math.round(e.value / total * 100);
        return '<span class="dash-legend-item"><span class="dash-legend-dot" style="background:' + e.color + '"></span>' + e.label + ' <b>' + pct + '%</b></span>';
      }).join("");
    }
  });
}

// ============ DASHBOARD: TOP BOOKS ============
function renderDashTopBooks() {
  apiGet("/transactions?limit=100").then(function(res) {
    var txs = Array.isArray(res) ? res : (res.data || []);
    if (!txs || !txs.length) {
      var el = document.getElementById("dash-top-books");
      if (el) el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No borrow data yet</p>';
      return;
    }
    var bookCount = {};
    txs.forEach(function(t) {
      var key = t.bookTitle || "Unknown";
      if (!bookCount[key]) bookCount[key] = { title: key, author: t.bookAuthor || "", count: 0 };
      bookCount[key].count++;
    });
    var sorted = Object.values(bookCount).sort(function(a,b) { return b.count - a.count; }).slice(0, 5);
    var rankClasses = ["gold", "silver", "bronze", "normal", "normal"];
    var el = document.getElementById("dash-top-books");
    if (el) {
      el.innerHTML = sorted.map(function(b, i) {
        return '<div class="dash-topbook-item" style="animation-delay:' + (i * 0.08) + 's">' +
          '<div class="dash-topbook-rank ' + rankClasses[i] + '">' + (i + 1) + '</div>' +
          '<div class="dash-topbook-info"><div class="dash-topbook-title">' + b.title + '</div>' +
          '<div class="dash-topbook-author">' + b.author + '</div></div>' +
          '<div class="dash-topbook-count">' + b.count + ' borrows</div></div>';
      }).join("");
    }
  });
}

// ============ DASHBOARD: RECENT ACTIVITIES ============
function renderDashRecentActivities() {
  apiGet("/activity").then(function(res) {
    var logs = Array.isArray(res) ? res : (res.data || []);
    var el = document.getElementById("dash-recent-activities");
    if (!el) return;
    if (!logs || !logs.length) { el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No activity yet</p>'; return; }
    var recent = logs.slice(0, 6);
    el.innerHTML = recent.map(function(log, i) {
      var type = "registered";
      var icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
      var action = (log.action || "").toLowerCase();
      if (action.indexOf("issue") > -1 || action.indexOf("borrow") > -1) { type = "issued"; icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>'; }
      else if (action.indexOf("return") > -1) { type = "returned"; icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'; }
      else if (action.indexOf("overdue") > -1 || action.indexOf("fine") > -1) { type = "overdue"; icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'; }
      return '<div class="dash-timeline-item" style="animation-delay:' + (i * 0.08) + 's">' +
        '<div class="dash-timeline-dot ' + type + '">' + icon + '</div>' +
        '<div class="dash-timeline-body"><div class="dash-timeline-title">' + (log.action || "Activity") + '</div>' +
        '<div class="dash-timeline-desc">' + (log.details || log.user || "") + '</div>' +
        '<div class="dash-timeline-time">' + formatDateTime(log.timestamp || log.createdAt) + '</div></div></div>';
    }).join("");
  }).catch(function() {
    var el = document.getElementById("dash-recent-activities");
    if (el) el.innerHTML = '<p style="color:var(--danger);text-align:center;padding:20px;">Could not load activities</p>';
  });
}

// ============ DASHBOARD: OVERDUE ============
function renderDashOverdue(txs) {
  var tb = document.getElementById("dash-overdue-body");
  if (!tb) return;
  var now = new Date();
  var overdue = (txs || []).filter(function(t) {
    return t.status === "issued" && new Date(t.dueDate) < now;
  });
  if (overdue.length === 0) {
    tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No overdue items \uD83C\uDF89</p></td></tr>';
    return;
  }
  tb.innerHTML = overdue.slice(0, 5).map(function(t) {
    var days = Math.ceil((now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24));
    var fine = days * 5;
    return '<tr><td>' + (t.bookTitle || "?") + '</td><td>' + (t.userName || "?") + '</td>' +
      '<td><span style="color:var(--danger);font-weight:600">' + days + ' days</span></td>' +
      '<td><span style="color:var(--danger);font-weight:600">\u20B9' + fine + '</span></td></tr>';
  }).join("");
}

// ============ RECOMMENDATIONS ============
function loadRecommendations() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/recommendations/" + encodeURIComponent(user.name)).then(function (books) {
    var grid = document.getElementById("recommendations-grid");
    if (!grid) return;
    if (books.length === 0) { grid.innerHTML = '<p style="color:var(--text-muted)">No recommendations yet. Borrow some books first!</p>'; return; }
    grid.innerHTML = books.map(function (b) {
      var bid = b._id || b.id;
      return '<div class="rec-card" onclick="openBookDetail(\'' + bid + '\')">' +
        '<div class="rec-title">' + b.title + "</div>" +
        '<div class="rec-author">' + b.author + "</div>" +
        '<span class="rec-category">' + b.category + "</span></div>";
    }).join("");
  }).catch(function() {
    var grid = document.getElementById("recommendations-grid");
    if (grid) grid.innerHTML = '<p style="color:var(--danger)">Could not load recommendations</p>';
  });
}

// ============ GAMIFICATION ============
function renderGamificationStats() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/features/gamification/user/" + encodeURIComponent(user.email)).then(function (data) {
    var ptsEl = document.getElementById("gami-points");
    var strkEl = document.getElementById("gami-streak");
    var rankEl = document.getElementById("gami-rank");
    if (ptsEl) ptsEl.textContent = data.points || 0;
    if (strkEl) strkEl.textContent = (data.readingStreak || 0) + "\uD83D\uDD25";
    if (rankEl) {
      rankEl.textContent = data.rank || "Novice";
      var rankColors = { Novice: "#a4b0be", Bookworm: "#f59e0b", Scholar: "#2ed573", Grandmaster: "#8854d0" };
      rankEl.style.color = rankColors[data.rank] || "#2ed573";
    }
  }).catch(function() { console.warn("[BookSphere] Could not load gamification stats"); });
}

function renderLeaderboard() {
  apiGet("/features/gamification/leaderboard").then(function (leaders) {
    var tb = document.getElementById("leaderboard-body");
    if (!tb) return;
    if (!leaders || leaders.length === 0) {
      tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No readers yet. Be the first! \uD83D\uDE80</p></td></tr>';
      return;
    }
    var medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
    tb.innerHTML = leaders.map(function (u, i) {
      var rankLabel = i < 3 ? medals[i] : "#" + (i + 1);
      return '<tr><td style="font-size:1.3rem">' + rankLabel + '</td><td>' + (u.name || "Unknown") + '</td><td style="font-weight:700;color:var(--accent)">' + (u.points || 0) + '</td><td>' + (u.readingStreak || 0) + '\uD83D\uDD25</td></tr>';
    }).join("");
  }).catch(function() {
    var tb = document.getElementById("leaderboard-body");
    if (tb) tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>Could not load leaderboard</p></td></tr>';
  });
}

// ============ BOOKS ============
function addBook(e) {
  e.preventDefault(); if (!isAdmin()) return;
  var data = {
    title: document.getElementById("book-title").value.trim(),
    author: document.getElementById("book-author").value.trim(),
    category: document.getElementById("book-category").value.trim(),
    department: (document.getElementById("book-department") || {}).value || "",
    branch: (document.getElementById("book-branch") || {}).value || "",
    quantity: parseInt(document.getElementById("book-quantity").value),
    isbn: (document.getElementById("book-isbn") || {}).value || "",
    publisher: (document.getElementById("book-publisher") || {}).value || "",
    year: (document.getElementById("book-year") || {}).value || "",
    description: (document.getElementById("book-description") || {}).value || ""
  };
  apiPost("/books", data).then(function (d) {
    if (d.success) { document.getElementById("add-book-form").reset(); renderBooks(); showToast('"' + data.title + '" added!', "success"); updateDashboardStats(); }
    else showToast(d.message || "Error.", "error");
  });
}

function handleBulkUpload(event) {
  if (!isAdmin()) return;
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    var text = e.target.result;
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
    if (lines.length < 2) {
      showToast("CSV file is empty or missing headers.", "error");
      return;
    }
    
    // Simple CSV parser (assuming no commas inside quotes for simplicity, or use simple split)
    var headers = lines[0].toLowerCase().split(",").map(function(h) { return h.trim(); });
    var books = [];
    
    for (var i = 1; i < lines.length; i++) {
      // Split by comma, respecting quotes
      var row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      row = row.map(function(val) { return val ? val.replace(/^"|"$/g, '').trim() : ""; });
      
      var bookData = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        if (key === "school") key = "department";
        bookData[key] = row[j] || "";
      }
      
      if (bookData.title && bookData.author && bookData.quantity) {
        books.push(bookData);
      }
    }
    
    if (books.length === 0) {
      showToast("No valid books found in CSV.", "error");
      return;
    }

    showToast("Uploading " + books.length + " books...", "info");
    apiPost("/books/bulk", { books: books }).then(function(d) {
      if (d.success) {
        showToast(d.message, "success");
        renderBooks();
        updateDashboardStats();
      } else {
        showToast(d.message || "Error uploading books.", "error");
      }
    }).catch(function() {
      showToast("Failed to connect to server.", "error");
    });
  };
  reader.readAsText(file);
  // Reset input so the same file can be uploaded again if needed
  event.target.value = "";
}

function autoFetchBook() {
  var isbn = document.getElementById("book-isbn").value.trim();
  if (!isbn) { showToast("Please enter an ISBN first", "error"); return; }
  showToast("Fetching book details...", "info");
  apiGet("/books/auto-fetch/" + isbn).then(function(d) {
    if (d.success) {
      document.getElementById("book-title").value = d.data.title;
      document.getElementById("book-author").value = d.data.author;
      document.getElementById("book-publisher").value = d.data.publisher;
      document.getElementById("book-year").value = d.data.year;
      document.getElementById("book-description").value = d.data.description;
      document.getElementById("book-category").value = d.data.category;
      showToast("Book details auto-filled!", "success");
    } else {
      showToast(d.message || "Could not fetch details.", "error");
    }
  }).catch(function(e) {
    showToast("Error connecting to server.", "error");
  });
}

function renderBooks() {
  var search = (document.getElementById("book-search") || {}).value || "";
  search = search.toLowerCase();
  var admin = isAdmin(), user = getCurrentUser();

  var st = getPaginationState("books");
  var page = st.page;
  var limit = st.limit;
  
  var fDept = document.getElementById("filter-department");
  var fBranch = document.getElementById("filter-branch");
  var fCat = document.getElementById("filter-category");
  var fSort = document.getElementById("sort-books");

  if (fDept) {
    var currentDept = fDept.value;
    fDept.innerHTML = '<option value="">All Departments</option>' + DEPARTMENT_LIST.map(function(d){ return '<option value="' + d + '">' + d + '</option>' }).join("");
    fDept.value = currentDept;
  }
  if (fBranch) {
    var currentBranch = fBranch.value;
    fBranch.innerHTML = '<option value="">All Branches</option>' + BRANCH_LIST.map(function(b){ return '<option value="' + b + '">' + b + '</option>' }).join("");
    fBranch.value = currentBranch;
  }

  var fDeptVal = fDept ? fDept.value : "";
  var fBranchVal = fBranch ? fBranch.value : "";
  var fCatVal = fCat ? fCat.value : "";
  var sortVal = fSort ? fSort.value : "";

  var query = "?page=" + page + "&limit=" + limit;
  if (search) query += "&search=" + encodeURIComponent(search);
  if (fDeptVal) query += "&department=" + encodeURIComponent(fDeptVal);
  if (fBranchVal) query += "&branch=" + encodeURIComponent(fBranchVal);
  if (fCatVal) query += "&category=" + encodeURIComponent(fCatVal);
  if (sortVal) query += "&sort=" + encodeURIComponent(sortVal);

  apiGet("/books" + query).then(function (res) {
    var books = res.data || [];
    setPaginationState("books", res.pagination || {});
    renderPaginationBar("books", "books-pagination", "goToBooksPage", "changeBooksLimit");

    // Dynamically populate category filter from cached allCategories
    if (fCat && (!window.allCategories || window.allCategories.length === 0)) {
      apiGet("/books?paginate=false").then(function(allBooks) {
        var categories = [];
        allBooks.forEach(function(b) {
          if (b.category && categories.indexOf(b.category) === -1) categories.push(b.category);
        });
        categories.sort();
        window.allCategories = categories;
        var currentCat = fCat.value;
        fCat.innerHTML = '<option value="">All Categories</option>' + categories.map(function(c){ return '<option value="' + c + '">' + c + '</option>' }).join("");
        fCat.value = currentCat;
      });
    } else if (fCat) {
      var currentCat = fCat.value;
      fCat.innerHTML = '<option value="">All Categories</option>' + (window.allCategories || []).map(function(c){ return '<option value="' + c + '">' + c + '</option>' }).join("");
      fCat.value = currentCat;
    }

    var tbody = document.getElementById("books-table-body");
    if (books.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><p>No books found.</p></td></tr>'; return; }

    var reqEndpoint = isAdmin() ? "/requests" : "/requests/my";
    Promise.all([apiGet(reqEndpoint)]).then(function (results) {
      var requests = Array.isArray(results[0]) ? results[0] : (results[0].data || []);
      tbody.innerHTML = books.map(function (b) {
        var bid = b._id || b.id;
        var status = b.availableCopies > 0 ? '<span class="badge badge-success">Available (' + b.availableCopies + ")</span>" : '<span class="badge badge-danger">All Issued</span>';
        var actions = "";
        if (admin) {
          actions = '<td class="actions-cell">' +
            '<button class="btn btn-primary btn-sm" onclick="openBookDetail(\'' + bid + "')\">" + "View</button> " +
            '<button class="btn btn-sm" style="background:var(--warning-bg);color:var(--warning);border:1px solid rgba(245,158,11,0.2)" onclick="openEditBook(\'' + bid + "')\">" + "Edit</button> " +
            '<button class="btn btn-danger btn-sm" onclick="deleteBook(\'' + bid + "')\">" + "Delete</button></td>";
        } else {
          var requested = requests.some(function (r) { return r.bookId === bid && r.userName === user.name && r.status === "pending"; });
          if (requested) actions = '<td><span class="badge badge-warning">Requested</span></td>';
          else if (b.availableCopies > 0) {
            actions = '<td class="actions-cell">' +
              '<button class="btn btn-primary btn-sm" onclick="openBookDetail(\'' + bid + "')\">" + "View</button> " +
              '<button class="btn btn-sm" style="background:var(--warning-bg);color:var(--warning);border:1px solid rgba(245,158,11,0.2)" onclick="requestBook(\'' + bid + "')\">" + "Request</button> " +
              '<button class="btn btn-sm" style="background:rgba(139,92,246,0.1);color:#a78bfa;border:1px solid rgba(139,92,246,0.2)" onclick="reserveBook(\'' + bid + "')\">" + "📋 Reserve</button> " +
              '<button class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)" onclick="addToWishlist(\'' + bid + "')\">" + "♥ Save</button></td>";
          } else {
            actions = '<td class="actions-cell">' +
              '<button class="btn btn-primary btn-sm" onclick="openBookDetail(\'' + bid + "')\">" + "View</button> " +
              '<button class="btn btn-sm" style="background:rgba(59,130,246,0.1);color:#60a5fa;border:1px solid rgba(59,130,246,0.2)" onclick="showBorrowers(\'' + bid + '\',\'' + b.title.replace(/'/g, "\\'") + '\')">Contact Borrower</button> ' +
              '<button class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)" onclick="addToWishlist(\'' + bid + "')\">" + "♥ Save</button></td>";
          }
        }
        return '<tr><td style="color:var(--text-primary);font-weight:500;cursor:pointer" onclick="openBookDetail(\'' + bid + '\')">' + b.title + "</td><td>" + b.author + "</td><td>" + b.category + "</td><td>" + (b.department || "-") + "</td><td>" + (b.branch || "-") + "</td><td>" + b.totalCopies + "</td><td>" + b.availableCopies + "</td><td>--</td><td>" + status + "</td>" + actions + "</tr>";
      }).join("");
    });
  });
}


function deleteBook(id) { if (!isAdmin()) return; if (!confirm("Are you sure you want to delete this book?")) return; apiDelete("/books/" + id).then(function (d) { if (d.success) { renderBooks(); showToast("Deleted.", "info"); } else showToast(d.message, "error"); }); }

// ============ BOOK DETAIL MODAL ============
function openBookDetail(bookId) {
  apiGet("/books/" + bookId).then(function (b) {
    var user = getCurrentUser();
    var modal = document.getElementById("bookDetailModal");
    var content = document.getElementById("bookDetailContent");

    var reviewsHtml = "";
    if (b.reviews && b.reviews.length > 0) {
      reviewsHtml = b.reviews.map(function (r) {
        return '<div class="review-item"><div class="review-user">' + r.userName + " " + renderStars(r.rating) + '</div>' +
          (r.comment ? '<div class="review-comment">' + r.comment + "</div>" : "") +
          '<div class="review-date">' + formatDateTime(r.createdAt) + "</div></div>";
      }).join("");
    } else {
      reviewsHtml = '<p style="color:var(--text-muted);padding:12px 0">No reviews yet. Be the first to review!</p>';
    }

    var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent(b.isbn || bid);

    content.innerHTML =
      '<button class="modal-close" onclick="closeModal(\'bookDetailModal\')">&times;</button>' +
      '<div class="book-detail-info">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
        '<div>' +
        '<h2>' + b.title + "</h2>" +
        '<div class="book-detail-meta">' +
          '<span class="meta-tag">👤 ' + b.author + '</span>' +
          '<span class="meta-tag">📂 ' + b.category + '</span>' +
          (b.isbn ? '<span class="meta-tag">ISBN: ' + b.isbn + '</span>' : '') +
          (b.publisher ? '<span class="meta-tag">📖 ' + b.publisher + '</span>' : '') +
          (b.year ? '<span class="meta-tag">📅 ' + b.year + '</span>' : '') +
          '<span class="meta-tag">📊 ' + b.totalIssues + ' times issued</span>' +
        '</div>' +
        '</div>' +
        '<div><img src="' + qrUrl + '" alt="QR Code" style="border-radius:8px; border:3px solid var(--glass-border); background:#fff; width:100px; height:100px; padding:4px;"></div>' +
        '</div>' +
        '<div class="rating-display"><span class="rating-value">' + (b.avgRating || 0) + '</span> ' + renderStars(Math.round(b.avgRating || 0)) + ' (' + (b.reviews ? b.reviews.length : 0) + ' reviews)</div>' +
        (b.description ? '<p class="book-detail-desc">' + b.description + '</p>' : '') +
        '<p style="margin:12px 0"><strong>Available:</strong> ' + b.availableCopies + ' / ' + b.totalCopies + '</p>' +
      '</div>' +
      (user && user.role === "student" ? '<div style="margin:20px 0;padding:16px;background:rgba(255,255,255,0.03);border-radius:10px"><h3 style="margin-bottom:10px;font-size:1rem">Rate this book</h3><div id="rating-stars">' + renderStars(0, true, bookId) + '</div><input type="text" id="review-comment" placeholder="Write a comment (optional)" style="width:100%;margin-top:10px;padding:10px;border-radius:8px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);color:var(--text-primary);font-family:Inter,sans-serif"><button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="submitReview(\'' + bookId + '\')">Submit Review</button></div>' : '') +
      '<h3 style="margin-top:20px;margin-bottom:12px">Reviews</h3>' + reviewsHtml;

    modal.style.display = "flex";
  });
}
function closeModal(id) { document.getElementById(id).style.display = "none"; }
function hoverStars(el, rating) { var stars = el.parentNode.children; for (var i = 0; i < stars.length; i++) stars[i].classList.toggle("filled", i < rating); }
function unhoverStars(el, rating) { var stars = el.parentNode.children; for (var i = 0; i < stars.length; i++) stars[i].classList.toggle("filled", i < rating); }

// ============ CONTACT BORROWERS MODAL ============
function showBorrowers(bookId, bookTitle) {
  apiGet("/books/" + bookId + "/borrowers").then(function (d) {
    var modal = document.getElementById("borrowersModal");
    var content = document.getElementById("borrowersContent");
    var listHtml = "";

    if (!d.borrowers || d.borrowers.length === 0) {
      listHtml = '<p style="color:var(--text-muted);padding:12px 0">No active borrowers found. Maybe it is lost or in transit.</p>';
    } else {
      listHtml = d.borrowers.map(function(b) {
        var dueStr = b.dueDate ? new Date(b.dueDate).toLocaleDateString("en-IN") : "Unknown";
        return '<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; margin-bottom:8px; border:1px solid var(--glass-border);">' +
          '<div><strong style="color:#fff; font-size:1.05rem;">User ID: ' + b.userName + '</strong>' +
          '<div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Due back by: ' + dueStr + '</div></div>' +
          '<button class="btn btn-primary btn-sm" onclick="selectBorrowerForExchange(\'' + b.userName.replace(/'/g, "\\'") + '\', \'' + bookTitle.replace(/'/g, "\\'") + '\'); closeModal(\'borrowersModal\'); switchSection(\'section-exchange\')">Request Exchange</button></div>';
      }).join("");
    }

    content.innerHTML = 
      '<button class="modal-close" onclick="closeModal(\'borrowersModal\')">&times;</button>' +
      '<h2 style="margin-bottom:15px; font-size:1.3rem;">Borrowers of "' + bookTitle + '"</h2>' +
      '<p style="color:var(--text-muted); margin-bottom:15px; font-size:0.9rem;">The following users currently have this book. For privacy, contact details are hidden. Click "Request Exchange" to send them an in-app message.</p>' + 
      listHtml;
      
    modal.style.display = "flex";
  }).catch(function(err) {
    showToast("Error fetching borrowers", "error");
  });
}

var selectedRating = 0;
function submitRating(bookId, rating) { selectedRating = rating; }
function submitReview(bookId) {
  var user = getCurrentUser(); if (!user) return;
  if (selectedRating === 0) { showToast("Please select a rating.", "error"); return; }
  var comment = (document.getElementById("review-comment") || {}).value || "";
  apiPost("/reviews", { bookId: bookId, userName: user.name, userEmail: user.email, rating: selectedRating, comment: comment }).then(function (d) {
    if (d.success) { showToast("Review submitted!", "success"); selectedRating = 0; openBookDetail(bookId); }
    else showToast(d.message || "Error.", "error");
  });
}

// ============ EDIT BOOK MODAL ============
function openEditBook(bookId) {
  apiGet("/books/" + bookId).then(function (b) {
    var modal = document.getElementById("editBookModal");
    var content = document.getElementById("editBookContent");
    var bid = b._id || b.id;
    content.innerHTML =
      '<button class="modal-close" onclick="closeModal(\'editBookModal\')">&times;</button>' +
      '<h2>Edit Book</h2>' +
      '<form onsubmit="saveEditBook(event,\'' + bid + '\')">' +
        '<div class="form-grid">' +
          '<div class="form-group"><label>Title</label><input type="text" id="edit-title" value="' + (b.title || "") + '" required></div>' +
          '<div class="form-group"><label>Author</label><input type="text" id="edit-author" value="' + (b.author || "") + '" required></div>' +
          '<div class="form-group"><label>Category</label><input type="text" id="edit-category" value="' + (b.category || "") + '" required></div>' +
          '<div class="form-group"><label>Department</label><select id="edit-department">' +
            '<option value="">Select Department</option>' +
            DEPARTMENT_LIST.map(function(s) { return '<option value="' + s + '"' + (b.department === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Branch</label><select id="edit-branch">' +
            '<option value="">Select Branch</option>' +
            BRANCH_LIST.map(function(br) { return '<option value="' + br + '"' + (b.branch === br ? ' selected' : '') + '>' + br + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="form-group"><label>Quantity</label><input type="number" id="edit-quantity" value="' + (b.totalCopies || 1) + '" min="1" required></div>' +
          '<div class="form-group"><label>ISBN</label><input type="text" id="edit-isbn" value="' + (b.isbn || "") + '"></div>' +
          '<div class="form-group"><label>Publisher</label><input type="text" id="edit-publisher" value="' + (b.publisher || "") + '"></div>' +
          '<div class="form-group"><label>Year</label><input type="number" id="edit-year" value="' + (b.year || "") + '"></div>' +
          '<div class="form-group"><label>Description</label><input type="text" id="edit-description" value="' + (b.description || "") + '"></div>' +
          '<div class="form-group"><label>&nbsp;</label><button type="submit" class="btn btn-primary">Save Changes</button></div>' +
        '</div>' +
      '</form>';
    modal.style.display = "flex";
  });
}
function saveEditBook(e, bookId) {
  e.preventDefault();
  apiPut("/books/" + bookId, {
    title: document.getElementById("edit-title").value, author: document.getElementById("edit-author").value,
    category: document.getElementById("edit-category").value, quantity: document.getElementById("edit-quantity").value,
    department: document.getElementById("edit-department").value, branch: document.getElementById("edit-branch").value,
    isbn: document.getElementById("edit-isbn").value, publisher: document.getElementById("edit-publisher").value,
    year: document.getElementById("edit-year").value, description: document.getElementById("edit-description").value
  }).then(function (d) {
    if (d.success) { closeModal("editBookModal"); renderBooks(); showToast("Book updated!", "success"); }
    else showToast(d.message || "Error.", "error");
  });
}

// ============ WISHLIST ============
function addToWishlist(bookId) {
  var user = getCurrentUser(); if (!user) return;
  apiPost("/wishlist", { bookId: bookId, userName: user.name, userEmail: user.email }).then(function (d) {
    if (d.success) showToast("Added to wishlist ♥", "success");
    else showToast(d.message || "Error.", "error");
  });
}
function renderWishlist() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/wishlist/" + encodeURIComponent(user.email)).then(function (items) {
    var tb = document.getElementById("wishlist-table-body");
    if (items.length === 0) { tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>Your wishlist is empty.</p></td></tr>'; return; }
    tb.innerHTML = items.map(function (w) {
      var avail = w.availableCopies > 0 ? '<span class="badge badge-success">Available</span>' : '<span class="badge badge-danger">Unavailable</span>';
      return "<tr><td>" + w.bookTitle + "</td><td>" + w.bookAuthor + "</td><td>" + avail + "</td>" +
        '<td class="actions-cell">' + (w.availableCopies > 0 ? '<button class="btn btn-primary btn-sm" onclick="requestBook(\'' + w.bookId + "')\">" + "Request</button> " : "") +
        '<button class="btn btn-danger btn-sm" onclick="removeFromWishlist(\'' + (w._id || w.id) + "')\">" + "Remove</button></td></tr>";
    }).join("");
  });
}
function removeFromWishlist(id) { if (!confirm("Remove this book from your wishlist?")) return; apiDelete("/wishlist/" + id).then(function () { renderWishlist(); showToast("Removed from wishlist.", "info"); }); }

// ============ BORROWING HISTORY ============
function renderBorrowingHistory() {
  var user = getCurrentUser(); if (!user) return;
  var st = getPaginationState("history");
  var page = st.page;
  var limit = st.limit;
  apiGet("/transactions/history/" + encodeURIComponent(user.name) + "?page=" + page + "&limit=" + limit).then(function (res) {
    var txs = res.data || [];
    setPaginationState("history", res.pagination || {});
    renderPaginationBar("history", "history-pagination", "goToHistoryPage", "changeHistoryLimit");

    var tb = document.getElementById("history-table-body");
    if (txs.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No borrowing history yet.</p></td></tr>'; return; }
    tb.innerHTML = txs.map(function (t) {
      var status = t.status === "issued" ? (new Date() > new Date(t.dueDate) ? '<span class="badge badge-danger">Overdue</span>' : '<span class="badge badge-warning">Issued</span>') : '<span class="badge badge-success">Returned</span>';
      var fine = t.fine > 0 ? '<span style="color:var(--danger);font-weight:700">\u20B9' + t.fine + "</span>" : '<span style="color:var(--text-muted)">\u20B90</span>';
      return "<tr><td>" + t.bookTitle + "</td><td>" + formatDate(t.issueDate) + "</td><td>" + formatDate(t.dueDate) + "</td><td>" + formatDate(t.returnDate) + "</td><td>" + status + "</td><td>" + fine + "</td></tr>";
    }).join("");
  });
}

function renderMyFines() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/transactions/history/" + encodeURIComponent(user.name) + "?limit=1000").then(function (res) {
    var txs = Array.isArray(res) ? res : (res.data || []);
    var fineTxs = Array.isArray(txs) ? txs.filter(function(t) { return t.fine > 0 || t.damageFine > 0 || t.totalFine > 0; }) : [];
    
    var tb = document.getElementById("my-fines-table-body");
    
    if (fineTxs.length === 0) { 
      if(tb) tb.innerHTML = '<tr><td colspan="7" class="empty-state"><p>You have no fines! 🎉</p></td></tr>'; 
      var fTot = document.getElementById("my-fine-total"); if(fTot) fTot.textContent = "₹0";
      var fPaid = document.getElementById("my-fine-paid"); if(fPaid) fPaid.textContent = "₹0";
      var fUnpd = document.getElementById("my-fine-unpaid"); if(fUnpd) fUnpd.textContent = "₹0";
      return; 
    }
    
    var grandTotal = 0;
    var totalPaid = 0;
    
    if(tb) tb.innerHTML = fineTxs.map(function (t) {
      var overdueFine = t.overdueFine || t.fine || 0;
      var damageFine = t.damageFine || 0;
      var totalFine = t.totalFine || (overdueFine + damageFine);
      
      grandTotal += totalFine;
      var isPaid = t.finePaid || t.fineStatus === "paid";
      if (isPaid) { totalPaid += totalFine; }
      
      var statusBadge = isPaid ? '<span class="badge badge-success">Paid</span>' : '<span class="badge badge-danger">Unpaid</span>';
      var actionBtn = isPaid ? '<span style="color:var(--text-muted)">--</span>' : '<button class="btn btn-primary btn-sm" onclick="payFineOnline(\'' + (t._id || t.id) + '\', ' + totalFine + ')">Pay Now</button>';
      
      return "<tr><td>" + t.bookTitle + "</td><td>₹" + overdueFine + "</td><td>₹" + damageFine + "</td><td><strong>₹" + totalFine + "</strong></td><td>" + statusBadge + "</td><td>" + (t.paymentMethod || "-") + "</td><td>" + actionBtn + "</td></tr>";
    }).join("");
    
    var fTot2 = document.getElementById("my-fine-total"); if(fTot2) fTot2.textContent = "₹" + grandTotal;
    var fPaid2 = document.getElementById("my-fine-paid"); if(fPaid2) fPaid2.textContent = "₹" + totalPaid;
    var fUnpd2 = document.getElementById("my-fine-unpaid"); if(fUnpd2) fUnpd2.textContent = "₹" + (grandTotal - totalPaid);
  });
}

// ============ NOTIFICATIONS ============
function renderNotifications() {
  var user = getCurrentUser(); if (!user) return;
  var st = getPaginationState("notifications");
  var page = st.page;
  var limit = st.limit;
  apiGet("/notifications/" + encodeURIComponent(user.email) + "?page=" + page + "&limit=" + limit).then(function (res) {
    var notifs = res.data || [];
    setPaginationState("notifications", res.pagination || {});
    renderPaginationBar("notifications", "notifications-pagination", "goToNotificationsPage", "changeNotificationsLimit");

    var container = document.getElementById("notifications-list");
    if (notifs.length === 0) { container.innerHTML = '<p class="empty-state">No notifications.</p>'; return; }
    container.innerHTML = notifs.map(function (n) {
      return '<div class="notif-item ' + (n.read ? "" : "unread") + '" onclick="markNotifRead(\'' + (n._id || n.id) + '\')">' +
        '<span class="notif-dot"></span><div><div class="notif-message">' + n.message + '</div><div class="notif-time">' + formatDateTime(n.createdAt) + "</div></div></div>";
    }).join("");
  });
}
function markNotifRead(id) { apiPut("/notifications/" + id + "/read").then(function () { renderNotifications(); loadStudentNotifCount(); }); }
function markAllNotificationsRead() {
  var user = getCurrentUser(); if (!user) return;
  apiPut("/notifications/read-all/" + encodeURIComponent(user.email)).then(function () { renderNotifications(); loadStudentNotifCount(); showToast("All marked as read.", "info"); });
}

// ============ ADVANCED ANALYTICS DASHBOARD ============
var _analyticsCharts = {};

function _destroyAnalyticsChart(key) {
  if (_analyticsCharts[key]) { _analyticsCharts[key].destroy(); _analyticsCharts[key] = null; }
}

function _analyticsChartColors() {
  var isLight = document.body.classList.contains("light-mode");
  return {
    text: isLight ? "rgba(30,30,30,0.7)" : "rgba(255,255,255,0.65)",
    grid: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
    tooltip: isLight ? "rgba(30,30,30,0.9)" : "rgba(0,0,0,0.85)"
  };
}

function renderAnalyticsDashboard() {
  if (!isAdmin()) return;
  var kpiGrid = document.getElementById("analytics-kpi-grid");
  if (kpiGrid) kpiGrid.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-secondary);width:100%;"><span class="loader"></span> Loading analytics…</div>';

  apiGet("/analytics").then(function (res) {
    if (!res.success) { showToast("Failed to load analytics: " + (res.message || "Unknown error"), "error"); return; }
    var d = res;
    var s = d.summary;

    // ---- KPI Cards ----
    if (kpiGrid) {
      kpiGrid.innerHTML =
        _kpiCard("📚", "Total Books", s.totalBooks, "var(--info)") +
        _kpiCard("📖", "Total Copies", s.totalCopies, "#6366f1") +
        _kpiCard("✅", "Available", s.availableCopies, "var(--success)") +
        _kpiCard("📤", "Issued", s.issuedBooks, "var(--warning)") +
        _kpiCard("👥", "Total Users", s.totalUsers, "#3b82f6") +
        _kpiCard("🎓", "Students", s.students, "#8b5cf6") +
        _kpiCard("🧑‍🏫", "Teachers", s.teachers, "#14b8a6") +
        _kpiCard("🛡️", "Admins", s.admins, "#f97316") +
        _kpiCard("📋", "Reservations", s.activeReservations, "#ec4899") +
        _kpiCard("🔄", "Exchanges", s.activeExchanges, "#06b6d4") +
        _kpiCard("💰", "Total Fines", "₹" + s.totalFines, "var(--danger)") +
        _kpiCard("✔️", "Collected", "₹" + s.collectedFines, "#10b981") +
        _kpiCard("⏳", "Unpaid", "₹" + s.unpaidFines, "#ef4444") +
        _kpiCard("⚠️", "Overdue", s.totalOverdue, "#e11d48");
    }

    var clr = _analyticsChartColors();

    // ---- Monthly Trend Chart (Line) ----
    (function () {
      var canvas = document.getElementById("chart-analytics-monthly");
      if (!canvas || typeof Chart === "undefined") return;
      _destroyAnalyticsChart("monthly");
      var labels = d.monthlyAnalytics.map(function (m) { return m.label; });
      _analyticsCharts.monthly = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            { label: "Issues", data: d.monthlyAnalytics.map(function (m) { return m.issues; }), borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.12)", fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 },
            { label: "Returns", data: d.monthlyAnalytics.map(function (m) { return m.returns; }), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.10)", fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 },
            { label: "New Users", data: d.monthlyAnalytics.map(function (m) { return m.newUsers; }), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.10)", fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "top", labels: { color: clr.text, padding: 16, usePointStyle: true, pointStyle: "circle", font: { size: 12 } } },
            tooltip: { backgroundColor: clr.tooltip, titleColor: "#fff", bodyColor: "#fff", cornerRadius: 10, padding: 12 }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: clr.text, stepSize: 1 }, grid: { color: clr.grid } },
            x: { ticks: { color: clr.text }, grid: { display: false } }
          }
        }
      });
    })();

    // ---- Category Distribution (Doughnut) ----
    (function () {
      var canvas = document.getElementById("chart-analytics-category");
      if (!canvas || typeof Chart === "undefined") return;
      _destroyAnalyticsChart("category");
      var cats = d.categoryStats.booksPerCategory;
      var palette = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#f97316','#06b6d4','#84cc16','#e11d48','#a855f7','#22d3ee','#eab308'];
      _analyticsCharts.category = new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: cats.map(function (c) { return c.category || "Uncategorized"; }),
          datasets: [{ data: cats.map(function (c) { return c.count; }), backgroundColor: cats.map(function (_, i) { return palette[i % palette.length]; }), borderWidth: 0, hoverOffset: 10 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "58%",
          plugins: {
            legend: { position: "right", labels: { color: clr.text, padding: 10, boxWidth: 12, font: { size: 11 } } },
            tooltip: { backgroundColor: clr.tooltip, titleColor: "#fff", bodyColor: "#fff", cornerRadius: 10, padding: 12 }
          }
        }
      });
    })();

    // ---- Popular Books (Horizontal Bar) ----
    (function () {
      var canvas = document.getElementById("chart-analytics-popular");
      if (!canvas || typeof Chart === "undefined") return;
      _destroyAnalyticsChart("popular");
      var books = d.popularBooks;
      var gradient = ['#6366f1','#818cf8','#a5b4fc','#c7d2fe','#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#14b8a6','#5eead4'];
      _analyticsCharts.popular = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
          labels: books.map(function (b) { return b.title.length > 22 ? b.title.substring(0, 22) + "…" : b.title; }),
          datasets: [{ label: "Borrows", data: books.map(function (b) { return b.borrowCount; }), backgroundColor: books.map(function (_, i) { return gradient[i % gradient.length]; }), borderRadius: 6, borderSkipped: false, barPercentage: 0.7 }]
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: clr.tooltip, titleColor: "#fff", bodyColor: "#fff", cornerRadius: 10, padding: 12 }
          },
          scales: {
            x: { beginAtZero: true, ticks: { color: clr.text, stepSize: 1 }, grid: { color: clr.grid } },
            y: { ticks: { color: clr.text, font: { size: 11 } }, grid: { display: false } }
          }
        }
      });
    })();

    // ---- Leaderboard (Horizontal Bar) ----
    (function () {
      var canvas = document.getElementById("chart-analytics-leaderboard");
      if (!canvas || typeof Chart === "undefined") return;
      _destroyAnalyticsChart("leaderboard");
      var users = d.userAnalytics.leaderboardUsers;
      var medals = ['#fbbf24','#9ca3af','#cd7f32','#6366f1','#3b82f6','#8b5cf6','#14b8a6','#ec4899','#f97316','#06b6d4'];
      _analyticsCharts.leaderboard = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
          labels: users.map(function (u) { return u.name || u.email || "User"; }),
          datasets: [{ label: "Points", data: users.map(function (u) { return u.points || 0; }), backgroundColor: users.map(function (_, i) { return medals[i % medals.length]; }), borderRadius: 6, borderSkipped: false, barPercentage: 0.7 }]
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: clr.tooltip, titleColor: "#fff", bodyColor: "#fff", cornerRadius: 10, padding: 12,
              callbacks: { afterLabel: function (ctx) { var u = users[ctx.dataIndex]; return "Streak: " + (u.readingStreak || 0) + " days"; } }
            }
          },
          scales: {
            x: { beginAtZero: true, ticks: { color: clr.text }, grid: { color: clr.grid } },
            y: { ticks: { color: clr.text, font: { size: 11 } }, grid: { display: false } }
          }
        }
      });
    })();

    // ---- Overdue Trend (Line) ----
    (function () {
      var canvas = document.getElementById("chart-analytics-overdue");
      if (!canvas || typeof Chart === "undefined") return;
      _destroyAnalyticsChart("overdue");
      var trend = d.overdueAnalytics.trend;
      _analyticsCharts.overdue = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
          labels: trend.map(function (t) { return t.label; }),
          datasets: [{ label: "Overdue Books", data: trend.map(function (t) { return t.count; }), borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.13)", fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: "#ef4444", pointHoverRadius: 8, borderWidth: 2.5 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: "top", labels: { color: clr.text, usePointStyle: true, pointStyle: "circle", font: { size: 12 } } },
            tooltip: { backgroundColor: clr.tooltip, titleColor: "#fff", bodyColor: "#fff", cornerRadius: 10, padding: 12 }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: clr.text, stepSize: 1 }, grid: { color: clr.grid } },
            x: { ticks: { color: clr.text }, grid: { display: false } }
          }
        }
      });
    })();

    // ---- Active Readers Table ----
    (function () {
      var tb = document.getElementById("analytics-active-readers-body");
      if (!tb) return;
      var readers = d.userAnalytics.activeReaders;
      if (!readers || readers.length === 0) {
        tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No reader data found.</p></td></tr>';
        return;
      }
      var rankIcons = ["🥇", "🥈", "🥉"];
      tb.innerHTML = readers.map(function (r, i) {
        var rank = i < 3 ? rankIcons[i] : (i + 1);
        var roleBadge = '<span class="badge badge-' + r.userRole + '">' + r.userRole + '</span>';
        return '<tr><td>' + rank + '</td><td><strong>' + (r.userName || "Unknown") + '</strong></td><td>' + roleBadge + '</td><td><strong>' + r.count + '</strong></td></tr>';
      }).join("");
    })();

  }).catch(function (err) {
    console.error("Analytics load error:", err);
    showToast("Failed to load analytics dashboard.", "error");
  });
}

function _kpiCard(icon, label, value, color) {
  return '<div class="report-stat" style="border-left: 3px solid ' + color + ';">' +
    '<div style="font-size:1.6rem;margin-bottom:4px;">' + icon + '</div>' +
    '<div class="report-val" style="color:' + color + ';font-size:1.5rem;">' + value + '</div>' +
    '<div class="report-lbl">' + label + '</div>' +
  '</div>';
}

// ============ REPORTS & ANALYTICS ============
var _chartPopularBooks = null;
var _chartCategories = null;
var _chartPalette = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6',
  '#ec4899','#8b5cf6','#14b8a6','#f97316','#06b6d4',
  '#84cc16','#e11d48','#a855f7','#22d3ee','#eab308'
];

function renderReports() {
  if (!isAdmin()) return;
  apiGet("/reports/overview").then(function (d) {
    document.getElementById("report-overview-grid").innerHTML =
      reportCard(d.totalBooks, "Total Books", "var(--info)", "books") + 
      reportCard(d.totalUsers, "Users", "var(--success)", "users") +
      reportCard(d.activeIssues, "Active Issues", "var(--warning)", "issue-return") + 
      reportCard(d.totalReturns, "Returns", "#2ed573", "issue-return") +
      reportCard(d.overdueCount, "Overdue", "var(--danger)", "fines") + 
      reportCard("\u20B9" + d.totalFines, "Fines", "var(--danger)", "fines") +
      reportCard(d.pendingRequests, "Pending Req.", "#f59e0b", "requests") + 
      reportCard(d.totalReviews, "Reviews", "var(--info)", "books");
  });

  apiGet("/reports/popular-books").then(function (books) {
    var tb = document.getElementById("popular-books-body");
    if (books.length === 0) { tb.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No data</p></td></tr>'; return; }
    tb.innerHTML = books.map(function (b, i) { return "<tr><td>" + (i + 1) + "</td><td>" + b.title + "</td><td>" + b.author + "</td><td>" + b.category + "</td><td><strong>" + b.issueCount + "</strong></td></tr>"; }).join("");

    // --- Chart.js: Popular Books Bar Chart ---
    var canvas = document.getElementById("chart-popular-books");
    if (canvas && typeof Chart !== "undefined") {
      if (_chartPopularBooks) { _chartPopularBooks.destroy(); _chartPopularBooks = null; }
      var labels = books.slice(0, 10).map(function(b) { return b.title.length > 18 ? b.title.substring(0,18) + '…' : b.title; });
      var data = books.slice(0, 10).map(function(b) { return b.issueCount; });
      var colors = data.map(function(_, i) { return _chartPalette[i % _chartPalette.length]; });
      
      var isLight = document.body.classList.contains("light-mode");
      var textColor = isLight ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
      var gridColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";

      _chartPopularBooks = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "Times Issued", data: data, backgroundColor: colors, borderRadius: 6, borderSkipped: false }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(0,0,0,0.8)", titleColor: "#fff", bodyColor: "#fff", cornerRadius: 8 } },
          scales: {
            y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
            x: { ticks: { color: textColor, maxRotation: 45 }, grid: { display: false } }
          }
        }
      });
    }
  });

  apiGet("/reports/active-users").then(function (users) {
    var tb = document.getElementById("active-users-body");
    if (users.length === 0) { tb.innerHTML = '<tr><td colspan="3" class="empty-state"><p>No data</p></td></tr>'; return; }
    tb.innerHTML = users.map(function (u, i) { return "<tr><td>" + (i + 1) + "</td><td>" + u.userName + "</td><td><strong>" + u.borrowCount + "</strong></td></tr>"; }).join("");
  });

  apiGet("/reports/categories").then(function (cats) {
    var tb = document.getElementById("categories-body");
    if (cats.length === 0) { tb.innerHTML = '<tr><td colspan="3" class="empty-state"><p>No data</p></td></tr>'; return; }
    tb.innerHTML = cats.map(function (c) { return "<tr><td>" + c.category + "</td><td>" + c.bookCount + "</td><td>" + c.totalCopies + "</td></tr>"; }).join("");

    // --- Chart.js: Category Doughnut Chart ---
    var canvas = document.getElementById("chart-categories");
    if (canvas && typeof Chart !== "undefined") {
      if (_chartCategories) { _chartCategories.destroy(); _chartCategories = null; }
      var labels = cats.map(function(c) { return c.category; });
      var data = cats.map(function(c) { return c.bookCount; });
      var colors = cats.map(function(_, i) { return _chartPalette[i % _chartPalette.length]; });
      
      var isLight = document.body.classList.contains("light-mode");
      var legendColor = isLight ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)";

      _chartCategories = new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "55%",
          plugins: {
            legend: { position: "bottom", labels: { color: legendColor, padding: 12, boxWidth: 12, font: { size: 11 } } },
            tooltip: { backgroundColor: "rgba(0,0,0,0.8)", titleColor: "#fff", bodyColor: "#fff", cornerRadius: 8 }
          }
        }
      });
    }
  });
}
function reportCard(val, label, color, targetSection) {
  var onClickAttr = targetSection ? ' onclick="switchSection(\'' + targetSection + '\')" style="cursor:pointer;" title="Go to ' + label + '"' : '';
  return '<div class="report-stat"' + onClickAttr + '><div class="report-val" style="color:' + color + '">' + val + '</div><div class="report-lbl">' + label + "</div></div>";
}

// ============ FINE REPORT & ACTIVITY LOGS ============
function renderFineReport() {
  if (!isAdmin()) return;
  apiGet("/reports/fines").then(function (d) {
    document.getElementById("fine-grand-total").textContent = "\u20B9" + d.grandTotal;
    var paid = document.getElementById("fine-total-paid"); if (paid) paid.textContent = "\u20B9" + (d.totalPaid||0);
    var unpaid = document.getElementById("fine-total-unpaid"); if (unpaid) unpaid.textContent = "\u20B9" + (d.totalUnpaid||0);
    var tb = document.getElementById("fines-table-body");
    if (!d.records || d.records.length === 0) { tb.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No fines.</p></td></tr>'; return; }
    tb.innerHTML = d.records.map(function (r) {
      var statusBadge = r.fineStatus === "paid" ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-unpaid">Unpaid</span>';
      var action = r.fineStatus !== "paid" && r.txId ? '<button class="btn btn-success btn-sm" onclick="openPaymentModal(\'' + r.txId + "', " + r.totalFine + ')\'>Record Payment</button>' : "--";
      var notes = r.damageNotes ? r.damageNotes : "--";
      return "<tr><td>" + r.userName + "</td><td>" + r.bookTitle + "</td><td>" + formatDate(r.dueDate) + "</td><td>\u20B9" + (r.overdueFine||0) + "</td><td>\u20B9" + (r.damageFine||0) + "</td><td><strong style='color:var(--danger)'>\u20B9" + r.totalFine + "</strong></td><td>" + statusBadge + "</td><td>" + notes + "</td><td>" + action + "</td></tr>";
    }).join("");
  });
}

function renderActivityLogs() {
  if (!isAdmin()) return;
  var st = getPaginationState("activity");
  var page = st.page;
  var limit = st.limit;
  apiGet("/activity?page=" + page + "&limit=" + limit).then(function (res) {
    var logs = res.data || [];
    setPaginationState("activity", res.pagination || {});
    renderPaginationBar("activity", "activity-pagination", "goToActivityPage", "changeActivityLimit");

    var tb = document.getElementById("activity-table-body");
    if (!tb) return;
    if (logs.length === 0) { tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No activity recorded yet.</p></td></tr>'; return; }
    tb.innerHTML = logs.map(function (log) {
      return "<tr><td style='color:var(--text-muted)'>" + formatDateTime(log.createdAt) + "</td><td><strong>" + log.action + "</strong></td><td>" + log.performedBy + "</td><td style='color:var(--text-primary)'>" + log.details + "</td></tr>";
    }).join("");
  });
}

// ============ REQUESTS (keep existing) ============
function requestBook(bookId) {
  var user = getCurrentUser(); if (!user) return;
  apiPost("/requests", { bookId: bookId, userName: user.name, userEmail: user.email }).then(function (d) {
    if (d.success) { renderBooks(); showToast("Request sent!", "success"); } else showToast(d.message, "error");
  });
}
function reserveBook(bookId) {
  var user = getCurrentUser(); if (!user) return;
  apiPost("/reservations", { bookId: bookId, userName: user.name, userEmail: user.email }).then(function (d) {
    if (d.success) {
      renderBooks();
      if (typeof renderReservations === "function") renderReservations();
      showToast("Reserved! Please collect it within 24 hours.", "success");
    } else showToast(d.message, "error");
  });
}
function renderRequests() {
  if (!isAdmin()) return;
  apiGet("/requests").then(function (reqs) {
    var pending = reqs.filter(function (r) { return r.status === "pending"; });
    var approved = reqs.filter(function (r) { return r.status === "approved"; });
    var processed = reqs.filter(function (r) { return r.status === "issued" || r.status === "rejected" || r.status === "expired"; });
    var ptb = document.getElementById("requests-table-body");
    var htb = document.getElementById("requests-history-body");
    var activeRows = "";
    if (pending.length > 0) {
      activeRows += pending.map(function (r) {
        return '<tr><td style="color:var(--text-primary);font-weight:500">' + r.userName + "</td><td>" + r.bookTitle + "</td><td>" + formatDate(r.requestDate) + '</td><td><span class="badge badge-warning">Pending</span></td>' +
          '<td class="actions-cell"><button class="btn btn-success btn-sm" onclick="approveRequest(\'' + (r._id || r.id) + "')\">" + "Approve</button> " +
          '<button class="btn btn-danger btn-sm" onclick="rejectRequest(\'' + (r._id || r.id) + "')\">" + "Reject</button></td></tr>";
      }).join("");
    }
    if (approved.length > 0) {
      activeRows += approved.map(function (r) {
        return '<tr><td style="color:var(--text-primary);font-weight:500">' + r.userName + "</td><td>" + r.bookTitle + "</td><td>" + formatDate(r.requestDate) + '</td><td><span class="badge badge-success">Approved</span></td>' +
          '<td class="actions-cell"><button class="btn btn-sm" style="background:var(--accent);color:#fff;" onclick="issueRequest(\'' + (r._id || r.id) + "')\">" + "\ud83d\udcd6 Issue Book</button> " +
          '<button class="btn btn-danger btn-sm" onclick="rejectRequest(\'' + (r._id || r.id) + "')\">" + "Cancel</button></td></tr>";
      }).join("");
    }
    ptb.innerHTML = activeRows || '<tr><td colspan="5" class="empty-state"><p>No pending requests.</p></td></tr>';
    htb.innerHTML = processed.length === 0 ? '<tr><td colspan="4" class="empty-state"><p>No past requests.</p></td></tr>' :
      processed.map(function (r) {
        var badge = r.status === "issued" ? '<span class="badge badge-success">Issued</span>' : r.status === "expired" ? '<span class="badge badge-danger">Expired</span>' : '<span class="badge badge-danger">Rejected</span>';
        return "<tr><td>" + r.userName + "</td><td>" + r.bookTitle + "</td><td>" + formatDate(r.requestDate) + "</td><td>" + badge + "</td></tr>";
      }).join("");
  });
}
function approveRequest(id) { apiPut("/requests/" + id + "/approve").then(function (d) { if (d.success) { renderRequests(); updateDashboardStats(); renderBooks(); showToast("Approved! Waiting for student to collect.", "success"); } else showToast(d.message, "error"); }); }
function rejectRequest(id) { apiPut("/requests/" + id + "/reject").then(function (d) { if (d.success) { renderRequests(); updateDashboardStats(); renderBooks(); showToast("Rejected.", "info"); } else showToast(d.message, "error"); }); }
function issueRequest(id) { apiPut("/requests/" + id + "/issue").then(function (d) { if (d.success) { renderRequests(); renderTransactions(); updateDashboardStats(); renderBooks(); showToast("Book issued to " + d.userName + "!", "success"); } else showToast(d.message, "error"); }); }

function renderAdminExchanges() {
  if (!isAdmin()) return;
  var st = getPaginationState("admin-exchanges");
  var page = st.page;
  var limit = st.limit;
  apiGet("/exchanges?page=" + page + "&limit=" + limit).then(function (res) {
    var exchanges = res.data || [];
    setPaginationState("admin-exchanges", res.pagination || {});
    renderPaginationBar("admin-exchanges", "admin-exchanges-pagination", "goToAdminExchangesPage", "changeAdminExchangesLimit");

    var tb = document.getElementById("admin-exchanges-body");
    if (!tb) return;
    if (exchanges.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No exchanges.</p></td></tr>'; return; }
    tb.innerHTML = exchanges.map(function(e) {
      var badge = '<span class="badge badge-' + e.status + '">' + e.status + '</span>';
      var action = "--";
      if (e.status === "accepted") {
        action = '<button class="btn btn-success btn-sm" onclick="approveAdminExchange(\'' + e.id + '\')">Approve Transfer</button>';
      }
      return '<tr><td>' + e.fromUser + ' (wants it)</td><td>' + e.toUser + ' (has it)</td><td>' + e.bookTitle + '</td><td>' + (e.campusLocation || "--") + '</td><td>' + badge + '</td><td>' + action + '</td></tr>';
    }).join("");
  });
}

function approveAdminExchange(id) {
  apiPut("/exchanges/" + id + "/approve").then(function(d) {
    if (d.success) { showToast("Exchange approved! Students notified.", "success"); renderAdminExchanges(); }
    else showToast(d.message, "error");
  });
}

function renderMyRequests() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/requests/my").then(function (reqs) {
    var mine = Array.isArray(reqs) ? reqs : [];
    var tb = document.getElementById("my-requests-body");
    if (mine.length === 0) { tb.innerHTML = '<tr><td colspan="3" class="empty-state"><p>No requests yet.</p></td></tr>'; return; }
    tb.innerHTML = mine.map(function (r) {
      var badge = r.status === "pending" ? '<span class="badge badge-warning">Pending</span>' : r.status === "approved" ? '<span class="badge badge-success">Approved — Collect from Library</span>' : r.status === "issued" ? '<span class="badge badge-success">Issued</span>' : r.status === "expired" ? '<span class="badge badge-danger">Expired</span>' : '<span class="badge badge-danger">Rejected</span>';
      return '<tr><td style="color:var(--text-primary);font-weight:500">' + r.bookTitle + "</td><td>" + formatDate(r.requestDate) + "</td><td>" + badge + "</td></tr>";
    }).join("");
  });
}

// ============ USER MANAGEMENT ============
function addUser(e) {
  e.preventDefault(); if (!isAdmin()) return;
  apiPost("/users", { 
    name: document.getElementById("user-name").value.trim(), 
    email: document.getElementById("user-email").value.trim(),
    password: document.getElementById("user-password").value.trim()
  }).then(function (d) {
    if (d.success) { document.getElementById("add-user-form").reset(); renderUsers(); showToast("User and account created!", "success"); } else showToast(d.message, "error");
  });
}
function renderUsers() {
  if (!isAdmin()) return;
  
  if (isOwner()) {
    document.getElementById("pending-approvals-panel").style.display = "block";
    apiGet("/auth/accounts/pending").then(function(accounts) {
      var tb = document.getElementById("pending-accounts-body");
      if (!tb) return;
      if (!accounts.length) { tb.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No pending approvals.</p></td></tr>'; }
      else {
        tb.innerHTML = accounts.map(function(a) {
          return '<tr><td>' + a.name + '</td><td>' + a.email + '</td><td><span class="badge badge-warning">' + a.role + '</span></td><td>' + formatDate(a.createdAt) + '</td>' +
            '<td class="actions-cell">' +
              '<button class="btn btn-success btn-sm" onclick="approveAccount(\'' + a._id + '\')">Approve</button>' +
              '<button class="btn btn-danger btn-sm" onclick="rejectAccount(\'' + a._id + '\')">Reject</button>' +
            '</td></tr>';
        }).join("");
      }
    });
  }
  
  var st = getPaginationState("users");
  var page = st.page;
  var limit = st.limit;

  apiGet("/users?page=" + page + "&limit=" + limit).then(function (res) {
    var users = res.data || [];
    setPaginationState("users", res.pagination || {});
    renderPaginationBar("users", "users-pagination", "goToUsersPage", "changeUsersLimit");

    var tb = document.getElementById("users-table-body");
    if (users.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No users.</p></td></tr>'; return; }
    tb.innerHTML = users.map(function (u, i) {
      var displayIdx = (st.page - 1) * st.limit + i + 1;
      var issuedBadge = u.issuedCount > 0 ? '<span class="badge badge-warning">' + u.issuedCount + " book" + (u.issuedCount > 1 ? "s" : "") + "</span>" : '<span style="color:var(--text-muted)">None</span>';
      var statusBadge = u.status === "active" ? '<span class="badge badge-success">Active</span>' : u.status === "blocked" ? '<span class="badge badge-blocked">Blocked</span>' : '<span class="badge badge-warning">Pending</span>';
      if (u.blockedReason) statusBadge += ' <small style="color:var(--text-muted)">(' + u.blockedReason + ')</small>';
      
      var actions = "";
      if (u.role === "student" || u.role === "teacher") {
        actions += '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + (u._id || u.id) + '\')">Delete User</button>';
      }
      
      if (isOwner() && u.accountId && u.role !== "owner") {
        if (u.status !== "blocked") {
          actions += ' <button class="btn btn-danger btn-sm" onclick="blockAccount(\'' + u.accountId + '\', \'' + u.name + '\')">Block Account</button>';
        } else {
          actions += ' <button class="btn btn-success btn-sm" onclick="unblockAccount(\'' + u.accountId + '\')">Unblock</button>';
        }
      }
      
      return '<tr><td style="color:var(--text-muted);font-family:monospace">#' + displayIdx + '</td><td style="color:var(--text-primary);font-weight:500">' + u.name + "</td><td>" + u.contact + "</td><td>" + issuedBadge + "</td><td>" + statusBadge + '</td><td class="actions-cell">' + actions + "</td></tr>";
    }).join("");
  });
}
function deleteUser(id) { if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) return; apiDelete("/users/" + id).then(function (d) { if (d.success) { renderUsers(); showToast("Deleted.", "info"); } else showToast(d.message, "error"); }); }

function approveAccount(id) {
  apiPut("/auth/accounts/" + id + "/approve", { approvedBy: getCurrentUser().name })
    .then(function(d) { if (d.success) { showToast(d.name + " approved!", "success"); renderUsers(); } else showToast(d.message, "error"); });
}

function rejectAccount(id) {
  if (!confirm("Reject this account?")) return;
  apiDelete("/auth/accounts/" + id + "/reject")
    .then(function(d) { if (d.success) { showToast("Account rejected", "info"); renderUsers(); } });
}

function blockAccount(id, name) {
  var reason = prompt("Block reason for " + name + ":");
  if (!reason) return;
  apiPut("/auth/accounts/" + id + "/block", { reason: reason, blockedBy: getCurrentUser().name })
    .then(function(d) { if (d.success) { showToast(name + " blocked", "info"); renderUsers(); } else showToast(d.message, "error"); });
}

function unblockAccount(id) {
  apiPut("/auth/accounts/" + id + "/unblock", { unblockedBy: getCurrentUser().name })
    .then(function(d) { if (d.success) { showToast("Account unblocked", "success"); renderUsers(); } });
}

// ============ ISSUE / RETURN ============
function populateIssueDropdowns() {
  if (!isAdmin()) return;
  apiGet("/dropdowns").then(function (d) {
    var bs = document.getElementById("issue-book-select"), us = document.getElementById("issue-user-select");
    bs.innerHTML = '<option value="">-- Choose Book --</option>';
    us.innerHTML = '<option value="">-- Choose User --</option>';
    d.books.forEach(function (b) { bs.innerHTML += '<option value="' + b.id + '">' + b.label + "</option>"; });
    d.users.forEach(function (u) { us.innerHTML += '<option value="' + u.id + '">' + u.label + "</option>"; });
  });
}
function issueBook(e) {
  e.preventDefault(); if (!isAdmin()) return;
  var bookId = document.getElementById("issue-book-select").value, userId = document.getElementById("issue-user-select").value;
  if (!bookId || !userId) { showToast("Select both.", "error"); return; }
  apiPost("/transactions/issue", { bookId: bookId, userId: userId }).then(function (d) {
    if (d.success) { 
      document.getElementById("issue-book-form").reset(); 
      populateIssueDropdowns(); 
      renderTransactions(); 
      updateDashboardStats(); 
      if(typeof renderBooks === 'function') renderBooks(); 
      if(typeof renderUsers === 'function') renderUsers();
      showToast("Issued! Due: " + formatDate(d.dueDate), "success"); 
    } else {
      showToast(d.message, "error");
    }
  });
}
function returnBook(id) {
  if (!isAdmin()) return;
  apiPost("/transactions/return/" + id).then(function (d) {
    if (d.success) { if (d.fine > 0) showToast("Returned. Fine: \u20B9" + d.fine, "error"); else showToast("Returned!", "success"); populateIssueDropdowns(); renderTransactions(); } else showToast(d.message, "error");
  });
}
function renderTransactions() {
  var user = getCurrentUser(), admin = isAdmin();
  var url = admin ? "/transactions" : "/transactions/history/" + encodeURIComponent(user.name);
  
  var st = getPaginationState("transactions");
  var page = st.page;
  var limit = st.limit;
  
  apiGet(url + "?page=" + page + "&limit=" + limit).then(function (res) {
    var txs = res.data || [];
    setPaginationState("transactions", res.pagination || {});
    renderPaginationBar("transactions", "transactions-pagination", "goToTransactionsPage", "changeTransactionsLimit");

    var tb = document.getElementById("transactions-table-body");
    if (txs.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No transactions.</p></td></tr>'; return; }
    tb.innerHTML = txs.map(function (t) {
      var f = calculateFine(t);
      var status, action;
      if (t.status === "issued") {
        status = new Date() > new Date(t.dueDate) ? '<span class="badge badge-danger">Overdue</span>' : '<span class="badge badge-warning">Issued</span>';
        var renewBtn = (!admin && f === 0 && !t.renewed) ? '<button class="btn btn-sm" style="background:var(--accent);color:#000;margin-left:4px;" onclick="renewBook(\'' + (t._id || t.id) + '\')">Renew</button>' : '';
        action = admin ? '<button class="btn btn-success btn-sm" onclick="returnBook(\'' + (t._id || t.id) + "')\">Return</button>" : 
                 ((f > 0 ? '<button class="btn btn-primary btn-sm" onclick="payFineOnline(\'' + (t._id || t.id) + '\', ' + f + ')">Pay Fine</button>' : "") + renewBtn || "--");
      } else { 
        status = '<span class="badge badge-success">Returned</span>'; 
        action = admin ? "--" : (f > 0 && !t.finePaid ? '<button class="btn btn-primary btn-sm" onclick="payFineOnline(\'' + (t._id || t.id) + '\', ' + f + ')">Pay Fine</button>' : "--"); 
      }
      var fine = f > 0 ? '<span style="color:var(--danger);font-weight:700">\u20B9' + f + "</span>" : '<span style="color:var(--text-muted)">\u20B90</span>';
      return '<tr><td style="color:var(--text-primary);font-weight:500">' + (t.bookTitle || "Deleted") + "</td><td>" + (t.userName || "?") + "</td><td>" + formatDate(t.issueDate) + "</td><td>" + formatDate(t.dueDate) + "</td><td>" + status + "</td><td>" + fine + "</td><td>" + action + "</td></tr>";
    }).join("");
  });
}

function renewBook(id) {
  if (!confirm("Renew this book for an additional 14 days?")) return;
  apiPut("/transactions/" + id + "/renew").then(function (d) {
    if (d.success) { renderTransactions(); renderBorrowingHistory(); updateDashboardStats(); showToast(d.message, "success"); }
    else showToast(d.message, "error");
  });
}

function payFineOnline(txId, amount) {
  showToast("Redirecting to secure payment gateway...", "info");
  setTimeout(function() {
    var confirmPay = confirm("🔒 Stripe Secure Payment (Mock)\n\nAmount due: ₹" + amount + "\n\nClick OK to simulate a successful payment.");
    if (confirmPay) {
      apiPost("/transactions/pay-fine/" + txId, { amount: amount }).then(function(d) {
         if (d.success) { showToast("Payment successful! Fine cleared.", "success"); renderTransactions(); renderMyFines(); renderFineReport(); }
         else { showToast(d.message, "error"); }
      });
    } else {
      showToast("Payment cancelled.", "info");
    }
  }, 1000);
}

// ============ DIGITAL LIBRARY ============
function addEBook(e) {
  e.preventDefault();
  if (!isAdmin()) { showToast("Only Admin/Owner can add e-books.", "error"); return; }
  var payload = {
    title: document.getElementById("add-ebook-title").value.trim(),
    author: document.getElementById("add-ebook-author").value.trim(),
    category: document.getElementById("add-ebook-category").value.trim(),
    pdfUrl: document.getElementById("add-ebook-pdfurl").value.trim(),
    pages: parseInt(document.getElementById("add-ebook-pages").value) || 0,
    language: document.getElementById("add-ebook-language").value.trim() || "English",
    coverColor: document.getElementById("add-ebook-covercolor").value || "#3b82f6",
    description: document.getElementById("add-ebook-description").value.trim()
  };
  if (!payload.title || !payload.author || !payload.pdfUrl) { showToast("Title, Author, and PDF URL are required.", "error"); return; }
  apiPost("/ebooks", payload).then(function (d) {
    if (d.success) {
      showToast("E-Book \"" + payload.title + "\" added successfully!", "success");
      document.getElementById("add-ebook-form").reset();
      document.getElementById("add-ebook-language").value = "English";
      renderDigitalLibrary();
    } else {
      showToast(d.message || "Failed to add e-book.", "error");
    }
  });
}

function handleBulkImport() {
  if (!isAdmin()) return;
  var fileInput = document.getElementById("ebookBulkFile");
  if (!fileInput.files || fileInput.files.length === 0) {
    showToast("Please select a file first.", "error");
    return;
  }
  var file = fileInput.files[0];
  var reader = new FileReader();
  
  reader.onload = function(e) {
    var content = e.target.result;
    var ebooks = [];
    
    if (file.name.endsWith(".json")) {
      try { ebooks = JSON.parse(content); }
      catch(err) { showToast("Invalid JSON file.", "error"); return; }
    } else if (file.name.endsWith(".csv")) {
      var lines = content.split(/\r\n|\n/).filter(function(l) { return l.trim(); });
      if (lines.length < 2) { showToast("CSV file must contain a header row and data.", "error"); return; }
      var headers = lines[0].split(",").map(function(h) { return h.trim(); });
      
      for (var i = 1; i < lines.length; i++) {
        // Handle basic CSV parsing (ignores commas inside quotes for simplicity)
        var values = lines[i].split(",").map(function(v) { return v.trim(); });
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
          if (values[j]) obj[headers[j]] = values[j].replace(/^"|"$/g, "");
        }
        ebooks.push(obj);
      }
    } else {
      showToast("Unsupported file format. Please use .csv or .json.", "error");
      return;
    }
    
    apiPost("/ebooks/bulk", { ebooks: ebooks }).then(function(d) {
      if (d.success) {
        showToast(d.message, "success");
        document.getElementById('ebookBulkModal').style.display = 'none';
        fileInput.value = "";
        renderDigitalLibrary();
      } else {
        showToast(d.message || "Bulk import failed.", "error");
      }
    });
  };
  reader.onerror = function() { showToast("Failed to read file.", "error"); };
  reader.readAsText(file);
}

function deleteEBook(id, title) {
  if (!isAdmin()) return;
  if (!confirm("Are you sure you want to delete the e-book \"" + title + "\"?")) return;
  apiDelete("/ebooks/" + id).then(function (d) {
    if (d.success) { showToast("E-Book deleted.", "info"); renderDigitalLibrary(); }
    else showToast(d.message || "Failed to delete.", "error");
  });
}

function renderDigitalLibrary() {
  // Show add-ebook panel for admin/owner
  var addPanel = document.getElementById("add-ebook-panel");
  if (addPanel) { addPanel.style.display = isAdmin() ? "block" : "none"; }

  var search = (document.getElementById("ebook-search") || {}).value || "";
  search = search.toLowerCase();
  apiGet("/ebooks").then(function (ebooks) {
    if (!Array.isArray(ebooks)) { ebooks = []; }
    var filtered = ebooks.filter(function (e) {
      return e.title.toLowerCase().includes(search) || e.author.toLowerCase().includes(search) || e.category.toLowerCase().includes(search);
    });
    var grid = document.getElementById("ebooks-grid");
    if (!grid) return;
    if (filtered.length === 0) { grid.innerHTML = '<p class="empty-state">No eBooks found.</p>'; return; }
    var admin = isAdmin();
    grid.innerHTML = filtered.map(function (e) {
      var eid = e._id || e.id;
      return '<div class="ebook-card" style="border-left:4px solid ' + (e.coverColor || "#3b82f6") + '">' +
        '<div class="ebook-card-body">' +
          '<h4 class="ebook-title">' + e.title + '</h4>' +
          '<p class="ebook-author">' + e.author + '</p>' +
          '<p class="ebook-desc">' + (e.description || "") + '</p>' +
          '<div class="ebook-meta">' +
            '<span class="rec-category">' + e.category + '</span>' +
            (e.pages ? '<span class="meta-tag">' + e.pages + ' pages</span>' : '') +
            '<span class="meta-tag">' + (e.language || "English") + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="ebook-actions">' +
          '<a href="' + e.pdfUrl + '" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">📖 Read Online</a>' +
          (admin ? ' <button class="btn btn-danger btn-sm" onclick="deleteEBook(\'' + eid + "', '" + e.title.replace(/'/g, "\\'") + '\')">🗑 Delete</button>' : '') +
        '</div>' +
      '</div>';
    }).join("");
  });
}

// ============ INIT ============
document.addEventListener("DOMContentLoaded", function () {
  var user = checkAuth(); if (!user) return;
  setupRoleBasedUI(user);
  updateDashboardStats();
  if (user.role === "student") checkOverdueAlerts(user);
  document.querySelectorAll(".modal-overlay").forEach(function (m) {
    m.addEventListener("click", function (e) { if (e.target === m) m.style.display = "none"; });
  });
  
  // Real-time polling for updates
  setInterval(function() {
    var activeSectionId = document.querySelector(".content-section.active")?.id;
    if (activeSectionId === "section-exchange" && typeof renderExchanges === 'function') renderExchanges();
    if (activeSectionId === "section-requests" && typeof renderAdminExchanges === 'function') renderAdminExchanges();
    if (activeSectionId === "section-notifications" && typeof fetchNotifications === 'function') fetchNotifications();
  }, 5000);
});

function checkOverdueAlerts(user) {
  var url = isAdmin() ? "/transactions" : "/transactions/history/" + encodeURIComponent(user.name);
  apiGet(url).then(function(res) {
    var txs = Array.isArray(res) ? res : (res.data || []);
    var overdueCount = 0;
    var totalFine = 0;
    txs.forEach(function(t) {
      if (t.userName === user.name && t.status === "issued" && new Date() > new Date(t.dueDate)) {
        overdueCount++;
        totalFine += calculateFine(t);
      }
    });
    if (overdueCount > 0) {
      setTimeout(function() {
        showToast("⚠️ You have " + overdueCount + " overdue book(s) with ₹" + totalFine + " fine! Please return/pay asap.", "error");
      }, 1500);
    }
  });
}

// ============ CSV EXPORT ============
function exportCSV(type, filename) {
  showToast("Preparing export...", "info");
  fetch(API_BASE + "/export/" + type, {
    headers: getAuthHeaders()
  })
  .then(function(res) {
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
  })
  .then(function(blob) {
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast("Downloaded " + filename + "!", "success");
  })
  .catch(function(err) {
    showToast("Export failed: " + err.message, "error");
  });
}

function exportPDF(type, filename) {
  showToast("Preparing PDF export...", "info");
  fetch(API_BASE + "/export/pdf/" + type, {
    headers: getAuthHeaders()
  })
  .then(function(res) {
    if (!res.ok) throw new Error("PDF Export failed");
    return res.blob();
  })
  .then(function(blob) {
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast("Downloaded " + filename + "!", "success");
  })
  .catch(function(err) {
    showToast("Export failed: " + err.message, "error");
  });
}

// ============ DARK MODE ============
function toggleDarkMode() {
  document.body.classList.toggle("light-mode");
  var isLight = document.body.classList.contains("light-mode");
  localStorage.setItem("bs_darkMode", isLight ? "light" : "dark");
  var icon = document.getElementById("darkModeIcon");
  if (icon) icon.innerHTML = isLight
    ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';

  // Re-draw any visible charts to match the new theme colors
  var activeSection = document.querySelector(".content-section.active");
  if (activeSection) {
    if (activeSection.id === "section-dashboard") {
      updateDashboardStats();
    } else if (activeSection.id === "section-reports") {
      renderReports();
    }
  }
}

// ============ QR SCANNER ============
var qrStream = null;
var qrAnimFrame = null;

function populateQRUserDropdown() {
  apiGet("/dropdowns").then(function(d) {
    var sel = document.getElementById("qr-user-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Choose User --</option>' + d.users.map(function(u) { return '<option value="' + u.id + '">' + u.label + '</option>'; }).join("");
  });
}

function startQRScanner() {
  var video = document.getElementById("qr-video");
  var overlay = document.getElementById("qr-scan-overlay");
  var startBtn = document.getElementById("qr-start-btn");
  var stopBtn = document.getElementById("qr-stop-btn");
  if (!video) return;
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(function(stream) {
      qrStream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", true);
      video.play();
      if (overlay) overlay.style.display = "block";
      if (startBtn) startBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "inline-flex";
      scanQRFrame(video);
    })
    .catch(function(e) {
      document.getElementById("qr-result").innerHTML = '<div class="qr-error">Camera access denied. Use manual entry below.</div>';
    });
}

function stopQRScanner() {
  if (qrStream) { qrStream.getTracks().forEach(function(t) { t.stop(); }); qrStream = null; }
  if (qrAnimFrame) { cancelAnimationFrame(qrAnimFrame); qrAnimFrame = null; }
  var video = document.getElementById("qr-video");
  if (video) { video.srcObject = null; }
  var overlay = document.getElementById("qr-scan-overlay"); if (overlay) overlay.style.display = "none";
  var startBtn = document.getElementById("qr-start-btn"); if (startBtn) startBtn.style.display = "inline-flex";
  var stopBtn = document.getElementById("qr-stop-btn"); if (stopBtn) stopBtn.style.display = "none";
}

function scanQRFrame(video) {
  if (!video.readyState || video.readyState < 2) { qrAnimFrame = requestAnimationFrame(function() { scanQRFrame(video); }); return; }
  var canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (typeof jsQR !== "undefined") {
    var code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code && code.data && code.data.startsWith("BOOKSPHERE:")) {
      stopQRScanner();
      handleQRScanned(code.data);
      return;
    }
  }
  qrAnimFrame = requestAnimationFrame(function() { scanQRFrame(video); });
}

function handleQRScanned(qrData) {
  var user = getCurrentUser();
  var resultEl = document.getElementById("qr-result");
  resultEl.innerHTML = '<div class="qr-success">✓ QR Detected: ' + qrData + '<br>Select action:</div>' +
    '<div style="display:flex;gap:10px;margin-top:10px;">' +
    '<button class="btn btn-primary" onclick="doQRIssue(\'' + qrData + '\')">Issue Book</button>' +
    '<button class="btn btn-success" onclick="doQRReturn(\'' + qrData + '\')">Return Book</button></div>';
}

function doQRIssue(qrData) {
  var userId = document.getElementById("qr-user-select") ? document.getElementById("qr-user-select").value : "";
  if (!userId) { showToast("Select a user first", "error"); return; }
  apiPost("/transactions/issue-qr", { qrData: qrData, userId: userId, issuedBy: getCurrentUser().name })
    .then(function(d) {
      if (d.success) { showToast("Issued \"" + d.bookTitle + "\" (Copy #" + d.copyNumber + ") to " + d.userName, "success"); document.getElementById("qr-result").innerHTML = ""; }
      else showToast(d.message, "error");
    });
}

function doQRReturn(qrData) {
  apiPost("/transactions/return-qr", { qrData: qrData })
    .then(function(d) {
      if (d.success) { showToast("Returned \"" + d.bookTitle + "\" (Copy #" + d.copyNumber + "). Fine: ₹" + d.totalFine, "success"); document.getElementById("qr-result").innerHTML = ""; }
      else showToast(d.message, "error");
    });
}

function qrIssueManual() {
  var qrData = document.getElementById("manual-qr-input").value.trim();
  var userId = document.getElementById("qr-user-select").value;
  if (!qrData || !userId) { showToast("Enter QR data and select a user", "error"); return; }
  apiPost("/transactions/issue-qr", { qrData: qrData, userId: userId, issuedBy: getCurrentUser().name })
    .then(function(d) {
      if (d.success) {
        showToast("Issued \"" + d.bookTitle + "\" to " + d.userName + ". Due: " + new Date(d.dueDate).toLocaleDateString("en-IN"), "success");
        document.getElementById("manual-qr-input").value = "";
      }
      else showToast(d.message, "error");
    });
}

function qrReturnManual() {
  var qrData = document.getElementById("manual-qr-input").value.trim();
  if (!qrData) { showToast("Enter QR data", "error"); return; }
  apiPost("/transactions/return-qr", { qrData: qrData })
    .then(function(d) {
      if (d.success) {
        showToast("Returned. Fine: ₹" + d.totalFine, "success");
        document.getElementById("manual-qr-input").value = "";
      }
      else showToast(d.message, "error");
    });
}

function handleQRInputKeyPress(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    var userId = document.getElementById("qr-user-select").value;
    if (userId) {
      qrIssueManual(); // If user is selected, issue the book
    } else {
      qrReturnManual(); // If no user selected, assume return
    }
  }
}





// ============ RESERVATIONS ============
function renderReservations() {
  var user = getCurrentUser();
  var st = getPaginationState("reservations");
  var page = st.page;
  var limit = st.limit;
  apiGet("/reservations/user/" + encodeURIComponent(user.name) + "?page=" + page + "&limit=" + limit).then(function(res) {
    var reservations = res.data || [];
    setPaginationState("reservations", res.pagination || {});
    renderPaginationBar("reservations", "reservations-pagination", "goToReservationsPage", "changeReservationsLimit");

    var tb = document.getElementById("reservations-table-body");
    if (!tb) return;
    if (reservations.length === 0) { tb.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No reservations.</p></td></tr>'; return; }
    tb.innerHTML = reservations.map(function(r) {
      var statusBadge, cancelBtn = "--";
      if (r.status === "waiting") {
        // Calculate time remaining
        var now = new Date();
        var expires = new Date(r.expiresAt);
        var diffMs = expires - now;
        if (diffMs > 0) {
          var hours = Math.floor(diffMs / (1000 * 60 * 60));
          var mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          statusBadge = '<span class="badge badge-warning">⏳ ' + hours + 'h ' + mins + 'm left</span>';
          cancelBtn = '<button class="btn btn-danger btn-sm" onclick="cancelReservation(\'' + r.id + '\')">Cancel</button>';
        } else {
          statusBadge = '<span class="badge badge-danger">Expired</span>';
        }
      } else if (r.status === "expired") {
        statusBadge = '<span class="badge badge-danger">Expired</span>';
      } else if (r.status === "cancelled") {
        statusBadge = '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text-muted)">Cancelled</span>';
      } else if (r.status === "fulfilled") {
        statusBadge = '<span class="badge badge-success">Collected ✓</span>';
      } else {
        statusBadge = '<span class="badge">' + r.status + '</span>';
      }
      var expiryCol = r.expiresAt ? formatDateTime(r.expiresAt) : "--";
      return '<tr><td style="color:var(--text-primary);font-weight:500">' + r.bookTitle + '</td><td>' + formatDate(r.createdAt) + '</td><td>' + expiryCol + '</td><td>' + statusBadge + '</td><td>' + cancelBtn + '</td></tr>';
    }).join("");
  });
}

function cancelReservation(id) {
  apiDelete("/reservations/" + id)
    .then(function(d) { if (d.success) { showToast("Reservation cancelled", "info"); renderReservations(); } });
}

// ============ BOOK EXCHANGE ============
function renderExchanges() {
  var user = getCurrentUser();
  apiGet("/exchanges/user/" + encodeURIComponent(user.name)).then(function(exchanges) {
    var tb = document.getElementById("exchange-table-body");
    if (!tb) return;
    if (!Array.isArray(exchanges) || !exchanges.length) { tb.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No exchanges yet.</p></td></tr>'; return; }
    tb.innerHTML = exchanges.map(function(e) {
      var statusBadge = '<span class="badge badge-' + e.status + '">' + e.status + '</span>';
      
      var isRequestReceiver = e.toUser === user.name; // User who HAS the book
      var isRequestSender = e.fromUser === user.name; // User who WANTS the book
      
      var actions = "--";
      if (isRequestReceiver && e.status === "pending") {
        actions = '<button class="btn btn-success btn-sm" onclick="acceptExchange(\'' + e.id + '\')">Accept</button> ' +
          '<button class="btn btn-danger btn-sm" onclick="rejectExchange(\'' + e.id + '\')">Reject</button>';
      } else if (isRequestSender && e.status === "approved") {
        actions = '<button class="btn btn-primary btn-sm" onclick="completeExchange(\'' + e.id + '\')">Mark Received</button>';
      }
      
      return '<tr><td>' + e.bookTitle + '</td><td>' + e.fromUser + '</td><td>' + e.toUser + '</td><td>' + (e.campusLocation||"--") + '</td><td>' + statusBadge + '</td><td>' + actions + '</td></tr>';
    }).join("");
  });
}

var _borrowerTimer = null;
function lookupBorrowers() {
  var query = (document.getElementById("exchange-book-title").value || "").trim();
  var panel = document.getElementById("exchange-borrowers-panel");
  var list = document.getElementById("exchange-borrowers-list");
  
  if (query.length < 2) {
    panel.style.display = "none";
    return;
  }
  
  // Debounce: wait 400ms after user stops typing
  clearTimeout(_borrowerTimer);
  _borrowerTimer = setTimeout(function() {
    apiGet("/borrowers?q=" + encodeURIComponent(query)).then(function(results) {
      if (!results || results.length === 0) {
        panel.style.display = "block";
        list.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No one currently has this book issued. It may be available in the library!</p>';
        return;
      }
      var user = getCurrentUser();
      panel.style.display = "block";
      list.innerHTML = results.map(function(r) {
        var dueStr = r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "N/A";
        var isMe = r.userName === user.name;
        return '<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.05);">' +
          '<div>' +
            '<strong style="color:var(--text-primary);">' + r.userName + (isMe ? ' (You)' : '') + '</strong>' +
            '<div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">📚 ' + r.bookTitle + ' · Due: ' + dueStr + '</div>' +
          '</div>' +
          (isMe ? '' : '<button class="btn btn-sm" style="background:rgba(139,92,246,0.12);color:#a78bfa;border:1px solid rgba(139,92,246,0.2)" onclick="selectBorrowerForExchange(\'' + r.userName.replace(/'/g, "\\'") + '\', \'' + r.bookTitle.replace(/'/g, "\\'") + '\', \'' + r.bookId + '\')">Exchange ↗</button>') +
        '</div>';
      }).join("");
    });
  }, 400);
}

function selectBorrowerForExchange(userName, bookTitle, bookId) {
  document.getElementById("exchange-to-user").value = userName;
  var titleEl = document.getElementById("exchange-book-title");
  titleEl.value = bookTitle;
  titleEl.dataset.bookId = bookId || "";
  showToast("Selected " + userName + " for exchange!", "info");
}

function sendExchangeRequest() {
  var user = getCurrentUser();
  var titleEl = document.getElementById("exchange-book-title");
  var bookTitle = titleEl.value.trim();
  var bookId = titleEl.dataset.bookId || "000000000000000000000001";
  var toUser = document.getElementById("exchange-to-user").value.trim();
  var toEmail = document.getElementById("exchange-to-email").value.trim();
  var location = document.getElementById("exchange-location").value.trim();
  var msg = document.getElementById("exchange-message").value.trim();
  if (!bookTitle || !toUser) { showToast("Book title and recipient required", "error"); return; }
  apiPost("/exchanges", { fromUser: user.name, fromUserEmail: user.email||"", toUser: toUser, toUserEmail: toEmail, bookId: bookId, bookTitle: bookTitle, campusLocation: location, message: msg })
    .then(function(d) {
      if (d.success) {
        showToast("Exchange request sent to " + toUser, "success");
        ["exchange-book-title","exchange-to-user","exchange-to-email","exchange-location","exchange-message"].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) {
            el.value = "";
            if (id === "exchange-book-title") delete el.dataset.bookId;
          }
        });
        renderExchanges();
      }
      else showToast(d.message, "error");
    });
}

function acceptExchange(id) {
  var location = prompt("Confirm campus meeting location:");
  apiPut("/exchanges/" + id + "/accept", { campusLocation: location||"TBD" })
    .then(function(d) { if (d.success) { showToast("Exchange accepted!", "success"); renderExchanges(); } });
}

function rejectExchange(id) {
  apiPut("/exchanges/" + id + "/reject", {})
    .then(function(d) { if (d.success) { showToast("Exchange rejected", "info"); renderExchanges(); } });
}

function completeExchange(id) {
  if(!confirm("Did you physically receive the book? Click OK to confirm and transfer the book to your account.")) return;
  apiPut("/exchanges/" + id + "/complete", {})
    .then(function(d) { 
      if (d.success) { 
        showToast("Book successfully transferred to you!", "success"); 
        renderExchanges(); 
        if(typeof renderTransactions === 'function') renderTransactions(); 
      } else {
        showToast(d.message, "error");
      }
    });
}

// ============ PAYMENT MANAGEMENT ============
function openPaymentModal(txId, totalFine) {
  var method = prompt("Payment method for ₹" + totalFine + "?\n1. cash\n2. upi\n3. online\n\nEnter method:");
  if (!method) return;
  method = method.toLowerCase().trim();
  if (!["cash","upi","online"].includes(method)) { showToast("Invalid method. Use: cash, upi, or online", "error"); return; }
  apiPut("/transactions/" + txId + "/pay", { paymentMethod: method, paidBy: getCurrentUser().name })
    .then(function(d) {
      if (d.success) { showToast("₹" + d.totalFine + " paid via " + d.paymentMethod + "!", "success"); renderFineReport(); renderTransactions(); }
      else showToast(d.message, "error");
    });
}

// ============ PROFILE MANAGEMENT ============
function renderProfile() {
  var u = checkAuth(); if (!u) return;
  apiGet("/auth/profile").then(function(d) {
    if (d.success) {
      document.getElementById("profile-display-name").textContent = d.profile.name;
      document.getElementById("profile-display-role").textContent = d.profile.role;
      document.getElementById("profile-email").value = d.profile.email;
      document.getElementById("profile-contact").value = d.profile.contactNumber || "";
      
      var img = document.getElementById("profile-picture-display");
      var placeholder = document.getElementById("profile-picture-placeholder");
      if (d.profile.profilePicture) {
        img.src = d.profile.profilePicture;
        img.style.display = "block";
        placeholder.style.display = "none";
      } else {
        img.style.display = "none";
        placeholder.style.display = "block";
      }
    } else {
      showToast(d.message || "Could not load profile", "error");
    }
  }).catch(function() { showToast("Error connecting to server", "error"); });
}

function updateProfile(e) {
  e.preventDefault();
  var contact = document.getElementById("profile-contact").value.trim();
  apiPut("/auth/profile", { contactNumber: contact }).then(function(d) {
    if (d.success) {
      showToast("Profile updated successfully", "success");
      renderProfile();
    } else {
      showToast(d.message || "Failed to update profile", "error");
    }
  }).catch(function() { showToast("Error connecting to server", "error"); });
}

function uploadProfilePicture(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(event) {
    var base64 = event.target.result;
    apiPut("/auth/profile", { profilePicture: base64 }).then(function(d) {
      if (d.success) {
        showToast("Profile picture updated!", "success");
        renderProfile();
        loadNavbarAvatar();
      } else {
        showToast(d.message || "Failed to update picture", "error");
      }
    }).catch(function() { showToast("Error connecting to server", "error"); });
  };
  reader.readAsDataURL(file);
}

function changePassword(e) {
  e.preventDefault();
  var curr = document.getElementById("profile-current-password").value;
  var newP = document.getElementById("profile-new-password").value;
  if (!curr || !newP) { showToast("All fields required", "error"); return; }
  apiPut("/auth/change-password", { currentPassword: curr, newPassword: newP }).then(function(d) {
    if (d.success) {
      showToast(d.message, "success");
      document.getElementById("profile-current-password").value = "";
      document.getElementById("profile-new-password").value = "";
    } else {
      showToast(d.message, "error");
    }
  }).catch(function() { showToast("Error connecting to server", "error"); });
}

// --- AI Chatbot ---
let isChatbotOpen = false;
function toggleChatbot() {
  const container = document.getElementById('chatbot-container');
  isChatbotOpen = !isChatbotOpen;
  container.style.display = isChatbotOpen ? 'flex' : 'none';
}

function handleChatKeyPress(e) {
  if (e.key === 'Enter') sendChatMessage();
}

async function sendChatMessage() {
  const inputEl = document.getElementById('chat-input');
  const message = inputEl.value.trim();
  if (!message) return;
  
  const messagesContainer = document.getElementById('chatbot-messages');
  
  // Add user message
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-message user-message';
  userDiv.textContent = message;
  messagesContainer.appendChild(userDiv);
  inputEl.value = '';
  
  // Add typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-message ai-message';
  typingDiv.innerHTML = '<i>Typing...</i>';
  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  try {
    const data = await apiPost("/chat", { message });
    
    messagesContainer.removeChild(typingDiv);
    
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-message ai-message';
    if (data.success) {
      // Basic markdown to HTML conversion
      let text = data.reply.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');
      text = text.replace(/\n/g, '<br>');
      aiDiv.innerHTML = text;
    } else {
      aiDiv.textContent = 'Error: ' + data.message;
    }
    messagesContainer.appendChild(aiDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  } catch (err) {
    messagesContainer.removeChild(typingDiv);
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-message ai-message';
    aiDiv.textContent = 'Connection error. Make sure the server is running.';
    messagesContainer.appendChild(aiDiv);
  }
}

// ============ REAL-TIME NOTIFICATIONS (SOCKET.IO) ============
(function initSocketIO() {
  if (typeof io === 'undefined') return;
  var token = localStorage.getItem("bs_token");
  if (!token) return; // Only connect if logged in

  var socket = io({
    auth: { token: token }
  });

  socket.on("connect", function() {
    console.log("[Socket.IO] Connected to real-time notification server");
  });

  socket.on("disconnect", function(reason) {
    console.warn("[Socket.IO] Disconnected:", reason);
  });

  socket.on("connect_error", function(err) {
    console.error("[Socket.IO] Connection error:", err.message);
  });

  socket.on("new_notification", function(notification) {
    console.log("[Socket.IO] New notification received:", notification);
    
    // Show live toast
    if (typeof showToast === "function") {
      showToast(notification.message, "info");
    }

    // Update notification badges (if user is admin or student)
    if (isAdmin() && notification.type === "admin_approval") {
      // Re-fetch stats to update pending requests/approvals badges
      if (document.getElementById("section-dashboard").classList.contains("active")) {
        updateDashboardStats();
      }
    } else {
      if (typeof loadStudentNotifCount === "function") {
        loadStudentNotifCount();
      }
    }

    // If currently viewing notifications, refresh the list
    var notifSection = document.getElementById("section-notifications");
    if (notifSection && notifSection.classList.contains("active")) {
      if (typeof renderNotifications === "function") {
        renderNotifications();
      }
    }
  });
})();

// ============ SHELF MANAGEMENT ============
function renderShelfManagement() {
  var search = (document.getElementById("shelf-book-search") || {}).value || "";
  search = search.toLowerCase();
  var st = getPaginationState("shelf");
  var page = st.page;
  var limit = st.limit;
  var query = "?page=" + page + "&limit=" + limit;
  if (search) query += "&search=" + encodeURIComponent(search);

  apiGet("/books" + query).then(function (res) {
    var books = res.data || [];
    setPaginationState("shelf", res.pagination || {});
    renderPaginationBar("shelf", "shelf-books-pagination", "goToShelfPage", "changeShelfLimit");

    var tb = document.getElementById("shelf-books-body");
    if (!tb) return;
    if (books.length === 0) {
      tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No books found.</p></td></tr>';
      return;
    }
    tb.innerHTML = books.map(function(b) {
      var bid = b._id || b.id;
      return '<tr>' +
        '<td>' + b.title + '</td>' +
        '<td>' + b.author + '</td>' +
        '<td>' + b.totalCopies + '</td>' +
        '<td><button class="btn btn-sm btn-primary" onclick="manageShelfCopies(\'' + bid + '\', \'' + b.title.replace(/'/g, "\\'") + '\')">Manage Copies</button></td>' +
        '</tr>';
    }).join("");
  });
}
function goToShelfPage(p) { var st = getPaginationState("shelf"); st.page = p; renderShelfManagement(); }
function changeShelfLimit(l) { var st = getPaginationState("shelf"); st.page = 1; st.limit = l; renderShelfManagement(); }

function manageShelfCopies(bookId, title) {
  var panel = document.getElementById("shelf-copies-panel");
  var titleEl = document.getElementById("shelf-copies-title");
  if (panel) panel.style.display = "block";
  if (titleEl) titleEl.textContent = "Manage Copies for: " + title;

  apiGet("/books/" + bookId + "/copies").then(function (copies) {
    var tb = document.getElementById("shelf-copies-body");
    if (!tb) return;
    if (!copies || copies.length === 0) {
      tb.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No copies found.</p></td></tr>';
      return;
    }
    tb.innerHTML = copies.map(function(c) {
      var cid = c._id || c.id;
      var sl = c.shelfLocation || { aisle: "", rack: "", position: "" };
      return '<tr>' +
        '<td>#' + c.copyNumber + '</td>' +
        '<td>' + c.status + '</td>' +
        '<td>' + c.condition + '</td>' +
        '<td><input type="text" id="aisle-' + cid + '" value="' + sl.aisle + '" style="width:60px"></td>' +
        '<td><input type="text" id="rack-' + cid + '" value="' + sl.rack + '" style="width:60px"></td>' +
        '<td><input type="text" id="pos-' + cid + '" value="' + sl.position + '" style="width:60px"></td>' +
        '<td><button class="btn btn-sm btn-primary" onclick="saveShelfLocation(\'' + cid + '\')">Save</button></td>' +
        '</tr>';
    }).join("");
  });
}

function saveShelfLocation(copyId) {
  var aisle = document.getElementById("aisle-" + copyId).value;
  var rack = document.getElementById("rack-" + copyId).value;
  var position = document.getElementById("pos-" + copyId).value;
  apiPut("/books/copies/" + copyId, { aisle: aisle, rack: rack, position: position })
    .then(function(d) { if (d.success) showToast("Shelf location saved!", "success"); else showToast(d.message, "error"); });
}
