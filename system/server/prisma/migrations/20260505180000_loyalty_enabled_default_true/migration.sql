-- البرنامج مفعّل افتراضياً للصفوف الجديدة؛ المنشآت الحالية تحتفظ بقيمتها الحالية
ALTER TABLE "LoyaltyProgramSettings" ALTER COLUMN "enabled" SET DEFAULT true;
