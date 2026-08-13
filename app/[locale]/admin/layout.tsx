/**
 * /admin — Admin console guard.
 *
 * Middleware already blocks non-admins at the route level, but that only reads
 * the JWT. This re-checks against the database so a revoked role or a
 * suspension takes effect on the next request rather than the next token
 * refresh.
 */

import { redirect } from "next/navigation";
import { localePath, loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AdminLayout from "@/components/admin/AdminLayout";

export default async function AdminAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/admin"));

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      isSuspended: true,
      subAdminProfile: { select: { roleModules: true } },
    },
  });

  if (!user || user.isSuspended)
    redirect(await localePath("/login?error=ACCOUNT_SUSPENDED"));
  if (user.role !== "SUPER_ADMIN" && user.role !== "SUB_ADMIN")
    redirect(await localePath("/"));

  return (
    <AdminLayout
      isSuperAdmin={user.role === "SUPER_ADMIN"}
      roleModules={user.subAdminProfile?.roleModules ?? []}
      adminName={user.name ?? user.email ?? "Admin"}
    >
      {children}
    </AdminLayout>
  );
}
