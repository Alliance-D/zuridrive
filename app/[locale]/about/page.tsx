// =============================================================================
// ZuriDrive — About (/about)
//
// Deliberately contains no invented facts about the business: no founding
// date, headcount, funding, or "trusted by N customers". Everything here is a
// claim about how the platform actually works, which is verifiable from the
// code. Fill in the company history yourself — that is not ours to make up.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: "about" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function AboutPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "about" });
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <ProsePage
      eyebrow={t("eyebrow")}
      title={t("title")}
      intro={t("intro")}
    >
      <Clause title={t("problemTitle")}>
        <p>{t.rich("problemP1", { b })}</p>
        <p>{t("problemP2")}</p>
      </Clause>

      <Clause title={t("trustTitle")}>
        <p>{t("trustIntro")}</p>
        <ul>
          <li>{t.rich("trust1", { b })}</li>
          <li>{t.rich("trust2", { b })}</li>
          <li>{t.rich("trust3", { b })}</li>
          <li>{t.rich("trust4", { b })}</li>
          <li>{t.rich("trust5", { b })}</li>
        </ul>
      </Clause>

      <Clause title={t("paysTitle")}>
        <p>{t("paysP1")}</p>
      </Clause>

      <Clause title={t("touchTitle")}>
        <p>
          {t("renting")}{" "}
          <Link href={ROUTES.cars}>{t("browseCars")}</Link>{" "}
          {t("haveCarIdle")}{" "}
          <Link href={ROUTES.becomeAnOwner}>{t("listAndEarn")}</Link>{" "}
          {t("somethingElse")} <Link href="/contact">{t("contactPage")}</Link>{" "}
          {t("fastestRoute")}
        </p>
      </Clause>
    </ProsePage>
  );
}
