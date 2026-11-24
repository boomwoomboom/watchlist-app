// ===== 1. DATA =====
const STORAGE_KEY = "watchlist-items";
const THEME_KEY = "watchlist-theme";
const TYPES = ["TV show", "Movie", "Anime"];

function loadItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
}

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    // If saving fails, the app still works, it just won't remember
  }
}

let items = loadItems() || [
  { id: 1, title: "Example 1", type: "TV show", platform: "Netflix", notes: "Recommended by a friend", watched: false, rating: 0 },
  { id: 2, title: "Example 2", type: "Movie", platform: "Hulu", notes: "", watched: true, rating: 4 }
];

let currentFilter = "all";
let searchTerm = "";
let sortBy = "newest";

let editingId = null;
let lastDeleted = null;
let toastTimer = null;
let lastPickId = null;
let backupTimer = null;

// ===== 2. GRAB ELEMENTS FROM THE PAGE =====
const form = document.getElementById("add-form");
const list = document.getElementById("watchlist");
const filterButtons = document.querySelectorAll("#filters button");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");

const editDialog = document.getElementById("edit-dialog");
const editForm = document.getElementById("edit-form");
const pickDialog = document.getElementById("pick-dialog");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");

const themeBtn = document.getElementById("theme-btn");
const statsEmpty = document.getElementById("stats-empty");
const statsBody = document.getElementById("stats-body");
const backupStatus = document.getElementById("backup-status");
const importInput = document.getElementById("import-input");

// ===== 3. THEME (light / dark) =====
function applyTheme(theme, remember) {
  document.documentElement.dataset.theme = theme; // CSS reads this to swap colors
  themeBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  themeBtn.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " mode");

  if (remember) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (error) {}
  }
}

let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (error) {}
applyTheme(savedTheme === "light" ? "light" : "dark", false);

themeBtn.addEventListener("click", function () {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next, true);
});

// ===== 4. STATS WITH VISUALS =====
// Builds one row: a label, a colored bar, and a number
function makeBarRow(label, value, max, countText) {
  const row = document.createElement("div");
  row.className = "bar-row";

  const name = document.createElement("span");
  name.className = "bar-label";
  name.textContent = label;

  const track = document.createElement("div");
  track.className = "bar-track";
  track.setAttribute("aria-hidden", "true"); // the number beside it says the same thing

  const fill = document.createElement("div");
  fill.className = "bar-fill";
  fill.style.width = (max > 0 ? (value / max) * 100 : 0) + "%";
  track.appendChild(fill);

  const count = document.createElement("span");
  count.className = "bar-count";
  count.textContent = countText;

  row.append(name, track, count);
  return row;
}

function renderStats() {
  const total = items.length;
  statsEmpty.hidden = total > 0;
  statsBody.hidden = total === 0;
  if (total === 0) return;

  const watchedItems = items.filter(function (i) { return i.watched; });
  const watchedCount = watchedItems.length;
  const rated = watchedItems.filter(function (i) { return i.rating > 0; });

  // The four number cards
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-watched").textContent = watchedCount;
  document.getElementById("stat-togo").textContent = total - watchedCount;

  let avgText = "–";
  if (rated.length > 0) {
    const sum = rated.reduce(function (t, i) { return t + i.rating; }, 0);
    avgText = (sum / rated.length).toFixed(1) + "★";
  }
  document.getElementById("stat-avg").textContent = avgText;

  // Progress bar: how much of your list is watched
  const progress = document.getElementById("progress-bars");
  progress.innerHTML = "";
  progress.appendChild(makeBarRow("Watched", watchedCount, total, watchedCount + " of " + total));

  // One bar per type
  const typeBars = document.getElementById("type-bars");
  typeBars.innerHTML = "";
  TYPES.forEach(function (type) {
    const count = items.filter(function (i) { return i.type === type; }).length;
    typeBars.appendChild(makeBarRow(type, count, total, String(count)));
  });

  // One bar per star rating, 5 down to 1
  const ratingBars = document.getElementById("rating-bars");
  ratingBars.innerHTML = "";
  const stars = [5, 4, 3, 2, 1];
  const counts = stars.map(function (n) {
    return rated.filter(function (i) { return i.rating === n; }).length;
  });
  const biggest = Math.max.apply(null, counts.concat([1]));
  stars.forEach(function (n, index) {
    ratingBars.appendChild(makeBarRow(n + "★", counts[index], biggest, String(counts[index])));
  });
}

