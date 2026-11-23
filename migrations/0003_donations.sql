-- Donation ledger, claim codes, and bonus grants are JSON documents in app_documents.
CREATE TABLE IF NOT EXISTS app_documents (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
