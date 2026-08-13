/** /signup — client account creation. */

import SignupForm from "@/components/auth/SignupForm";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/navbar";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "auth" });
  return { title: `${t("signUpTitle")} — ZuriDrive` };
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-bone">
      <Navbar />
      <div className="flex justify-center px-4 py-10">
        <SignupForm role="CLIENT" />
      </div>
    </div>
  );
}