// ===== 5. RENDER =====
function render() {
  renderStats();
  list.innerHTML = "";

  const term = searchTerm.trim().toLowerCase();

  const visible = items.filter(function (item) {
    if (term && !item.title.toLowerCase().includes(term)) return false;
    if (currentFilter === "want") return !item.watched;
    if (currentFilter === "watched") return item.watched;
    return true;
  });

  visible.sort(function (a, b) {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
    if (sortBy === "oldest") return a.id - b.id;
    return b.id - a.id;
  });

  if (visible.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = items.length === 0
      ? "Nothing here yet. Add a title above to get started."
      : "No titles match. Try a different search or filter.";
    list.appendChild(empty);
    return;
  }

  visible.forEach(function (item) {
    const li = document.createElement("li");
    li.className = item.watched ? "item watched" : "item";
    li.dataset.id = item.id;

    li.innerHTML = `
      <div class="item-info">
        <h3 class="item-title"></h3>
        <p class="item-meta">
          <span class="badge"></span>
          <span class="platform"></span>
        </p>
        <p class="item-notes"></p>
        <div class="stars"></div>
      </div>
      <div class="item-actions">
        <button type="button" class="edit-btn">Edit</button>
        <button type="button" class="status-btn"></button>
        <button type="button" class="delete-btn">✕</button>
      </div>
    `;

    li.querySelector(".item-title").textContent = item.title;
    li.querySelector(".badge").textContent = item.type;
    li.querySelector(".platform").textContent = item.platform || "No platform set";
    li.querySelector(".status-btn").textContent = item.watched ? "Watched ✓" : "Want to watch";
    li.querySelector(".edit-btn").setAttribute("aria-label", "Edit " + item.title);
    li.querySelector(".delete-btn").setAttribute("aria-label", "Delete " + item.title);

    const notesEl = li.querySelector(".item-notes");
    if (item.notes) {
      notesEl.textContent = item.notes;
    } else {
      notesEl.remove();
    }

    const stars = li.querySelector(".stars");
    if (item.watched) {
      const rating = item.rating || 0;
      for (let n = 1; n <= 5; n++) {
        const star = document.createElement("button");
        star.type = "button";
        star.className = n <= rating ? "star on" : "star";
        star.dataset.rating = n;
        star.textContent = "★";
        star.setAttribute("aria-label", "Rate " + n + " out of 5");
        stars.appendChild(star);
      }
    } else {
      stars.remove();
    }

    list.appendChild(li);
  });
}

render();

// ===== 6. UNDO MESSAGE (the "toast") =====
function showToast(message) {
  toastText.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  toast.hidden = true;
  lastDeleted = null;
}

document.getElementById("toast-undo").addEventListener("click", function () {
  if (!lastDeleted) return;
  items.splice(lastDeleted.index, 0, lastDeleted.item);
  saveItems();
  render();
  hideToast();
});

// ===== 7. ADD A TITLE =====
form.addEventListener("submit", function (event) {
  event.preventDefault();

  const title = document.getElementById("title").value.trim();
  const typeSelect = document.getElementById("type");
  const type = typeSelect.options[typeSelect.selectedIndex].text;
  const platform = document.getElementById("platform").value.trim();
  const notes = document.getElementById("notes").value.trim();

  if (title === "") return;

  items.unshift({
    id: Date.now(),
    title: title,
    type: type,
    platform: platform,
    notes: notes,
    watched: false,
    rating: 0
  });

  saveItems();
  form.reset();
  render();
});

// ===== 8. EDIT, STATUS, DELETE AND STAR BUTTONS =====
list.addEventListener("click", function (event) {
  const card = event.target.closest(".item");
  if (!card) return;

  const id = Number(card.dataset.id);
  const item = items.find(function (i) { return i.id === id; });
  if (!item) return;

  if (event.target.closest(".edit-btn")) {
    editingId = id;
    document.getElementById("edit-title").value = item.title;
    document.getElementById("edit-type").value = item.type;
    document.getElementById("edit-platform").value = item.platform || "";
    document.getElementById("edit-notes").value = item.notes || "";
    editDialog.showModal();
    return;
  }

  if (event.target.closest(".status-btn")) {
    item.watched = !item.watched;
    if (!item.watched) item.rating = 0;
    saveItems();
    render();
    return;
  }

  if (event.target.closest(".delete-btn")) {
    const index = items.findIndex(function (i) { return i.id === id; });
    lastDeleted = { item: item, index: index };
    items.splice(index, 1);
    saveItems();
    render();
    showToast("Deleted “" + lastDeleted.item.title + "”.");
    return;
  }

  const star = event.target.closest(".star");
  if (star) {
    const clicked = Number(star.dataset.rating);
    item.rating = item.rating === clicked ? 0 : clicked;
    saveItems();
    render();
  }
});

editForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const item = items.find(function (i) { return i.id === editingId; });
  if (!item) return;

  item.title = document.getElementById("edit-title").value.trim() || item.title;
  item.type = document.getElementById("edit-type").value;
  item.platform = document.getElementById("edit-platform").value.trim();
  item.notes = document.getElementById("edit-notes").value.trim();

  saveItems();
  render();
  editDialog.close();
});

