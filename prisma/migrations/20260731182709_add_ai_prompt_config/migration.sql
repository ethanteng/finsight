-- CreateTable
CREATE TABLE "ai_prompt_config" (
    "id" TEXT NOT NULL,
    "responseTone" TEXT NOT NULL,
    "lastEditedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_prompt_config_pkey" PRIMARY KEY ("id")
);

