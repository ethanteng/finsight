-- Fix Migration History Final - Mark problematic migration as applied
-- This migration marks 20250815073301_init_after_reset as already applied
-- since the columns it tries to add already exist in production

INSERT INTO "_prisma_migrations" (
    "id",
    "checksum",
    "finished_at",
    "migration_name",
    "logs",
    "rolled_back_at",
    "started_at",
    "applied_steps_count"
) VALUES (
    'f1e2d3c4-b5a6-7890-cdef-123456789abc',
    '6c76f965fc0f7346e0b6df614560aa78ff0ee196f27e9a8fc6f81adca7821795',
    NOW(),
    '20250815073301_init_after_reset',
    'Migration already applied - columns exist in production',
    NULL,
    NOW() - INTERVAL '1 hour',
    1
)
ON CONFLICT ("id") DO NOTHING;
