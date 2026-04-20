-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "orgScale" TEXT,
    "participants" TEXT,
    "preferredDate" TEXT,
    "location" TEXT,
    "selectedRisks" TEXT NOT NULL,
    "goal" TEXT,
    "partnershipPurposes" TEXT,
    "timeline" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "priorityRiskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "heroEmoji" TEXT NOT NULL DEFAULT '⚖️',
    "stageStart" TEXT NOT NULL,
    "stageConflict" TEXT NOT NULL,
    "stageFall" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "lawRefs" TEXT NOT NULL,
    "quizQuestion" TEXT NOT NULL,
    "quizOptions" TEXT NOT NULL,
    "quizCorrectOptionId" TEXT NOT NULL,
    "disciplineStats" TEXT NOT NULL,
    "authorNote" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt");

-- CreateIndex
CREATE INDEX "Application_mode_idx" ON "Application"("mode");

-- CreateIndex
CREATE UNIQUE INDEX "Story_slug_key" ON "Story"("slug");

-- CreateIndex
CREATE INDEX "Story_category_idx" ON "Story"("category");

-- CreateIndex
CREATE INDEX "Story_createdAt_idx" ON "Story"("createdAt");
