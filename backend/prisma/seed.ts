import "dotenv/config";
import { hashPassword } from "../src/auth/auth.password";
import prisma from "../src/prisma/client";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@statusmanager.local";
  const password = process.env.ADMIN_PASSWORD ?? "Admin123!";
  const hashedPassword = await hashPassword(password);

  await prisma.employee.upsert({
    where: { email },
    update: {
      role: "ADMIN",
      active: true,
      password: hashedPassword,
    },
    create: {
      employeeNumber: 1000,
      name: "Administrator",
      email,
      password: hashedPassword,
      role: "ADMIN",
      active: true,
    },
  });

  console.log(`Administrator ready: #1000 / ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });