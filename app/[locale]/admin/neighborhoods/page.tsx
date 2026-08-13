/**
 * /admin/neighborhoods — the vocabulary owners pick from for pickup points.
 */

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import { PageHeader, Card } from "@/components/admin/ui";
import NeighborhoodManager, {
  type NeighborhoodItem,
} from "@/components/admin/NeighborhoodManager";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("neighbourhoods")} — ZuriDrive Admin` };
}

export default async function AdminNeighborhoodsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
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
        title={t("neighbourhoods")}
        subtitle={t("neighbourhoodsSub")}
      />
      <Card>
        <NeighborhoodManager items={items} />
      </Card>
    </div>
  );
}
