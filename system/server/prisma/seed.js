import { PrismaClient } from "../src/lib/prisma-client-bundle.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ORG_ID = "seed-org-default";

async function main() {
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {
      name: "المتجر الافتراضي",
      slug: "ezoo",
      businessVertical: "GROCERY",
      profileDocsDone: true,
      paymentDone: true,
      onboardingReviewStatus: "APPROVED",
      country: "QA",
    },
    create: {
      id: ORG_ID,
      name: "المتجر الافتراضي",
      slug: "ezoo",
      businessVertical: "GROCERY",
      profileDocsDone: true,
      paymentDone: true,
      onboardingReviewStatus: "APPROVED",
      country: "QA",
    },
  });

  const mainBranch = await prisma.branch.upsert({
    where: { id: "seed-branch-main" },
    update: { organizationId: ORG_ID, nameEn: "Main branch" },
    create: {
      id: "seed-branch-main",
      organizationId: ORG_ID,
      name: "الفرع الرئيسي",
      nameEn: "Main branch",
      address: "المتجر — العنوان",
    },
  });

  const north = await prisma.branch.upsert({
    where: { id: "seed-branch-north" },
    update: { organizationId: ORG_ID, nameEn: "North branch" },
    create: {
      id: "seed-branch-north",
      organizationId: ORG_ID,
      name: "فرع الشمال",
      nameEn: "North branch",
      address: "",
    },
  });

  const hash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: ORG_ID,
        email: "admin@petstore.local",
      },
    },
    update: { nameEn: "System administrator" },
    create: {
      organizationId: ORG_ID,
      email: "admin@petstore.local",
      passwordHash: hash,
      name: "مدير النظام",
      nameEn: "System administrator",
      role: "ADMIN",
      branchId: mainBranch.id,
    },
  });

  const platformHash = await bcrypt.hash("platform123", 10);
  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: ORG_ID,
        email: "platform@petstore.local",
      },
    },
    update: { nameEn: "Platform administrator" },
    create: {
      organizationId: ORG_ID,
      email: "platform@petstore.local",
      passwordHash: platformHash,
      name: "مدير المنصة",
      nameEn: "Platform administrator",
      role: "ADMIN",
      branchId: mainBranch.id,
    },
  });

  const cashierHash = await bcrypt.hash("cashier123", 10);
  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: ORG_ID,
        email: "cashier@petstore.local",
      },
    },
    update: { nameEn: "Cashier" },
    create: {
      organizationId: ORG_ID,
      email: "cashier@petstore.local",
      passwordHash: cashierHash,
      name: "كاشير",
      nameEn: "Cashier",
      role: "CASHIER",
      branchId: mainBranch.id,
    },
  });

  const samples = [
    {
      name: "طعام قطط جاف — ممتاز",
      nameEn: "Premium dry cat food",
      petType: "CAT",
      price: "89.00",
      cost: "45.00",
      imageUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400",
    },
    {
      name: "طعام كلاب — لحم",
      nameEn: "Dog food — meat",
      petType: "DOG",
      price: "120.00",
      cost: "60.00",
      imageUrl: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400",
    },
    {
      name: "لعبة خيط للقطط",
      nameEn: "Cat string toy",
      petType: "CAT",
      price: "25.50",
      cost: "10.00",
      imageUrl: "https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=400",
    },
  ];

  if ((await prisma.product.count({ where: { organizationId: ORG_ID } })) === 0) {
    for (const s of samples) {
      const p = await prisma.product.create({
        data: {
          organizationId: ORG_ID,
          name: s.name,
          nameEn: s.nameEn,
          petType: s.petType,
          price: s.price,
          cost: s.cost,
          imageUrl: s.imageUrl,
          sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
        },
      });
      await prisma.inventory.upsert({
        where: {
          productId_branchId: { productId: p.id, branchId: mainBranch.id },
        },
        create: {
          productId: p.id,
          branchId: mainBranch.id,
          quantity: 40,
          minStockLevel: 5,
        },
        update: { quantity: 40 },
      });
      await prisma.inventory.upsert({
        where: {
          productId_branchId: { productId: p.id, branchId: north.id },
        },
        create: {
          productId: p.id,
          branchId: north.id,
          quantity: 12,
          minStockLevel: 8,
        },
        update: {},
      });
    }
  } else {
    console.log("تخطي عينات المنتجات — يوجد مخزون مسبقاً");
  }

  for (const s of samples) {
    await prisma.product.updateMany({
      where: { organizationId: ORG_ID, name: s.name },
      data: { nameEn: s.nameEn },
    });
  }

  await prisma.syncSettings.upsert({
    where: { organizationId: ORG_ID },
    update: {},
    create: { organizationId: ORG_ID },
  });

  console.log(
    "تم البذر: admin@petstore.local / admin123 | platform@petstore.local / platform123 (مدير المنصة) | cashier@petstore.local / cashier123"
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
