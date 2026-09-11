import datetime
import json
import sqlite3
import time
import urllib.request

DB_FILE = "hn_archive.db"
MAX_THREAD_NUMBER = 200

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
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
    cursor.execute("CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(text, content='comments', content_rowid='id');")
    
    conn.commit()
    conn.close()

def init_db_with_past_month_data_if_empty():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM comments")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    print("Empty database detected. Initiating 30-day historical seed...")
    thirty_days_ago = int((datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)).timestamp())
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    page = 0
    total_fetched = 0
    max_pages = 10

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
                    if hit.get("comment_text") and comment_id:
                        cursor.execute("""
                            INSERT OR REPLACE INTO comments (id, by, text, story_title, created_at, fetched_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (comment_id, hit.get("author", "anonymous"), hit.get("comment_text", ""), hit.get("story_title", "Unknown"), hit.get("created_at_i"), now_iso))
                        total_fetched += 1
                page += 1
                time.sleep(0.2)
        except Exception as e:
            print(f"Backfill error on page {page}: {e}")
            break

    conn.commit()
    conn.close()
    print(f"Historical seed complete. Inserted {total_fetched} comments.")

def fetch_and_store_comments():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    with urllib.request.urlopen("https://hacker-news.firebaseio.com/v0/topstories.json") as response:
        top_ids = json.loads(response.read().decode())[:10]

    fetched_count = 0
    for story_id in top_ids:
        with urllib.request.urlopen(f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json") as resp:
            story = json.loads(resp.read().decode())

        for comment_id in story.get("kids", [])[:20]:
            with urllib.request.urlopen(f"https://hacker-news.firebaseio.com/v0/item/{comment_id}.json") as c_resp:
                comment = json.loads(c_resp.read().decode())
                if comment and "text" in comment and not comment.get("deleted"):
                    cursor.execute("""
                        INSERT OR REPLACE INTO comments (id, by, text, story_title, created_at, fetched_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (comment["id"], comment.get("by", "anonymous"), comment["text"], story.get("title", "Unknown"), comment.get("time"), now_iso))
                    fetched_count += 1

            if fetched_count >= MAX_THREAD_NUMBER:
                break
        if fetched_count >= MAX_THREAD_NUMBER:
            break

    conn.commit()
    conn.close()
    print(f"Stored/updated {fetched_count} comments.")

def prune_and_reindex():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    six_months_ago = int((datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=180)).timestamp())
    cursor.execute("DELETE FROM comments WHERE created_at < ?", (six_months_ago,))
    cursor.execute("INSERT INTO comments_fts(comments_fts) VALUES('rebuild')")
    conn.commit()
    cursor.execute("VACUUM")
    conn.close()

if __name__ == "__main__":
    init_db()
    init_db_with_past_month_data_if_empty()
    fetch_and_store_comments()
    prune_and_reindex()