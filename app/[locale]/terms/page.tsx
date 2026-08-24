// =============================================================================
// ZuriDrive — Terms of Service (/terms)
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";

const UPDATED = "1 August 2026";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: "terms" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function TermsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "terms" });
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <ProsePage
      eyebrow={t("eyebrow")}
      title={t("title")}
      intro={t("intro")}
      updated={UPDATED}
    >
      <Clause n={1} title={t("s1Title")}>
        <p>{t.rich("s1p1", { b })}</p>
        <p>{t.rich("s1p2", { b })}</p>
        <p>{t.rich("s1p3", { b })}</p>
      </Clause>

      <Clause n={2} title={t("s2Title")}>
        <p>{t.rich("s2p1", { b })}</p>
        <p>{t("s2p2")}</p>
      </Clause>

      <Clause n={3} title={t("s3Title")}>
        <p>{t("s3p1")}</p>
        <p>{t("s3p2")}</p>
      </Clause>

      <Clause n={4} title={t("s4Title")}>
        <p>{t.rich("s4p1", { b })}</p>
        <p>{t.rich("s4p2", { b })}</p>
        <p>{t.rich("s4p3", { b })}</p>
        <p>{t.rich("s4p4", { b })}</p>
      </Clause>

      <Clause n={5} title={t("s5Title")}>
        <p>{t.rich("s5p1", { b })}</p>
        <p>{t.rich("s5p2", { b })}</p>
        <p>{t.rich("s5p3", { b })}</p>
        <p>{t.rich("s5p4", { b })}</p>
        <p>{t.rich("s5p5", { b })}</p>
      </Clause>

      <Clause n={6} title={t("s6Title")}>
        <p>{t.rich("s6p1", { b })}</p>
        <p>{t("s6p2")}</p>
        <p>{t("s6p3")}</p>
      </Clause>

      <Clause n={7} title={t("s7Title")}>
        <p>{t("s7p1")}</p>
        <p>{t.rich("s7p2", { b })}</p>
      </Clause>

      <Clause n={8} title={t("s8Title")}>
        <p>{t("s8p1")}</p>
        <p>{t.rich("s8p2", { b })}</p>
        <p>{t.rich("s8p3", { b })}</p>
      </Clause>

      <Clause n={9} title={t("s9Title")}>
        <p>{t("s9p1")}</p>
        <p>{t.rich("s9p2", { b })}</p>
      </Clause>

      <Clause n={10} title={t("s10Title")}>
        <p>{t("s10p1")}</p>
      </Clause>

      <Clause n={11} title={t("s11Title")}>
        <p>{t("s11p1")}</p>
      </Clause>

      <Clause n={12} title={t("s12Title")}>
        <p>
          {t("s12pre")}{" "}
          <a href="mailto:dushimealliance3@gmail.com">dushimealliance3@gmail.com</a>
          {t("s12mid")} <Link href="/help">{t("s12help")}</Link>{" "}
          {t("s12and")} <Link href="/privacy">{t("s12privacy")}</Link>.
        </p>
      </Clause>
    </ProsePage>
  );
}
