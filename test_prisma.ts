import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
    console.log("Testing Prisma...");
    const count = await prisma.project.count();
    console.log("Project count:", count);
    await prisma.$disconnect();
}
main();
