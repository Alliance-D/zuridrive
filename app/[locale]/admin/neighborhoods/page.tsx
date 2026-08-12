/**
 * /admin/neighborhoods — the vocabulary owners pick from for pickup points.
 */

import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import { PageHeader, Card } from "@/components/admin/ui";
import NeighborhoodManager, {
  type NeighborhoodItem,
} from "@/components/admin/NeighborhoodManager";

export const metadata = { title: "Neighbourhoods — ZuriDrive Admin" };

export default async function AdminNeighborhoodsPage() {
  await requireAdminModule("CONTENT_MODERATOR");

  const rows = await prisma.neighborhood.findMany({
    include: { _count: { select: { ownerLocations: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const items: NeighborhoodItem[] = rows.map((n) => ({
    id: n.id,
    name: n.name,
    city: n.city,
    isActive: n.isActive,
    locationCount: n._count.ownerLocations,
  }));

  return (
    <div>
      <PageHeader
        title="Neighbourhoods"
        subtitle="Owners choose from this list when adding a pickup point."
      />
      <Card>
        <NeighborhoodManager items={items} />
      </Card>
    </div>
  );
}
