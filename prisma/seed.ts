import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  let branch = await prisma.branch.findFirst();
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        name: "Main Pharmacy",
        address: "Dhaka, Bangladesh",
      },
    });
  }

  const ownerPin = await bcrypt.hash("1234", 10);
  const staffPin = await bcrypt.hash("5678", 10);

  await prisma.appUser.upsert({
    where: { id: 1 },
    update: { pinHash: ownerPin },
    create: {
      branchId: branch.id,
      name: "Owner",
      role: "owner",
      pinHash: ownerPin,
    },
  });

  await prisma.appUser.upsert({
    where: { id: 2 },
    update: { pinHash: staffPin },
    create: {
      branchId: branch.id,
      name: "Staff",
      role: "staff",
      pinHash: staffPin,
    },
  });

  console.log("Seeded branch and users:");
  console.log("  Owner — PIN: 1234");
  console.log("  Staff — PIN: 5678");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
