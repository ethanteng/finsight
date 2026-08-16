-- How the primary model is asked to think, alongside which model it is.
--
-- Kept out of the existing `models` blob rather than nested inside it: that blob
-- is a flat slot -> model-id map that both the loader and the admin save path
-- validate key by key, and widening it to hold values of a different shape would
-- make every one of those checks conditional. A null column reads as "no
-- overrides", which is the same thing an absent row already means, so existing
-- deployments keep their env-var and shipped defaults until an admin sets one.
ALTER TABLE "ai_prompt_config" ADD COLUMN "generationSettings" JSONB;
