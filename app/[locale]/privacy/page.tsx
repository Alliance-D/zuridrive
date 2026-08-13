// =============================================================================
// ZuriDrive — Privacy Policy (/privacy)
//
// Written against the actual Prisma schema rather than from a template. Every
// category of data named below maps to a real column the platform writes, and
// every retention claim matches real behaviour (photo retention comes from
// PlatformSetting.photoRetentionDays; SMS logging from the SmsLog table).
//
// If the schema gains a new personal-data field, this page has to change too.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";

const UPDATED = "1 August 2026";
const CONTACT = "privacy@zuridrive.rw";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "privacy",
  });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function PrivacyPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "privacy",
  });
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

  return (
    <ProsePage
      eyebrow={t("eyebrow")}
      title={t("title")}
      intro={t("intro")}
      updated={UPDATED}
    >
      <Clause n={1} title={t("s1Title")}>
        <p>{t("s1p1")}</p>
        <p>{t.rich("s1p2", { b, mail })}</p>
      </Clause>

      <Clause n={2} title={t("s2Title")}>
        <p>{t("s2intro")}</p>
        <dl>
          <dt>{t("s2dt1")}</dt>
          <dd>{t("s2dd1")}</dd>
          <dt>{t("s2dt2")}</dt>
          <dd>{t.rich("s2dd2", { b })}</dd>
          <dt>{t("s2dt3")}</dt>
          <dd>{t("s2dd3")}</dd>
          <dt>{t("s2dt4")}</dt>
          <dd>{t("s2dd4")}</dd>
          <dt>{t("s2dt5")}</dt>
          <dd>{t("s2dd5")}</dd>
          <dt>{t("s2dt6")}</dt>
          <dd>{t.rich("s2dd6", { b })}</dd>
          <dt>{t("s2dt7")}</dt>
          <dd>{t("s2dd7")}</dd>
          <dt>{t("s2dt8")}</dt>
          <dd>{t("s2dd8")}</dd>
        </dl>
        <p>{t.rich("s2end", { b })}</p>
      </Clause>

      <Clause n={3} title={t("s3Title")}>
        <ul>
          <li>{t.rich("s3li1", { b })}</li>
          <li>{t.rich("s3li2", { b })}</li>
          <li>{t.rich("s3li3", { b })}</li>
          <li>{t.rich("s3li4", { b })}</li>
          <li>{t.rich("s3li5", { b })}</li>
        </ul>
        <p>{t("s3end")}</p>
      </Clause>

      <Clause n={4} title={t("s4Title")}>
        <p>{t("s4intro")}</p>
        <ul>
          <li>{t.rich("s4li1", { b })}</li>
          <li>{t.rich("s4li2", { b })}</li>
          <li>{t.rich("s4li3", { b })}</li>
          <li>{t.rich("s4li4", { b })}</li>
          <li>{t.rich("s4li5", { b })}</li>
        </ul>
        <p>{t("s4end")}</p>
      </Clause>

      <Clause n={5} title={t("s5Title")}>
        <ul>
          <li>{t.rich("s5li1", { b })}</li>
          <li>{t.rich("s5li2", { b })}</li>
          <li>{t.rich("s5li3", { b })}</li>
          <li>{t.rich("s5li4", { b })}</li>
        </ul>
      </Clause>

      <Clause n={6} title={t("s6Title")}>
        <p>{t("s6intro")}</p>
        <ul>
          <li>{t("s6li1")}</li>
          <li>{t("s6li2")}</li>
          <li>{t("s6li3")}</li>
          <li>{t("s6li4")}</li>
          <li>{t("s6li5")}</li>
        </ul>
        <p>{t.rich("s6end", { mail })}</p>
      </Clause>

      <Clause n={7} title={t("s7Title")}>
        <p>{t("s7p1")}</p>
        <p>{t("s7p2")}</p>
      </Clause>

      <Clause n={8} title={t("s8Title")}>
        <p>
          {t("s8pre")} <Link href="/cookies">{t("s8link")}</Link>.
        </p>
      </Clause>

      <Clause n={9} title={t("s9Title")}>
        <p>{t("s9p1")}</p>
      </Clause>
    </ProsePage>
  );
}
