import sqlite3
from pathlib import Path

migration = Path("migrations/0001_workspace_review_foundation.sql").read_text(encoding="utf-8")
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")
db.executescript(migration)

tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
expected = {"workspaces", "workspace_members", "notion_connections", "review_batches", "review_items", "review_events", "review_link_tokens"}
assert expected <= tables, f"Missing tables: {expected - tables}"

db.execute("INSERT INTO workspaces (id, slug, name) VALUES ('w1', 'studio', 'Studio')")
db.execute("INSERT INTO workspaces (id, slug, name) VALUES ('w2', 'client', 'Client')")
db.execute("INSERT INTO workspace_members (id, workspace_id, email, role) VALUES ('m1', 'w1', 'owner@example.com', 'owner')")
db.execute("INSERT INTO review_batches (id, workspace_id, title, created_by) VALUES ('b1', 'w1', 'Primeira revisão', 'm1')")
db.execute("INSERT INTO review_batches (id, workspace_id, title, created_by) VALUES ('b2', 'w2', 'Revisão de cliente', 'm1')")
db.execute("INSERT INTO review_items (id, batch_id, notion_page_id) VALUES ('i1', 'b1', 'notion-page-1')")
db.execute("INSERT INTO review_items (id, batch_id, notion_page_id) VALUES ('i2', 'b2', 'notion-page-2')")
db.execute("INSERT INTO review_events (id, workspace_id, batch_id, item_id, action, comment) VALUES ('e1', 'w1', 'b1', 'i1', 'commented', 'Ajustar legenda')")

for statement in [
    "UPDATE review_events SET comment='alterado' WHERE id='e1'",
    "DELETE FROM review_events WHERE id='e1'",
]:
    try:
        db.execute(statement)
        raise AssertionError(f"Append-only protection failed: {statement}")
    except sqlite3.IntegrityError as error:
        assert "append-only" in str(error)

for statement in [
    "INSERT INTO workspace_members (id, workspace_id, email, role) VALUES ('m2', 'w1', 'bad@example.com', 'superuser')",
    "INSERT INTO review_events (id, workspace_id, batch_id, item_id, action) VALUES ('e2', 'w1', 'b1', 'i1', 'deleted')",
    "INSERT INTO review_events (id, workspace_id, batch_id, item_id, action) VALUES ('e3', 'w2', 'b1', 'i1', 'commented')",
    "INSERT INTO review_events (id, workspace_id, batch_id, item_id, action) VALUES ('e4', 'w1', 'b2', 'i1', 'commented')",
    "INSERT INTO review_events (id, workspace_id, batch_id, item_id, action) VALUES ('e5', 'w1', 'b1', 'i2', 'commented')",
]:
    try:
        db.execute(statement)
        raise AssertionError(f"Constraint failed to reject invalid data: {statement}")
    except sqlite3.IntegrityError:
        pass

assert db.execute("SELECT COUNT(*) FROM review_events").fetchone()[0] == 1
db.execute("INSERT INTO review_link_tokens (id, batch_id, token_hash, expires_at) VALUES ('t1', 'b1', 'sha256-hash', '2030-01-01T00:00:00Z')")
print("PASS: D1 migration executes in SQLite")
print("PASS: workspace, membership, review batch, item, event and link schema")
print("PASS: role and review-action constraints")
print("PASS: cross-workspace and cross-batch review events are rejected")
print("PASS: review event history is enforced as append-only")
