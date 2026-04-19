import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

const email = process.argv[2] ?? "pouya.anvari@sjsu.edu";
const password = process.argv[3] ?? "rccadmin2026";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists — skipping.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      name: "Pouya Anvari",
      password: hashed,
      role: "admin",
    },
  });

  console.log(`Admin user created: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
