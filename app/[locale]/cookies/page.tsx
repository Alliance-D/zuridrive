// =============================================================================
// ZuriDrive — Cookie Policy (/cookies)
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
  const t = await getTranslations({
    locale: params.locale,
    namespace: "cookies",
  });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function CookiesPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "cookies",
  });
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <ProsePage
      eyebrow={t("eyebrow")}
      title={t("title")}
      intro={t("intro")}
      updated={UPDATED}
    >
      <Clause n={1} title={t("shortTitle")}>
        <p>{t.rich("shortP1", { b })}</p>
      </Clause>

      <Clause n={2} title={t("setTitle")}>
        <dl>
          <dt>{t("dtSession")}</dt>
          <dd>{t("ddSession")}</dd>

          <dt>{t("dtSecurity")}</dt>
          <dd>{t("ddSecurity")}</dd>

          <dt>{t("dtReturn")}</dt>
          <dd>{t("ddReturn")}</dd>
        </dl>

        <p>{t.rich("setP1", { b })}</p>
      </Clause>

      <Clause n={3} title={t("thirdTitle")}>
        <p>{t("thirdP1")}</p>
      </Clause>

      <Clause n={4} title={t("offTitle")}>
        <p>{t("offP1")}</p>
        <p>
          {t("offP2pre")}{" "}
          <Link href="/privacy">{t("privacyLink")}</Link> {t("offP2post")}
        </p>
      </Clause>
    </ProsePage>
  );
}