document.getElementById("edit-cancel").addEventListener("click", function () {
  editDialog.close();
});

// ===== 9. FILTERS, SEARCH AND SORT =====
filterButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    currentFilter = button.dataset.filter;

    filterButtons.forEach(function (b) {
      b.classList.toggle("active", b === button);
    });

    render();
  });
});

searchInput.addEventListener("input", function () {
  searchTerm = searchInput.value;
  render();
});

sortSelect.addEventListener("change", function () {
  sortBy = sortSelect.value;
  render();
});

// ===== 10. PICK SOMETHING FOR ME =====
function pickRandom() {
  const pool = items.filter(function (i) { return !i.watched; });

  const titleEl = document.getElementById("pick-title");
  const metaEl = document.getElementById("pick-meta");
  const notesEl = document.getElementById("pick-notes");
  const againBtn = document.getElementById("pick-again");

  if (pool.length === 0) {
    titleEl.textContent = "Nothing to pick yet";
    metaEl.textContent = "Add a title to your “Want to watch” list first.";
    notesEl.textContent = "";
    againBtn.hidden = true;
    lastPickId = null;
  } else {
    let choice = pool[Math.floor(Math.random() * pool.length)];

    while (pool.length > 1 && choice.id === lastPickId) {
      choice = pool[Math.floor(Math.random() * pool.length)];
    }
    lastPickId = choice.id;

    titleEl.textContent = choice.title;
    metaEl.textContent = choice.type + (choice.platform ? " · " + choice.platform : "");
    notesEl.textContent = choice.notes || "";
    againBtn.hidden = pool.length < 2;
  }

  if (!pickDialog.open) pickDialog.showModal();
}

document.getElementById("pick-btn").addEventListener("click", pickRandom);
document.getElementById("pick-again").addEventListener("click", pickRandom);
document.getElementById("pick-close").addEventListener("click", function () {
  pickDialog.close();
});

// ===== 11. EXPORT AND IMPORT =====
function showBackupMessage(message) {
  backupStatus.textContent = message;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(function () { backupStatus.textContent = ""; }, 8000);
}

// Export: turn the list into text, wrap it in a file, and download it
document.getElementById("export-btn").addEventListener("click", function () {
  const data = JSON.stringify(items, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "watchlist-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showBackupMessage("Exported " + items.length + (items.length === 1 ? " title." : " titles."));
});

// A file could contain anything, so we rebuild each title from scratch and
// keep only the fields we expect, with safe values.
function cleanItem(raw) {
  if (!raw || typeof raw.title !== "string") return null;

  const title = raw.title.trim().slice(0, 100);
  if (title === "") return null;

  const watched = raw.watched === true;
  let rating = Math.round(Number(raw.rating));
  if (!Number.isFinite(rating) || rating < 0 || !watched) rating = 0;
  if (rating > 5) rating = 5;

  const id = Number(raw.id);

  return {
    id: Number.isFinite(id) && id > 0 ? id : Date.now(),
    title: title,
    type: TYPES.includes(raw.type) ? raw.type : "TV show",
    platform: typeof raw.platform === "string" ? raw.platform.trim().slice(0, 60) : "",
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 200) : "",
    watched: watched,
    rating: rating
  };
}

document.getElementById("import-btn").addEventListener("click", function () {
  importInput.click(); // opens the file picker
});

importInput.addEventListener("change", async function () {
  const file = importInput.files[0];
  importInput.value = ""; // lets you pick the same file again later
  if (!file) return;

  if (file.size > 1000000) {
    showBackupMessage("That file is too large to be a watchlist backup.");
    return;
  }

  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error("Not a list");

    // Clean every title and make sure no two share an id
    const cleaned = [];
    const usedIds = new Set();
    let nextId = Date.now();

    data.forEach(function (raw) {
      const item = cleanItem(raw);
      if (!item) return;
      while (usedIds.has(item.id)) { item.id = nextId++; }
      usedIds.add(item.id);
      cleaned.push(item);
    });

    if (cleaned.length === 0) {
      showBackupMessage("No titles found in that file.");
      return;
    }

    const ok = confirm(
      "Replace your current list (" + items.length + " titles) with the " +
      cleaned.length + " titles in this file?"
    );
    if (!ok) {
      showBackupMessage("Import cancelled.");
      return;
    }

    items = cleaned;
    saveItems();
    hideToast();
    render();
    showBackupMessage("Imported " + cleaned.length + (cleaned.length === 1 ? " title." : " titles."));
  } catch (error) {
    showBackupMessage("Couldn’t read that file. Is it a watchlist backup (.json)?");
  }
});