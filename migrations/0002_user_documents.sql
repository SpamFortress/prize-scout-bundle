-- Browser documents stay in app_documents. Keys look like <browserid>-checks.
CREATE INDEX IF NOT EXISTS app_documents_key ON app_documents(key);
