/**
 * Client dashboard layout.
 *
 * This file used to render an entire second dashboard — a page heading, four
 * statistic cards and four emoji quick-links — and then render the real page
 * inside it. Signed-in clients saw two stacked dashboards whose numbers
 * disagreed with each other.
 *
 * The stats were the worse half: "2 active bookings", "450K RWF spent",
 * "8 completed trips" and "4.8 stars" were HARD-CODED, so every client on the
 * platform saw the same invented figures above their own real ones. The
 * "Support" card also pointed at /login, and all four links were plain <a>
 * tags, which force a full page reload instead of a client-side navigation.
 *
 * It was scaffolding that never got removed. The layout's job is authorisation
 * and nothing else — components/dashboard/DashboardLayout provides the actual
 * chrome, and the page renders its own real figures.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?next=/dashboard");
  }

  // Owners and admins have their own areas; lib/auth/landing.ts routes each
  // role to the right one at sign-in.
  if ((session.user as { role?: string }).role !== "CLIENT") {
    redirect("/");
  }

  return <>{children}</>;
}
