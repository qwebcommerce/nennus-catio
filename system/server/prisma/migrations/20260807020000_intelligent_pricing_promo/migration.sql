-- Module 2: Intelligent Pricing & Promo Engine — promo drafts

CREATE TABLE "PromoDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "kind" TEXT NOT NULL DEFAULT 'MARKDOWN',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "applyMode" TEXT NOT NULL DEFAULT 'PRICE',
    "title" TEXT,
    "note" TEXT,
    "couponId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoDraftItem" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'PERCENT_OFF',
    "currentPrice" DECIMAL(65,30),
    "cost" DECIMAL(65,30),
    "suggestedPrice" DECIMAL(65,30),
    "discountPercent" DECIMAL(65,30),
    "previousPrice" DECIMAL(65,30),
    "reason" TEXT,
    "buyQty" INTEGER,
    "freeQty" INTEGER,
    "pairedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoDraftItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromoDraft_organizationId_status_idx" ON "PromoDraft"("organizationId", "status");
CREATE INDEX "PromoDraft_organizationId_branchId_status_idx" ON "PromoDraft"("organizationId", "branchId", "status");
CREATE INDEX "PromoDraftItem_draftId_idx" ON "PromoDraftItem"("draftId");

ALTER TABLE "PromoDraft" ADD CONSTRAINT "PromoDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoDraft" ADD CONSTRAINT "PromoDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoDraft" ADD CONSTRAINT "PromoDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromoDraft" ADD CONSTRAINT "PromoDraft_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoDraftItem" ADD CONSTRAINT "PromoDraftItem_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PromoDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoDraftItem" ADD CONSTRAINT "PromoDraftItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
