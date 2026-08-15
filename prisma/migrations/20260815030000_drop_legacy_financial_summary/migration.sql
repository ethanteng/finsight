-- FinancialSummarySnapshot has been the only runtime producer and consumer
-- since the canonical snapshot migration. Remove the obsolete duplicate table.
DROP TABLE IF EXISTS "financial_summaries";
