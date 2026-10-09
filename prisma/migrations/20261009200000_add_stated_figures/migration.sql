-- CreateTable
CREATE TABLE "stated_figures" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "figures" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stated_figures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stated_figures_userId_key" ON "stated_figures"("userId");

-- AddForeignKey
ALTER TABLE "stated_figures" ADD CONSTRAINT "stated_figures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

