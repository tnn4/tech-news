# Tech News and data analytics

Tech news and data analystics from hacker news.
**Architecture Overview**

```
 ┌─────────────────────────────────────────────────────────┐
 │                   GitHub Actions CI/CD                  │
 │                                                         │
 │  ┌──────────────────┐       ┌──────────────────────┐    │
 │  │ Hacker News API  │ ───►  │ hn_analytics_pipeline│    │
 │  └──────────────────┘       └──────────┬───────────┘    │
 └────────────────────────────────────────┼────────────────┘
                                          │ Builds & Updates
                                          ▼
 ┌─────────────────────────────────────────────────────────┐
 │                  GitHub Pages (Static)                  │
 │                                                         │
 │   hn_archive.db      trends_data.json    summary.json  │
 │   (SQLite + FTS5)    (Pre-computed)     (Pre-computed) │
 └─────────▲──────────────────┬───────────────────┬────────┘
           │                  │                   │
           │ Range Requests   │ Fetch             │ Fetch
           │ (4 KB Chunks)    │                   │
 ┌─────────┴──────────────────▼───────────────────▼────────┐
 │                      Client Browser                     │
 │                                                         │
 │   ┌─────────────────┐           ┌───────────────────┐   │
 │   │ sql.js-httpvfs  │           │   Chart.js / UI   │   │
 │   │  (Wasm Worker)  │           │   (index.js)      │   │
 │   └────────┬────────┘           └─────────▲─────────┘   │
 │            │                              │             │
 │            └────────── SQL Matches ───────┘             │
 └─────────────────────────────────────────────────────────┘

```

---

**Core Components**

- **Ingestion & Aggregation Engine (`hn_analytics_pipeline.py`)**
- **Data Fetching:** Polls the Hacker News Firebase REST API for top stories and comment trees.

- **Storage & Pruning:** Upserts raw comment payloads into `hn_archive.db`. Automatically prunes comments older than 6 months to enforce a strict memory footprint.

- **Pre-Processing:** Rebuilds the FTS5 index, runs database `VACUUM`, and computes frequency distributions, length metrics, and top authors into static `trends_data.json` and `summary.json` files.

- **Storage & Data Layer (`hn_archive.db`)**
- **Page Size:** Hard-configured to `4096` bytes (`PRAGMA page_size = 4096`) to match HTTP frame and OS disk sector boundaries.

- **Table Schema (`comments`):** Single source of truth containing fields `id`, `by`, `text`, `story_title`, `created_at`, and `fetched_at`.

- **Full-Text Search Virtual Table (`comments_fts`):** FTS5 external content table indexing `text` for fast string lookup without duplicate storage overhead.

- **Client-Side Query Engine (`sql.js-httpvfs`)**
- **Virtual File System Worker:** Runs SQLite inside a WebAssembly Web Worker off the main browser thread.

- **HTTP Range Fetching:** Translates SQLite B-Tree index lookups into targeted `Range: bytes=X-Y` requests over standard HTTP. Fetches ~4 KB index chunks on demand rather than downloading the entire database.

- **Frontend Dashboard (`index.html` & `index.js`)**
- **Pre-Rendered Visualizations:** Instantly populates Chart.js charts and author tables from `trends_data.json` on page load.

- **Interactive Search Bar:** Routes user-typed input through `sql.js-httpvfs` directly into the FTS5 table via `SELECT COUNT(*) FROM comments_fts WHERE text MATCH ?`.

---

**Data Flow Architecture**

1. **Pipeline Execution (Daily Cron / GitHub Actions):**

- GitHub Actions runs `hn_analytics_pipeline.py` daily.

- Pipeline fetches new top comments, deletes records > 180 days old, rebuilds FTS indexes, runs `VACUUM`, and saves back to repository storage.

2. **Static Dashboard Page Load:**

- GitHub Pages serves static web assets (`index.html`, `index.js`, `trends_data.json`, `hn_archive.db`).

- `index.js` fetches `trends_data.json` to instantly render summary charts and tables.

3. **On-Demand User Keyword Search:**

- User enters a custom search string into the search input box.

- `sql.js-httpvfs` sends range-header HTTP requests to `hn_archive.db` to read index nodes.

- Matches are returned locally in the browser interface without hitting external APIs or backend servers.
