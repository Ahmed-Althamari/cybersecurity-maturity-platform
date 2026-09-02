-- Audit log immutability (docs/security-architecture.md's "Known gaps" #5):
-- application-level enforcement alone means a compromised or buggy app
-- process could still UPDATE an audit_events row to launder history. This
-- trigger makes that impossible at the database level, unconditionally,
-- for every role and every connection -- there is no bypass flag, because
-- a bypass the app's own credentials could flip would defeat the point.
--
-- Deliberately scoped to UPDATE only, not DELETE. No application code path
-- ever updates an audit_events row (grep confirms it), so this is a purely
-- additive guarantee with nothing to break. DELETE is a different story:
-- AuditEvent.tenantId has `onDelete: Cascade` -- deleting a Tenant (a real,
-- legitimate operation: account offboarding, GDPR erasure) cascades into
-- deleting that tenant's audit_events rows via the same DELETE machinery a
-- row-level trigger can't distinguish from a direct, illegitimate DELETE
-- against this table. Blocking DELETE unconditionally would have broken
-- that cascade -- found by tracing the schema's own onDelete behavior
-- before writing this migration, not by trial and error against a broken
-- tenant-deletion path. Blocking UPDATE gets the actual threat this gap
-- describes (silently rewriting history) without that collateral risk.
CREATE OR REPLACE FUNCTION prevent_audit_events_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events rows are immutable: UPDATE is not permitted (INSERT and SELECT are; DELETE only via a parent Tenant/User''s own lifecycle cascade)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_update();
