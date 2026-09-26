
-- CreateIndex
CREATE INDEX "Event_orgId_userId_eventName_ts_id_idx" ON "Event"("orgId", "userId", "eventName", "ts", "id");

