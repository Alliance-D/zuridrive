import { redirect } from "next/navigation";

/** /admin/finance has no page of its own — payments is the landing section. */
export default function FinanceIndexPage() {
  redirect("/admin/finance/payments");
}
