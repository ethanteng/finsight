-- Admin-configurable model selection, one entry per pipeline slot. Nullable: a
-- null value means "resolve from the environment variable, else the shipped
-- default", so existing deploys keep the model they are running today and a
-- failed read degrades to that same resolution rather than to no model at all.
ALTER TABLE "ai_prompt_config" ADD COLUMN "models" JSONB;
