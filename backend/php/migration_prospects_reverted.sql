-- Adds tracking columns so reverted leads (from Opportunity/Contract) are
-- highlighted and pinned at the top of the prospects list until processed.
ALTER TABLE crminternet_prospects
  ADD COLUMN reverted_at DATETIME NULL,
  ADD COLUMN reverted_from VARCHAR(20) NULL;

CREATE INDEX idx_prospects_reverted_at ON crminternet_prospects (reverted_at);
