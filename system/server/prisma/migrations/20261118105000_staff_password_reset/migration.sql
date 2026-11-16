-- Staff "forgot password" reset token (sha256 of the emailed token) and its expiry.
ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "resetExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");
