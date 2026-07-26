import "dotenv/config";
import { hashPassword } from "../src/auth/auth.password";
import prisma from "../src/prisma/client";

const email = process.env.ADMIN_EMAIL ?? "admin@statusmanager.local";
const password = process.env.ADMIN_PASSWORD ?? "Admin123!";
const hashedPassword = await hashPassword(password);

await prisma.employee.upsert({
  where: { email },
  update: { role: "ADMIN", active: true, password },
  create: {
    employeeNumber: 1000,
    name: "Administrador",
    email,
    password: hashedPassword,
    role: "ADMIN",
    active: true,
  },
});
console.log(`Administrador listo: #1000 / ${email}`);
await prisma.$disconnect();
