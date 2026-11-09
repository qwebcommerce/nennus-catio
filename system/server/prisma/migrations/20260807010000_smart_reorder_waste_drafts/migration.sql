-- Module 1: Smart Reorder & Waste Guard — purchase drafts

CREATE TABLE "PurchaseDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'REORDER',
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseDraftItem" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(65,30),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseDraftItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseDraft_purchaseId_key" ON "PurchaseDraft"("purchaseId");

CREATE INDEX "PurchaseDraft_organizationId_branchId_status_idx" ON "PurchaseDraft"("organizationId", "branchId", "status");

CREATE INDEX "PurchaseDraftItem_draftId_idx" ON "PurchaseDraftItem"("draftId");

ALTER TABLE "PurchaseDraft" ADD CONSTRAINT "PurchaseDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseDraft" ADD CONSTRAINT "PurchaseDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseDraft" ADD CONSTRAINT "PurchaseDraft_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseDraft" ADD CONSTRAINT "PurchaseDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseDraft" ADD CONSTRAINT "PurchaseDraft_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseDraftItem" ADD CONSTRAINT "PurchaseDraftItem_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PurchaseDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseDraftItem" ADD CONSTRAINT "PurchaseDraftItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
