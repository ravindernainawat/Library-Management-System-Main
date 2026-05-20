/* ==============================
   BookSphere — Full Feature Logic
   MongoDB Backend Connected
   ============================== */

var API_BASE = "http://localhost:5000/api";

// ============ API HELPERS ============
function apiGet(endpoint) {
  return fetch(API_BASE + endpoint).then(function (r) { return r.json(); });
}
function apiPost(endpoint, body) {
  return fetch(API_BASE + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
}
function apiPut(endpoint, body) {
  return fetch(API_BASE + endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json(); });
}
function apiDelete(endpoint) {
  return fetch(API_BASE + endpoint, { method: "DELETE" }).then(function (r) { return r.json(); });
}

// ============ AUTH ============
function getCurrentUser() { var d = localStorage.getItem("bs_currentUser"); return d ? JSON.parse(d) : null; }
function isAdmin() { var u = getCurrentUser(); return u && (u.role === "admin" || u.role === "librarian"); }
function checkAuth() { var u = getCurrentUser(); if (!u) { window.location.href = "login.html"; return null; } return u; }
function logout() { localStorage.removeItem("bs_currentUser"); window.location.href = "login.html"; }

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
  document.getElementById("user-info").textContent = user.name + " (" + user.role + ")";

  if (user.role === "admin" || user.role === "librarian") {
    sidebar.innerHTML =
      '<span class="sidebar-label">Main</span>' +
      sidebarLink("dashboard", "Dashboard", '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>') +
      sidebarLink("books", "Books", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') +
      sidebarLink("users", "Users", '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') +
      '<span class="sidebar-label">Operations</span>' +
      sidebarLink("issue-return", "Issue / Return", '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>') +
      sidebarLink("requests", "Requests", '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', true) +
      '<span class="sidebar-label">Insights</span>' +
      sidebarLink("reports", "Reports & Analytics", '<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>') +
      sidebarLink("fines", "Fine Reports", '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>') +
      sidebarLink("activity", "System Activity", '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>') +
      sidebarLink("notifications", "Notifications", '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') +
      '<span class="sidebar-label">Library</span>' +
      sidebarLink("digital-library", "Digital Library", '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');

    document.querySelectorAll(".admin-only").forEach(function (el) { el.style.display = ""; });
    document.querySelectorAll(".admin-only-col").forEach(function (el) { el.style.display = ""; });
    document.querySelectorAll(".student-only").forEach(function (el) { el.style.display = "none"; });
  } else {
    sidebar.innerHTML =
      '<span class="sidebar-label">Main</span>' +
      sidebarLink("dashboard", "Dashboard", '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>') +
      sidebarLink("books", "Browse Books", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') +
      '<span class="sidebar-label">My Activity</span>' +
      sidebarLink("issue-return", "My Books", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') +
      sidebarLink("my-requests", "My Requests", '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') +
      sidebarLink("wishlist", "Wishlist", '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>') +
      sidebarLink("history", "Borrowing History", '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>') +
      sidebarLink("notifications", "Notifications", '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') +
      '<span class="sidebar-label">Library</span>' +
      sidebarLink("digital-library", "Digital Library", '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');

    document.querySelectorAll(".admin-only").forEach(function (el) { el.style.display = "none"; });
    document.querySelectorAll(".admin-only-col").forEach(function (el) { el.style.display = "none"; });
    document.querySelectorAll(".student-only").forEach(function (el) { el.style.display = ""; });
    var uc = document.getElementById("stat-card-users"); if (uc) uc.style.display = "none";
    var it = document.getElementById("issue-section-title"); if (it) it.textContent = "My Books";
    var tt = document.getElementById("transactions-table-title"); if (tt) tt.textContent = "My Issued Books";
  }
  // Set first link active
  var first = sidebar.querySelector(".sidebar-link"); if (first) first.classList.add("active");
}

function sidebarLink(section, label, svgContent, hasBadge) {
  return '<a class="sidebar-link" data-section="' + section + '" onclick="switchSection(\'' + section + '\')">' +
    '<span class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + svgContent + '</svg></span> ' + label +
    (hasBadge ? ' <span class="sidebar-badge" id="sidebarReqBadge"></span>' : '') + '</a>';
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
  if (name === "dashboard") updateDashboardStats();
  if (name === "books") renderBooks();
  if (name === "users") renderUsers();
  if (name === "issue-return") { if (isAdmin()) populateIssueDropdowns(); renderTransactions(); }
  if (name === "requests") renderRequests();
  if (name === "my-requests") renderMyRequests();
  if (name === "wishlist") renderWishlist();
  if (name === "history") renderBorrowingHistory();
  if (name === "notifications") renderNotifications();
  if (name === "reports") renderReports();
  if (name === "fines") renderFineReport();
  if (name === "activity") renderActivityLogs();
  if (name === "digital-library") renderDigitalLibrary();
}

// ============ DASHBOARD ============
function updateDashboardStats() {
  var user = getCurrentUser();
  apiGet("/stats?role=" + user.role + "&name=" + encodeURIComponent(user.name)).then(function (d) {
    animateCounter("stat-total-books", d.totalBooks);
    if (isAdmin()) animateCounter("stat-total-users", d.totalUsers);
    animateCounter("stat-issued-books", d.issuedBooks);
    document.getElementById("stat-total-fines").textContent = "\u20B9" + d.totalFines;
    renderRecentTransactions(d.recent);
    if (isAdmin()) { updateNotificationBadge(d.pendingRequests); updateSidebarRequestBadge(d.pendingRequests); }
    else { loadStudentNotifCount(); }
  });
  if (!isAdmin()) loadRecommendations();
}
function loadStudentNotifCount() {
  var user = getCurrentUser();
  apiGet("/notifications/user/" + encodeURIComponent(user.name)).then(function (n) {
    var unread = n.filter(function (x) { return !x.read; }).length;
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
  });
}

// ============ BOOKS ============
function addBook(e) {
  e.preventDefault(); if (!isAdmin()) return;
  var data = {
    title: document.getElementById("book-title").value.trim(),
    author: document.getElementById("book-author").value.trim(),
    category: document.getElementById("book-category").value.trim(),
    quantity: document.getElementById("book-quantity").value,
    isbn: (document.getElementById("book-isbn") || {}).value || "",
    publisher: (document.getElementById("book-publisher") || {}).value || "",
    year: (document.getElementById("book-year") || {}).value || "",
    description: (document.getElementById("book-description") || {}).value || ""
  };
  apiPost("/books", data).then(function (d) {
    if (d.success) { document.getElementById("add-book-form").reset(); renderBooks(); showToast('"' + data.title + '" added!', "success"); }
    else showToast(d.message || "Error.", "error");
  });
}

function renderBooks() {
  var search = (document.getElementById("book-search") || {}).value || "";
  search = search.toLowerCase();
  var admin = isAdmin(), user = getCurrentUser();

  apiGet("/books").then(function (books) {
    var filtered = books.filter(function (b) {
      return b.title.toLowerCase().includes(search) || b.author.toLowerCase().includes(search) || b.category.toLowerCase().includes(search);
    });
    var tbody = document.getElementById("books-table-body");
    if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No books found.</p></td></tr>'; return; }

    // Get reviews for ratings and requests for student badges
    Promise.all([apiGet("/requests")]).then(function (results) {
      var requests = results[0];
      tbody.innerHTML = filtered.map(function (b) {
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
              '<button class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)" onclick="addToWishlist(\'' + bid + "')\">" + "♥ Save</button></td>";
          } else {
            actions = '<td class="actions-cell">' +
              '<button class="btn btn-primary btn-sm" onclick="openBookDetail(\'' + bid + "')\">" + "View</button> " +
              '<button class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)" onclick="addToWishlist(\'' + bid + "')\">" + "♥ Save</button></td>";
          }
        }
        return '<tr><td style="color:var(--text-primary);font-weight:500;cursor:pointer" onclick="openBookDetail(\'' + bid + '\')">' + b.title + "</td><td>" + b.author + "</td><td>" + b.category + "</td><td>" + b.totalCopies + "</td><td>" + b.availableCopies + "</td><td>--</td><td>" + status + "</td>" + actions + "</tr>";
      }).join("");
    });
  });
}

