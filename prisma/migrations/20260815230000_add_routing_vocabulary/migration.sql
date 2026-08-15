-- Admin-configurable vocabulary for question routing. Nullable: a null value
-- means "use the vocabulary that shipped", so existing rows keep working and a
-- failed read degrades to the built-in defaults rather than to no matching.
ALTER TABLE "ai_prompt_config" ADD COLUMN "routingTerms" JSONB;
