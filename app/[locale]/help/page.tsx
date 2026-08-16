// =============================================================================
// ZuriDrive — Help Centre (/help)
//
// Every answer here describes real, implemented behaviour. Where a figure is
// configurable (commission, cancellation window and fee, photo retention,
// response targets) it is quoted as "currently", so a settings change makes
// this stale rather than false — but it should still be updated.
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
  const t = await getTranslations({ locale: params.locale, namespace: "help" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function HelpPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "help" });
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <ProsePage
      eyebrow={t("eyebrow")}
      title={t("title")}
      intro={t("intro")}
    >
      <Clause id="deposits" title={t("depositsTitle")}>
        <dl>
          <dt>{t("q1")}</dt>
          <dd>{t.rich("a1", { b })}</dd>

          <dt>{t("q2")}</dt>
          <dd>{t("a2")}</dd>

          <dt>{t("q3")}</dt>
          <dd>{t("a3")}</dd>

          <dt>{t("q4")}</dt>
          <dd>{t("a4")}</dd>
        </dl>
      </Clause>

      <Clause id="cancellations" title={t("cancellationsTitle")}>
        <dl>
          <dt>{t("q5")}</dt>
          <dd>{t.rich("a5", { b })}</dd>

          <dt>{t("q6")}</dt>
          <dd>{t("a6")}</dd>

          <dt>{t("q7")}</dt>
          <dd>{t("a7")}</dd>

          <dt>{t("q8")}</dt>
          <dd>{t("a8")}</dd>
        </dl>
      </Clause>

      <Clause id="photos" title={t("photosTitle")}>
        <dl>
          <dt>{t("q9")}</dt>
          <dd>{t("a9")}</dd>

          <dt>{t("q10")}</dt>
          <dd>{t("a10")}</dd>
        </dl>
      </Clause>

      <Clause id="payments" title={t("paymentsTitle")}>
        <dl>
          <dt>{t("q11")}</dt>
          <dd>{t("a11")}</dd>

          <dt>{t("q12")}</dt>
          <dd>
            {t("a12pre")}{" "}
            <a href="mailto:finance@zuridrive.rw">finance@zuridrive.rw</a>{" "}
            {t("a12post")}
          </dd>

          <dt>{t("q13")}</dt>
          <dd>{t("a13")}</dd>
        </dl>
      </Clause>

      <Clause id="owners" title={t("ownersTitle")}>
        <dl>
          <dt>{t("q14")}</dt>
          <dd>{t("a14")}</dd>

          <dt>{t("q15")}</dt>
          <dd>{t("a15")}</dd>

          <dt>{t("q16")}</dt>
          <dd>{t.rich("a16", { b })}</dd>

          <dt>{t("q17")}</dt>
          <dd>{t("a17")}</dd>

          <dt>{t("q18")}</dt>
          <dd>{t("a18")}</dd>
        </dl>
      </Clause>

      <Clause title={t("stuckTitle")}>
        <p>
          {t("stuckPre")}{" "}
          <Link href="/owner/support">{t("supportDesk")}</Link>
          {t("stuckMid")} <Link href="/contact">{t("contactPage")}</Link>.{" "}
          {t("stuckPost")}
        </p>
        <p>
          {t("howItWorksPre")}{" "}
          <Link href={ROUTES.howItWorks}>{t("howItWorksLink")}</Link>{" "}
          {t("howItWorksPost")}
        </p>
      </Clause>
    </ProsePage>
  );
}
