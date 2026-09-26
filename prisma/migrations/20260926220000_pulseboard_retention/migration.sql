
-- CreateTable
CREATE TABLE "RollupUserDay" (
    "orgId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "eventName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RollupUserDay_pkey" PRIMARY KEY ("orgId","day","eventName","userId")
);

-- AddForeignKey
ALTER TABLE "RollupUserDay" ADD CONSTRAINT "RollupUserDay_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

