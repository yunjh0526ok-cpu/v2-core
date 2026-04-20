-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prompt" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "narrative" TEXT,
    "citations" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "keyIssues" TEXT,
    "factors" TEXT NOT NULL,
    "relatedLaws" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'rules-only',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "department" TEXT,
    "userTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DialogueFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "optionId" TEXT,
    "sentiment" TEXT,
    "topic" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Consultation_createdAt_idx" ON "Consultation"("createdAt");

-- CreateIndex
CREATE INDEX "Consultation_scenario_idx" ON "Consultation"("scenario");

-- CreateIndex
CREATE INDEX "Consultation_riskLevel_idx" ON "Consultation"("riskLevel");

-- CreateIndex
CREATE INDEX "DialogueFeedback_sessionId_createdAt_idx" ON "DialogueFeedback"("sessionId", "createdAt");
