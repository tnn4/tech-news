import initSqlHttpVfs from "https://esm.sh/sql.js-httpvfs@0.8.12";
const { createDbWorker } = initSqlHttpVfs;

let dbWorker = null;

// Initialize WebAssembly SQLite HTTP VFS Worker
async function initHttpVfs() {
  const searchResultsEl = document.getElementById("search-results");
  try {
    const workerUrl =
      "https://esm.sh/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js";
    const wasmUrl = "https://esm.sh/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm";

    dbWorker = await createDbWorker(
      [
        {
          from: "inline",
          config: {
            serverMode: "full",
            url: "hn_archive.db",
            requestChunkSize: 4096,
          },
        },
      ],
      workerUrl,
      wasmUrl,
    );

    if (searchResultsEl) {
      searchResultsEl.textContent =
        "SQLite HTTP VFS ready. Enter a keyword above.";
    }

    // Load top 10 recent entries directly from SQLite once initialized
    loadTopEntries();
  } catch (err) {
    console.error("Failed to initialize sql.js-httpvfs worker:", err);
    if (searchResultsEl) {
      searchResultsEl.textContent =
        "Error initializing client-side database search.";
    }
  }
}

// Fetch top 10 recent entries via HTTP range queries
async function loadTopEntries() {
  const tbody = document.getElementById("top-entries-tbody");
  if (!tbody || !dbWorker) return;

  try {
    const results = await dbWorker.db.query(
      "SELECT by, story_title, text FROM comments ORDER BY created_at DESC LIMIT 10",
    );

    if (!results || results.length === 0) {
      tbody.innerHTML =
        "<tr><td colspan='3'>No comments found in database.</td></tr>";
      return;
    }

    tbody.innerHTML = results
      .map(
        (row) => `
        <tr>
          <td><strong>${escapeHtml(row.by || "anonymous")}</strong></td>
          <td>${escapeHtml(row.story_title || "N/A")}</td>
          <td class="comment-text">${escapeHtml((row.text || "").slice(0, 140))}...</td>
        </tr>
      `,
      )
      .join("");
  } catch (err) {
    console.error("Failed to load top entries from DB:", err);
    tbody.innerHTML =
      "<tr><td colspan='3'>Error loading entries from database.</td></tr>";
  }
}

// Render Word Cloud using Chart.js Matrix/WordCloud plugin
function renderWordCloud(keywordData) {
  const ctx = document.getElementById("wordCloudCanvas");
  if (!ctx || !keywordData) return;

  const words = keywordData.map((k) => ({
    key: k.term,
    value: k.count,
  }));

  new Chart(ctx, {
    type: "wordCloud",
    data: {
      labels: words.map((w) => w.key),
      datasets: [
        {
          label: "Frequency",
          data: words.map((w) => 10 + w.value * 2), // Scale font sizes
          color: "#ff6600",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
    },
  });
}

// Perform FTS search via httpvfs
async function searchCustomKeyword() {
  const inputEl = document.getElementById("custom-search-input");
  const resultsEl = document.getElementById("search-results");

  if (!inputEl || !resultsEl) return;
  const input = inputEl.value.trim();
  if (!input) return;

  if (!dbWorker) {
    resultsEl.textContent = "Database connection initializing...";
    return;
  }

  try {
    resultsEl.textContent = "Searching via range requests...";

    // Escaped string match for FTS5
    const sanitizedInput = `"${input.replace(/"/g, '""')}"`;
    const result = await dbWorker.db.query(
      "SELECT COUNT(*) as cnt FROM comments_fts WHERE text MATCH ?",
      [sanitizedInput],
    );

    const count = result[0]?.cnt || 0;
    resultsEl.textContent = `Term "${input}" matches ${count} comment(s) in the database.`;
  } catch (err) {
    console.error("Query failed:", err);
    resultsEl.textContent = `Query error: ${err.message || "Invalid search syntax"}`;
  }
}

// Initializations
document.addEventListener("DOMContentLoaded", () => {
  initHttpVfs();
  startRefreshTimer();

  const searchBtn = document.getElementById("search-btn");
  if (searchBtn) {
    searchBtn.addEventListener("click", searchCustomKeyword);
  }

  // Load static analytics JSON payload
  fetch("trends_data.json")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP status: ${res.status}`);
      return res.json();
    })
    .then((trends) => {
      renderMetadata(trends);
      renderWordCloud(trends.keyword_distribution);
      renderKeywordChart(trends.keyword_distribution);
      renderLengthChart(trends.monthly_avg_length);
      renderAuthorsTable(trends.top_authors);
    })
    .catch((err) => console.error("Failed to load trends_data.json:", err));
});

function renderMetadata(data) {
  const metaEl = document.getElementById("meta-info");
  if (metaEl) {
    metaEl.textContent = `Based on ${data.total_comments_in_db} stored comments in database (Updated: ${new Date(data.analyzed_at).toLocaleString()})`;
  }
}

function renderKeywordChart(keywordData) {
  const ctx = document.getElementById("keywordChart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: keywordData.map((k) => k.term),
      datasets: [
        {
          label: "Occurrences",
          data: keywordData.map((k) => k.count),
          backgroundColor: "#ff6600",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
    },
  });
}

function renderLengthChart(lengthData) {
  const ctx = document.getElementById("lengthChart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "line",
    data: {
      labels: lengthData.map((m) => m.month),
      datasets: [
        {
          label: "Avg Character Count",
          data: lengthData.map((m) => m.avg_chars),
          borderColor: "#4caf50",
          tension: 0.2,
        },
      ],
    },
    options: { responsive: true },
  });
}

function renderAuthorsTable(authors) {
  const tbody = document.getElementById("authors-tbody");
  if (!tbody) return;

  tbody.innerHTML = authors
    .map(
      (a) => `
        <tr>
            <td><strong>${escapeHtml(a.author)}</strong></td>
            <td>${a.comments}</td>
            <td>${a.avg_chars} characters</td>
        </tr>
    `,
    )
    .join("");
}

function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
}

function startRefreshTimer() {
  const timerEl = document.getElementById("refresh-timer");
  if (!timerEl) return;

  function updateTimer() {
    const now = new Date();
    const nowUtcHours = now.getUTCHours();
    const nextIntervalHour = (Math.floor(nowUtcHours / 6) + 1) * 6;

    const target = new Date(now);
    target.setUTCHours(nextIntervalHour, 0, 0, 0);

    const diffMs = target - now;

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, "0");
    timerEl.textContent = `Next scheduled database refresh in: ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s (00:00, 06:00, 12:00, 18:00 UTC)`;
  }

  updateTimer();
  setInterval(updateTimer, 1000);
}
