-- CreateTable
CREATE TABLE "RollupDaily" (
    "orgId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "eventName" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "uniques" INTEGER NOT NULL,

    CONSTRAINT "RollupDaily_pkey" PRIMARY KEY ("orgId","day","eventName")
);

-- CreateTable
CREATE TABLE "RollupDailyProp" (
    "orgId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "eventName" TEXT NOT NULL,
    "prop" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RollupDailyProp_pkey" PRIMARY KEY ("orgId","day","eventName","prop","value")
);

-- CreateTable
CREATE TABLE "RegisteredProperty" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "eventName" TEXT,
    "prop" TEXT NOT NULL,

    CONSTRAINT "RegisteredProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollupWatermark" (
    "orgId" UUID NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "ranAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RollupWatermark_pkey" PRIMARY KEY ("orgId")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredProperty_orgId_eventName_prop_key" ON "RegisteredProperty"("orgId", "eventName", "prop") NULLS NOT DISTINCT; -- one global (null) registration per prop

-- CreateIndex
CREATE INDEX "Event_orgId_ts_idx" ON "Event"("orgId", "ts");

-- CreateIndex
CREATE INDEX "Event_orgId_receivedAt_idx" ON "Event"("orgId", "receivedAt");

-- AddForeignKey
ALTER TABLE "RollupDaily" ADD CONSTRAINT "RollupDaily_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollupDailyProp" ADD CONSTRAINT "RollupDailyProp_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegisteredProperty" ADD CONSTRAINT "RegisteredProperty_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollupWatermark" ADD CONSTRAINT "RollupWatermark_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