function deleteBook(id) { if (!isAdmin()) return; apiDelete("/books/" + id).then(function (d) { if (d.success) { renderBooks(); showToast("Deleted.", "info"); } else showToast(d.message, "error"); }); }

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
function removeFromWishlist(id) { apiDelete("/wishlist/" + id).then(function () { renderWishlist(); showToast("Removed from wishlist.", "info"); }); }

// ============ BORROWING HISTORY ============
function renderBorrowingHistory() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/transactions/history/" + encodeURIComponent(user.name)).then(function (txs) {
    var tb = document.getElementById("history-table-body");
    if (txs.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No borrowing history yet.</p></td></tr>'; return; }
    tb.innerHTML = txs.map(function (t) {
      var status = t.status === "issued" ? (new Date() > new Date(t.dueDate) ? '<span class="badge badge-danger">Overdue</span>' : '<span class="badge badge-warning">Issued</span>') : '<span class="badge badge-success">Returned</span>';
      var fine = t.fine > 0 ? '<span style="color:var(--danger);font-weight:700">\u20B9' + t.fine + "</span>" : '<span style="color:var(--text-muted)">\u20B90</span>';
      return "<tr><td>" + t.bookTitle + "</td><td>" + formatDate(t.issueDate) + "</td><td>" + formatDate(t.dueDate) + "</td><td>" + formatDate(t.returnDate) + "</td><td>" + status + "</td><td>" + fine + "</td></tr>";
    }).join("");
  });
}

