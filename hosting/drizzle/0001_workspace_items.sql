CREATE TABLE IF NOT EXISTS workspace_items (
 owner TEXT NOT NULL, bucket TEXT NOT NULL, item_id TEXT NOT NULL, ordinal INTEGER NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(owner,bucket,item_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspace_receipts (
 owner TEXT NOT NULL, operation TEXT NOT NULL, result TEXT NOT NULL, expires INTEGER NOT NULL,
 PRIMARY KEY(owner,operation)
);
