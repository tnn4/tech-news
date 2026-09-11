console.log("index.js loading...");

// import initSqlHttpVfs from "https://esm.sh/sql.js-httpvfs@0.8.12";
// import initSqlJs from "https://esm.sh/sql.js@1.12.0";

let dbInstance = null;
// let activeMode = null;

const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "more",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "other",
  "our",
  "out",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your",
  "com",
  "http",
  "https",
  "www",
  "don",
  "hasn",
  "haven",
  "isn",
  "wasn",
  "wouldn",
]);

const TECH_WORDS = new Set([
  // Software Development & Architecture
  "algorithm",
  "api",
  "application",
  "architecture",
  "automation",
  "backend",
  "branch",
  "bug",
  "cicd",
  "class",
  "client",
  "code",
  "commit",
  "compiler",
  "computing",
  "console",
  "database",
  "debugging",
  "dependency",
  "deploy",
  "deployment",
  "developer",
  "development",
  "engineer",
  "environment",
  "fork",
  "framework",
  "frontend",
  "fullstack",
  "function",
  "hardware",
  "hotfix",
  "infrastructure",
  "integration",
  "interface",
  "interpreter",
  "issue",
  "library",
  "logging",
  "merge",
  "method",
  "migration",
  "module",
  "monitoring",
  "network",
  "object",
  "optimization",
  "package",
  "patch",
  "pipeline",
  "platform",
  "production",
  "program",
  "protocol",
  "pull",
  "push",
  "refactoring",
  "release",
  "repository",
  "runtime",
  "script",
  "server",
  "shell",
  "software",
  "staging",
  "syntax",
  "system",
  "terminal",
  "testing",
  "update",
  "variable",
  "version",

  // Cloud, DevOps & Infrastructure
  "authentication",
  "authorization",
  "availability",
  "backups",
  "bandwidth",
  "bucket",
  "cluster",
  "container",
  "cookie",
  "cybersecurity",
  "decryption",
  "dns",
  "docker",
  "edge",
  "encryption",
  "failover",
  "firewall",
  "gateway",
  "instance",
  "ip",
  "kubernetes",
  "lambda",
  "latency",
  "loadbalancer",
  "microservices",
  "node",
  "oauth",
  "orchestration",
  "pod",
  "proxy",
  "recovery",
  "redundancy",
  "scalability",
  "security",
  "serverless",
  "session",
  "ssl",
  "storage",
  "throughput",
  "tls",
  "token",
  "virtualization",
  "volume",
  "vulnerability",

  // Artificial Intelligence, Data & Modern Tech
  "agent",
  "ai",
  "analytics",
  "ar",
  "artificial",
  "blockchain",
  "copilot",
  "crypto",
  "data",
  "dataset",
  "decentralized",
  "deep",
  "exploit",
  "generative",
  "inference",
  "intelligence",
  "iot",
  "learning",
  "ledger",
  "llm",
  "machine",
  "malware",
  "metaverse",
  "model",
  "neural",
  "prompt",
  "quantum",
  "smart",
  "threat",
  "training",
  "transformer",
  "vr",
  "web3",

  // Agile, Product & Tech Business
  "accessibility",
  "agile",
  "backlog",
  "conversion",
  "dashboard",
  "design",
  "epic",
  "experience",
  "feature",
  "internationalization",
  "kanban",
  "localization",
  "metric",
  "milestone",
  "prototype",
  "retention",
  "roadmap",
  "scrum",
  "sprint",
  "story",
  "telemetry",
  "ticket",
  "ui",
  "user",
  "ux",
  "wireframe",
]);

