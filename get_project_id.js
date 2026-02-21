const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const project = await prisma.project.findFirst({
        include: {
            structureNodes: true
        }
    });
    console.log(project ? `${project.id}:${project.structureNodes[0]?.id || ''}` : 'none');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
