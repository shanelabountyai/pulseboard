-- AlterTable: bind the org to one Stripe subscription, so a second one cannot overwrite its state (FR-04)
ALTER TABLE "BillingAccount" ADD COLUMN "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_stripeSubscriptionId_key" ON "BillingAccount"("stripeSubscriptionId");
