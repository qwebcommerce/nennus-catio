-- CreateEnum
CREATE TYPE "BusinessVertical" AS ENUM (
  'GROCERY',
  'RESTAURANT',
  'CAFE',
  'PHONE_STORE',
  'AUTO_DEALER',
  'BOOKING_SERVICES',
  'RETAIL_GENERAL',
  'PHARMACY',
  'CLOTHING',
  'HARDWARE_ELECTRONICS',
  'BEAUTY_SALON',
  'PET_STORE',
  'HOTEL',
  'FITNESS',
  'WHOLESALE',
  'SERVICES_OTHER'
);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "businessVertical" "BusinessVertical";
