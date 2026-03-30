
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    const projects = await prisma.project.findMany();
    console.log('Projects:', projects);

    for (const project of projects) {
        console.log(`\nChecking project: ${project.title} (${project.id})`);
        const nodes = await prisma.structureNode.findMany({
            where: { projectId: project.id },
            orderBy: { orderIndex: 'asc' },
        });
        console.log(`Found ${nodes.length} nodes.`);
        nodes.forEach(node => {
            console.log(`- [${node.type}] ${node.title} (ID: ${node.id}, Parent: ${node.parentId}, Order: ${node.orderIndex})`);
        });
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
