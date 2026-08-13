/**
 * /owner — sends visitors to the owner dashboard.
 *
 * The owner area is rooted at /owner/dashboard, so /owner itself used to be a
 * plain 404. That is a bad surprise for a URL people will guess, type, and
 * bookmark, and /admin already has an index page — this removes the
 * inconsistency between the two areas.
 */

import { redirect } from "next/navigation";
import { localePath } from "@/lib/navigation";

export default async function OwnerIndexPage() {
  redirect(await localePath("/owner/dashboard"));
}
