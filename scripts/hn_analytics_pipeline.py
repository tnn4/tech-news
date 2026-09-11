import datetime
import json
import re
import sqlite3
import urllib.request
from collections import Counter
from pathlib import Path

DB_FILE = "hn_archive.db"

TRACKED_KEYWORDS = {
    "data center", "ai", "trump", "iran", "tariffs", "india", "it",
    "llm", "postgres", "linux", "wasm", "performance", "security"
}

STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", 
    "by", "can", "could", "did", "do", "does", "for", "from", "had", "has", "have", "he", "her",
    "here", "his", "how", "i", "if", "in", "into", "is", "it", "its", "just", "like", "more", 
    "my", "no", "not", "of", "on", "or", "other", "our", "out", "so", "than", "that", "the", 
    "their", "them", "then", "there", "these", "they", "this", "to", "was", "we", "were", 
    "what", "when", "where", "which", "who", "will", "with", "would", "you", "your"
}

MAX_THREAD_NUMBER=200

def init_db():
    """Create core tables, optimize page size for httpvfs, and setup FTS5."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 4096 byte page size optimal for HTTP Range requests
    cursor.execute("PRAGMA page_size = 4096;")
    cursor.execute("PRAGMA journal_mode = delete;")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY,
            by TEXT,
            text TEXT,
            story_title TEXT,
            created_at INTEGER,
            fetched_at TEXT
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON comments(created_at)")

    # FTS5 virtual table for lightning-fast client-side HTTP Range search
    cursor.execute("CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(text, content='comments', content_rowid='id');")
    
    conn.commit()
    conn.close()


def init_db_with_past_month_data_if_empty():
    """If database is newly initialized/empty, backfill comments from the last 30 days via Algolia API."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM comments")
    count = cursor.fetchone()[0]
    
    if count > 0:
        conn.close()
        return  # DB already initialized, skip backfill

    print("Empty database detected. Initiating 30-day historical seed...")

    # Calculate Unix timestamp for 30 days ago
    thirty_days_ago = int((datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)).timestamp())
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Algolia HN API endpoint targeting comments from the last 30 days
    page = 0
    total_fetched = 0
    max_pages = 10  # Adjust page count depending on desired initial depth (100 items per page)

    while page < max_pages:
        url = f"https://hn.algolia.com/api/v1/search_by_date?tags=comment&numericFilters=created_at_i>{thirty_days_ago}&hitsPerPage=100&page={page}"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())
                hits = data.get("hits", [])
                
                if not hits:
                    break

                for hit in hits:
                    comment_id = hit.get("objectID")
                    author = hit.get("author", "anonymous")
                    text = hit.get("comment_text", "")
                    story_title = hit.get("story_title", "Unknown")
                    created_at = hit.get("created_at_i")

                    if text and comment_id:
                        cursor.execute("""
                            INSERT OR REPLACE INTO comments (id, by, text, story_title, created_at, fetched_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (comment_id, author, text, story_title, created_at, now_iso))
                        total_fetched += 1

                page += 1
                time.sleep(0.2)  # Respect rate limits
        except Exception as e:
            print(f"Backfill error on page {page}: {e}")
            break

    conn.commit()
    conn.close()
    print(f"Historical seed complete. Inserted {total_fetched} comments into {DB_FILE}.")

def fetch_and_store_comments():
    """Fetch top HN comments and store in SQLite."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    top_stories_url = "https://hacker-news.firebaseio.com/v0/topstories.json"
    with urllib.request.urlopen(top_stories_url) as response:
        top_ids = json.loads(response.read().decode())[:10]

    fetched_count = 0
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for story_id in top_ids:
        story_url = f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json"
        with urllib.request.urlopen(story_url) as resp:
            story = json.loads(resp.read().decode())

        kids = story.get("kids", [])[:20]
        for comment_id in kids:
            c_url = f"https://hacker-news.firebaseio.com/v0/item/{comment_id}.json"
            with urllib.request.urlopen(c_url) as c_resp:
                comment = json.loads(c_resp.read().decode())
                if comment and "text" in comment and not comment.get("deleted"):
                    cursor.execute("""
                        INSERT OR REPLACE INTO comments (id, by, text, story_title, created_at, fetched_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        comment["id"],
                        comment.get("by", "anonymous"),
                        comment["text"],
                        story.get("title", "Unknown"),
                        comment.get("time"),
                        now_iso,
                    ))
                    fetched_count += 1

            if fetched_count >= MAX_THREAD_NUMBER:
                break
        if fetched_count >= MAX_THREAD_NUMBER:
            break

    conn.commit()
    conn.close()
    print(f"Stored/updated {fetched_count} comments in {DB_FILE}")

def prune_and_reindex():
    """Prune comments older than 6 months, update FTS index, and VACUUM."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    six_months_ago = int((datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=180)).timestamp())
    cursor.execute("DELETE FROM comments WHERE created_at < ?", (six_months_ago,))
    
    # Rebuild FTS5 index to match database state
    cursor.execute("INSERT INTO comments_fts(comments_fts) VALUES('rebuild')")
    
    conn.commit()
    cursor.execute("VACUUM")
    conn.close()

def generate_analytics_and_summaries():
    """Run aggregate queries and emit trend payloads."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Weekly Volume
    cursor.execute("""
        SELECT strftime('%Y-%W', created_at, 'unixepoch') as week, COUNT(*) 
        FROM comments 
        GROUP BY week 
        ORDER BY week ASC
    """)
    weekly_volume = [{"week": r[0], "count": r[1]} for r in cursor.fetchall()]

    # Text Analysis
    cursor.execute("SELECT id, by, text, story_title, created_at FROM comments WHERE text IS NOT NULL")
    all_rows = cursor.fetchall()

    tracked_counts = Counter()
    general_term_counts = Counter()
    comments_summary = []

    for r in all_rows:
        text = r[2]
        clean_text = re.sub(r"<[^>]+>", " ", text.lower())
        words = re.findall(r"\b[a-z0-9+#.-]+\b", clean_text)
        
        for w in words:
            if w in TRACKED_KEYWORDS:
                tracked_counts[w] += 1
            if len(w) >= 3 and w not in STOP_WORDS:
                general_term_counts[w] += 1

        comments_summary.append({
            "id": r[0], "by": r[1], "text": text, "story_title": r[3], "time": r[4]
        })

    # Monthly Average Length
    cursor.execute("""
        SELECT strftime('%Y-%m', created_at, 'unixepoch') as month, AVG(length(text)) 
        FROM comments 
        GROUP BY month 
        ORDER BY month ASC
    """)
    monthly_avg_length = [
        {"month": r[0], "avg_chars": round(r[1], 1)} for r in cursor.fetchall() if r[0]
    ]

    # Substantive Authors
    cursor.execute("""
        SELECT by, COUNT(*) as comment_count, AVG(length(text)) as avg_len
        FROM comments
        WHERE by != 'anonymous' AND by IS NOT NULL
        GROUP BY by
        HAVING comment_count >= 5
        ORDER BY avg_len DESC
        LIMIT 10
    """)
    substantive_authors = [
        {"author": r[0], "comments": r[1], "avg_chars": round(r[2], 1)}
        for r in cursor.fetchall()
    ]

    conn.close()

    # Emit trends_data.json
    trends_payload = {
        "analyzed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_comments_in_db": len(all_rows),
        "weekly_volume": weekly_volume,
        "keyword_distribution": [{"term": k, "count": v} for k, v in tracked_counts.most_common()],
        "top_general_terms": [{"term": k, "count": v} for k, v in general_term_counts.most_common(30)],
        "monthly_avg_length": monthly_avg_length,
        "top_authors": substantive_authors,
    }
    with open("trends_data.json", "w", encoding="utf-8") as f:
        json.dump(trends_payload, f, indent=2)

    # Emit summary.json
    summary_payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_in_db": len(comments_summary),
        "topics": [{
            "category": "Recent Top Discussions",
            "key_takeaway": "Summary of active community comments.",
            "highlights": comments_summary[:5],
        }],
    }
    with open("summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_payload, f, indent=2)

    print("Pipeline completed: Updated database, trends_data.json, and summary.json")

if __name__ == "__main__":
    init_db()
    init_db_with_past_month_data_if_empty()  # Runs ONCE when DB is first created
    fetch_and_store_comments()
    prune_and_reindex()
    generate_analytics_and_summaries()