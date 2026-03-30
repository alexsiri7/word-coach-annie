import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
async function main() {
    console.log("Testing Prisma...");
    const count = await prisma.project.count();
    console.log("Project count:", count);
    await prisma.$disconnect();
}
main();
