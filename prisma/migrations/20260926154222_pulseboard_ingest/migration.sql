-- CreateTable
CREATE TABLE "WriteKey" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "WriteKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" BIGSERIAL NOT NULL,
    "orgId" UUID NOT NULL,
    "eventId" TEXT,
    "eventName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterEvent" (
    "id" BIGSERIAL NOT NULL,
    "orgId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadLetterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WriteKey_keyHash_key" ON "WriteKey"("keyHash");

-- CreateIndex
CREATE INDEX "WriteKey_orgId_idx" ON "WriteKey"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_orgId_eventId_key" ON "Event"("orgId", "eventId");

-- CreateIndex
CREATE INDEX "DeadLetterEvent_orgId_receivedAt_idx" ON "DeadLetterEvent"("orgId", "receivedAt");

-- AddForeignKey
ALTER TABLE "WriteKey" ADD CONSTRAINT "WriteKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterEvent" ADD CONSTRAINT "DeadLetterEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
