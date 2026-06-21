// Bootstraps an admin entry in the User allowlist so the first sign-in via
// Google succeeds and lands on an account with role="admin". This script does
// NOT set a password — auth is Google-only and User.password is unused.
//
// Usage:
//   bun run src/scripts/seed-admin.ts <email> [name]
//   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_NAME="Your Name" bun run src/scripts/seed-admin.ts
//
// If the user already exists, the script promotes them to admin and leaves
// every other field untouched.

import prisma from "@/lib/prisma";

const email = (process.argv[2] ?? process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
const name = (process.argv[3] ?? process.env.SEED_ADMIN_NAME ?? "Admin").trim();

if (!email) {
  console.error(
    "Missing admin email. Pass it as the first CLI argument or set SEED_ADMIN_EMAIL.\n" +
      "  bun run src/scripts/seed-admin.ts you@example.com \"Your Name\""
  );
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`Invalid email: ${email}`);
  process.exit(1);
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === "admin") {
      console.log(`User ${email} already exists with role=admin — no changes.`);
      return;
    }
    await prisma.user.update({ where: { email }, data: { role: "admin" } });
    console.log(`Promoted existing user ${email} to admin.`);
    return;
  }

  await prisma.user.create({
    data: { email, name, password: null, role: "admin" },
  });
  console.log(`Admin user created: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