// Universal SQL query wrapper
async function runQuery(sql, params = []) {
  if (!dbInstance) throw new Error("Database engine not initialized.");
  /*
  if (activeMode === "vfs") {
    return await dbInstance.db.query(sql, params);
  } else {

  }
 */
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/*
// Init VFS
async function tryInitVfs() {
  const workerUrl =
    "https://esm.sh/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js";
  const wasmUrl = "https://esm.sh/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm";

  const response = await fetch(workerUrl);
  if (!response.ok) throw new Error(`Worker HTTP status: ${response.status}`);
  const scriptText = await response.text();
  const blobWorkerUrl = URL.createObjectURL(
    new Blob([scriptText], { type: "application/javascript" }),
  );

  return await initSqlHttpVfs.createDbWorker(
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
    blobWorkerUrl,
    wasmUrl,
  );
}
*/

// Init Memory
/*
async function tryInitMemory() {
  const SQL = await initSqlJs({
    locateFile: (file) => `https://esm.sh/sql.js@1.12.0/dist/${file}`,
  });
  const response = await fetch("hn_archive.db");
  if (!response.ok) throw new Error(`DB HTTP status: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return new SQL.Database(new Uint8Array(buffer));
}
*/

async function tryInitMemory() {
  console.log("Fetching from hn_archive.db");
  const response = await fetch("hn_archive.db");
  if (!response.ok) throw new Error(`DB HTTP status: ${response.status}`);
  const buffer = await response.arrayBuffer();

  const SQL = await initSqlJs({
    locateFile: (file) =>
      `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`,
  });

  return new SQL.Database(new Uint8Array(buffer));
}

// Initialize and boot analytics
async function initDatabase() {
  console.log("starting db init...");
  const searchResultsEl = document.getElementById("search-results");
  const urlParams = new URLSearchParams(window.location.search);
  const forcedMode = urlParams.get("mode")?.toLowerCase();

  /*
  if (forcedMode === "memory") {
    try {
      console.log("Trying memory mode...");
      dbInstance = await tryInitMemory();
      activeMode = "memory";
      onDatabaseReady("In-Memory mode");
      console.log("Memory mode success");
      return;
    } catch (err) {
      console.error("Failed to force In-Memory mode:", err);
    }
  }
    */

  /*
  try {
    console.log("trying VFS...");
    dbInstance = await tryInitVfs();
    activeMode = "vfs";
    onDatabaseReady("HTTP Range VFS mode");
    console.log("VFS success");
    return;
  } catch (err) {
    console.warn("HTTP VFS failed. Falling back to In-Memory:", err);
  }
    */

  try {
    console.log("Trying memory mode...");
    dbInstance = await tryInitMemory();
    // activeMode = "memory";
    onDatabaseReady("Using In-Memory mode");
    console.log("Memory mode success");
  } catch (err) {
    console.error("Critical: Database loading failed:", err);
    if (searchResultsEl)
      searchResultsEl.textContent = "Error initializing database search.";
  }
}

async function onDatabaseReady(modeName) {
  const searchResultsEl = document.getElementById("search-results");
  if (searchResultsEl) {
    searchResultsEl.textContent = `Database ready (${modeName}).`;
  }

  // Execute database queries once DB instance is fully mounted
  await loadTopEntries();
  await generateClientSideAnalytics();
}

// Render Top 10 Entries directly from DB
async function loadTopEntries() {
  const tbody = document.getElementById("top-entries-tbody");
  if (!tbody || !dbInstance) return;

  try {
    const results = await runQuery(
      "SELECT id, by, story_title, text FROM comments ORDER BY created_at DESC LIMIT 10",
    );

    if (!results || results.length === 0) {
      tbody.innerHTML =
        "<tr><td colspan='3'>No comments found in database.</td></tr>";
      return;
    }

    tbody.innerHTML = results
      .map((row) => {
        const cleanText = stripHtml(row.text || "");
        return `
        <tr>
          <td><strong>${escapeHtml(row.by || "anonymous")}</strong></td>
          <td>${escapeHtml(row.story_title || "N/A")}</td>
          <td class="comment-text">${escapeHtml(cleanText.slice(0, 140))}...</td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    console.error("Failed to load top entries:", err);
    tbody.innerHTML =
      "<tr><td colspan='3'>Error loading entries from database.</td></tr>";
  }
}

// Browser-side Tokenization and Analytics Pipeline
async function generateClientSideAnalytics() {
  try {
    const rows = await runQuery(
      "SELECT text FROM comments WHERE text IS NOT NULL",
    );
    const frequencyMap = new Map();

    for (let i = 0; i < rows.length; i++) {
      const plainText = stripHtml(rows[i].text.toLowerCase());
      const words = plainText.match(/\b[a-z0-9+#.-]+\b/g) || [];

      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        if (TECH_WORDS.has(word) && !STOP_WORDS.has(word)) {
          frequencyMap.set(word, (frequencyMap.get(word) || 0) + 1);
        }
      }
    }

    const sortedTerms = Array.from(frequencyMap.entries())
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    renderWordCloud(sortedTerms);
    renderKeywordChart(sortedTerms);

    /*
    const metaEl = document.getElementById("meta-info");
    if (metaEl) {
      metaEl.textContent = `Analyzed ${rows.length} comments dynamically in browser (${activeMode.toUpperCase()} mode).`;
    }

    */
  } catch (err) {
    console.error("Client analytics failure:", err);
  }
}

function renderWordCloud(keywordData) {
  const ctx = document.getElementById("wordCloudCanvas");
  if (!ctx || !keywordData.length) return;

  const existingChart = Chart.getChart("wordCloudCanvas");
  if (existingChart) existingChart.destroy();

  new Chart(ctx, {
    type: "wordCloud",
    data: {
      labels: keywordData.map((k) => k.term),
      datasets: [
        {
          label: "Frequency",
          data: keywordData.map((k) => 12 + k.count * 1.5),
          color: "#ff6600",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}

function renderKeywordChart(keywordData) {
  const ctx = document.getElementById("keywordChart");
  if (!ctx) return;

  const existingChart = Chart.getChart("keywordChart");
  if (existingChart) existingChart.destroy();

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: keywordData.slice(0, 15).map((k) => k.term),
      datasets: [
        {
          label: "Occurrences",
          data: keywordData.slice(0, 15).map((k) => k.count),
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

async function searchCustomKeyword() {
  const inputEl = document.getElementById("custom-search-input");
  const resultsEl = document.getElementById("search-results");

  if (!inputEl || !resultsEl || !dbInstance) return;
  const input = inputEl.value.trim();
  if (!input) return;

  try {
    resultsEl.textContent = "Searching database...";
    const sanitizedInput = `"${input.replace(/"/g, '""')}"`;
    const result = await runQuery(
      "SELECT COUNT(*) as cnt FROM comments WHERE text MATCH ?",
      [sanitizedInput],
    );

    const count = result[0]?.cnt || 0;
    resultsEl.textContent = `Term "${input}" matches ${count} comment(s) in database.`;
  } catch (err) {
    console.error("Query failed:", err);
    resultsEl.textContent = `Query error: ${err.message || "Invalid search syntax"}`;
  }
}

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
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

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM ready");
  initDatabase();
  const searchBtn = document.getElementById("search-btn");
  if (searchBtn) searchBtn.addEventListener("click", searchCustomKeyword);
});
