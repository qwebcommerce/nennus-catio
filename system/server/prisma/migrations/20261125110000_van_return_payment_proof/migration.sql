-- Proof of a van-return payment: required for a bank transfer, optional for cash. Additive only.

-- CreateTable
CREATE TABLE "VanReturnPaymentProof" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vanReturnId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA,
    "storagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VanReturnPaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VanReturnPaymentProof_vanReturnId_key" ON "VanReturnPaymentProof"("vanReturnId");

-- AddForeignKey
ALTER TABLE "VanReturnPaymentProof" ADD CONSTRAINT "VanReturnPaymentProof_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanReturnPaymentProof" ADD CONSTRAINT "VanReturnPaymentProof_vanReturnId_fkey" FOREIGN KEY ("vanReturnId") REFERENCES "VanReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
