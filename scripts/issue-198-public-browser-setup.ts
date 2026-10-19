/** Local-only: publish Issue #114 existing public opportunity for PR #208 browser verification. */
import { PrismaClient } from '../apps/api/prisma/generated/client/index.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const opportunity = await prisma.publicOpportunity.findFirst({
    where: { publicSlug: { startsWith: 'issue114-existing-' } },
  });
  if (!opportunity) {
    throw new Error('Run scripts/issue-114-evidence-setup.ts first.');
  }
  await prisma.publicOpportunity.update({
    where: { id: opportunity.id },
    data: {
      applicationLinkEnabled: true,
      listedOnWebsite: true,
      status: 'OPEN',
      publicationStartsAt: new Date(),
    },
  });
  console.log(JSON.stringify({ publicSlug: opportunity.publicSlug }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
