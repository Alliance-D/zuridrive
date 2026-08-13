import { redirect } from "next/navigation";
import { localePath } from "@/lib/navigation";

/** /admin/finance has no page of its own — payments is the landing section. */
export default async function FinanceIndexPage() {
  redirect(await localePath("/admin/finance/payments"));
}
