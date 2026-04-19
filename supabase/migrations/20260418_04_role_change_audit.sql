-- Phase 8 / M7: Role change audit log
--
-- Every admin-driven role change (promotion, demotion, invite-with-role, delete)
-- writes a row here. No policies -> only service_role can read/write.

CREATE TABLE IF NOT EXISTS role_change_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL,
  target_id UUID NOT NULL,
  old_role TEXT,
  new_role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('invite', 'promote', 'demote', 'delete')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_change_audit_target
  ON role_change_audit (target_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_change_audit_actor
  ON role_change_audit (actor_id, changed_at DESC);

ALTER TABLE role_change_audit ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.