// ============ NOTIFICATIONS ============
function renderNotifications() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/notifications/user/" + encodeURIComponent(user.name)).then(function (notifs) {
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
  apiPut("/notifications/read-all/" + encodeURIComponent(user.name)).then(function () { renderNotifications(); loadStudentNotifCount(); showToast("All marked as read.", "info"); });
}

// ============ REPORTS & ANALYTICS ============
function renderReports() {
  if (!isAdmin()) return;
  apiGet("/reports/overview").then(function (d) {
    document.getElementById("report-overview-grid").innerHTML =
      reportCard(d.totalBooks, "Total Books", "var(--info)") + reportCard(d.totalUsers, "Users", "var(--success)") +
      reportCard(d.activeIssues, "Active Issues", "var(--warning)") + reportCard(d.totalReturns, "Returns", "#2ed573") +
      reportCard(d.overdueCount, "Overdue", "var(--danger)") + reportCard("\u20B9" + d.totalFines, "Fines", "var(--danger)") +
      reportCard(d.pendingRequests, "Pending Req.", "#f59e0b") + reportCard(d.totalReviews, "Reviews", "var(--info)");
  });
  apiGet("/reports/popular-books").then(function (books) {
    var tb = document.getElementById("popular-books-body");
    if (books.length === 0) { tb.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No data</p></td></tr>'; return; }
    tb.innerHTML = books.map(function (b, i) { return "<tr><td>" + (i + 1) + "</td><td>" + b.title + "</td><td>" + b.author + "</td><td>" + b.category + "</td><td><strong>" + b.issueCount + "</strong></td></tr>"; }).join("");
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
  });
}
function reportCard(val, label, color) {
  return '<div class="report-stat"><div class="report-val" style="color:' + color + '">' + val + '</div><div class="report-lbl">' + label + "</div></div>";
}

// ============ FINE REPORT & ACTIVITY LOGS ============
function renderFineReport() {
  if (!isAdmin()) return;
  apiGet("/reports/fines").then(function (d) {
    document.getElementById("fine-grand-total").textContent = "\u20B9" + d.grandTotal;
    var tb = document.getElementById("fines-table-body");
    if (d.records.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No fines.</p></td></tr>'; return; }
    tb.innerHTML = d.records.map(function (r) {
      return "<tr><td>" + r.userName + "</td><td>" + r.bookTitle + "</td><td>" + formatDate(r.issueDate) + "</td><td>" + formatDate(r.dueDate) + "</td><td>" +
        formatDate(r.returnDate) + "</td><td>" + r.lateDays + "</td><td><strong style='color:var(--danger)'>\u20B9" + r.fine + "</strong></td></tr>";
    }).join("");
  });
}

function renderActivityLogs() {
  if (!isAdmin()) return;
  apiGet("/activity").then(function (logs) {
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
function renderRequests() {
  if (!isAdmin()) return;
  apiGet("/requests").then(function (reqs) {
    var pending = reqs.filter(function (r) { return r.status === "pending"; });
    var processed = reqs.filter(function (r) { return r.status !== "pending"; });
    var ptb = document.getElementById("requests-table-body");
    var htb = document.getElementById("requests-history-body");
    ptb.innerHTML = pending.length === 0 ? '<tr><td colspan="5" class="empty-state"><p>No pending requests.</p></td></tr>' :
      pending.map(function (r) {
        return '<tr><td style="color:var(--text-primary);font-weight:500">' + r.userName + "</td><td>" + r.bookTitle + "</td><td>" + formatDate(r.requestDate) + '</td><td><span class="badge badge-warning">Pending</span></td>' +
          '<td class="actions-cell"><button class="btn btn-success btn-sm" onclick="approveRequest(\'' + (r._id || r.id) + "')\">" + "Approve</button>" +
          '<button class="btn btn-danger btn-sm" onclick="rejectRequest(\'' + (r._id || r.id) + "')\">" + "Reject</button></td></tr>";
      }).join("");
    htb.innerHTML = processed.length === 0 ? '<tr><td colspan="4" class="empty-state"><p>No past requests.</p></td></tr>' :
      processed.map(function (r) {
        var badge = r.status === "approved" ? '<span class="badge badge-success">Approved</span>' : '<span class="badge badge-danger">Rejected</span>';
        return "<tr><td>" + r.userName + "</td><td>" + r.bookTitle + "</td><td>" + formatDate(r.requestDate) + "</td><td>" + badge + "</td></tr>";
      }).join("");
  });
}
function approveRequest(id) { apiPut("/requests/" + id + "/approve").then(function (d) { if (d.success) { renderRequests(); updateDashboardStats(); showToast("Approved!", "success"); } else showToast(d.message, "error"); }); }
function rejectRequest(id) { apiPut("/requests/" + id + "/reject").then(function (d) { if (d.success) { renderRequests(); updateDashboardStats(); showToast("Rejected.", "info"); } else showToast(d.message, "error"); }); }

function renderMyRequests() {
  var user = getCurrentUser(); if (!user) return;
  apiGet("/requests").then(function (reqs) {
    var mine = reqs.filter(function (r) { return r.userName === user.name; });
    var tb = document.getElementById("my-requests-body");
    if (mine.length === 0) { tb.innerHTML = '<tr><td colspan="3" class="empty-state"><p>No requests yet.</p></td></tr>'; return; }
    tb.innerHTML = mine.map(function (r) {
      var badge = r.status === "pending" ? '<span class="badge badge-warning">Pending</span>' : r.status === "approved" ? '<span class="badge badge-success">Approved</span>' : '<span class="badge badge-danger">Rejected</span>';
      return '<tr><td style="color:var(--text-primary);font-weight:500">' + r.bookTitle + "</td><td>" + formatDate(r.requestDate) + "</td><td>" + badge + "</td></tr>";
    }).join("");
  });
}

// ============ USER MANAGEMENT ============
function addUser(e) {
  e.preventDefault(); if (!isAdmin()) return;
  apiPost("/users", { name: document.getElementById("user-name").value.trim(), contact: document.getElementById("user-contact").value.trim() }).then(function (d) {
    if (d.success) { document.getElementById("add-user-form").reset(); renderUsers(); showToast("User added!", "success"); } else showToast(d.message, "error");
  });
}
function renderUsers() {
  if (!isAdmin()) return;
  apiGet("/users").then(function (users) {
    var tb = document.getElementById("users-table-body");
    if (users.length === 0) { tb.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No users.</p></td></tr>'; return; }
    tb.innerHTML = users.map(function (u, i) {
      return '<tr><td style="color:var(--text-muted);font-family:monospace">#' + (i + 1) + '</td><td style="color:var(--text-primary);font-weight:500">' + u.name + "</td><td>" + u.contact + "</td><td>" +
        (u.issuedCount > 0 ? '<span class="badge badge-warning">' + u.issuedCount + " book" + (u.issuedCount > 1 ? "s" : "") + "</span>" : '<span style="color:var(--text-muted)">None</span>') +
        '</td><td class="actions-cell"><button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + (u._id || u.id) + "')\">" + "Delete</button></td></tr>";
    }).join("");
  });
}
function deleteUser(id) { apiDelete("/users/" + id).then(function (d) { if (d.success) { renderUsers(); showToast("Deleted.", "info"); } else showToast(d.message, "error"); }); }

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
    if (d.success) { document.getElementById("issue-book-form").reset(); populateIssueDropdowns(); renderTransactions(); showToast("Issued! Due: " + formatDate(d.dueDate), "success"); } else showToast(d.message, "error");
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
  apiGet("/transactions").then(function (txs) {
    if (user && user.role === "student") txs = txs.filter(function (t) { return t.userName === user.name; });
    var tb = document.getElementById("transactions-table-body");
    if (txs.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No transactions.</p></td></tr>'; return; }
    tb.innerHTML = txs.map(function (t) {
      var f = calculateFine(t);
      var status, action;
      if (t.status === "issued") {
        status = new Date() > new Date(t.dueDate) ? '<span class="badge badge-danger">Overdue</span>' : '<span class="badge badge-warning">Issued</span>';
        action = admin ? '<button class="btn btn-success btn-sm" onclick="returnBook(\'' + (t._id || t.id) + "')\">" + "Return</button>" : "";
      } else { status = '<span class="badge badge-success">Returned</span>'; action = "--"; }
      var fine = f > 0 ? '<span style="color:var(--danger);font-weight:700">\u20B9' + f + "</span>" : '<span style="color:var(--text-muted)">\u20B90</span>';
      return '<tr><td style="color:var(--text-primary);font-weight:500">' + (t.bookTitle || "Deleted") + "</td><td>" + (t.userName || "?") + "</td><td>" + formatDate(t.issueDate) + "</td><td>" + formatDate(t.dueDate) + "</td><td>" + status + "</td><td>" + fine + "</td>" + (admin ? "<td>" + action + "</td>" : "") + "</tr>";
    }).join("");
  });
}

// ============ DIGITAL LIBRARY ============
function renderDigitalLibrary() {
  var search = (document.getElementById("ebook-search") || {}).value || "";
  search = search.toLowerCase();
  apiGet("/ebooks").then(function (ebooks) {
    var filtered = ebooks.filter(function (e) {
      return e.title.toLowerCase().includes(search) || e.author.toLowerCase().includes(search) || e.category.toLowerCase().includes(search);
    });
    var grid = document.getElementById("ebooks-grid");
    if (!grid) return;
    if (filtered.length === 0) { grid.innerHTML = '<p class="empty-state">No eBooks found.</p>'; return; }
    grid.innerHTML = filtered.map(function (e) {
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
  document.querySelectorAll(".modal-overlay").forEach(function (m) {
    m.addEventListener("click", function (e) { if (e.target === m) m.style.display = "none"; });
  });
});
