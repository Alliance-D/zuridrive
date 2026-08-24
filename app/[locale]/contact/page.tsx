// =============================================================================
// ZuriDrive — Contact (/contact)
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "contact",
  });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ContactPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "contact",
  });
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const phone = (chunks: React.ReactNode) => (
    <a href="tel:+250795527989">{chunks}</a>
  );

  return (
    <ProsePage
      eyebrow={t("eyebrow")}
      title={t("title")}
      intro={t("intro")}
    >
      <Clause title={t("urgentTitle")}>
        <p>{t.rich("urgentP1", { b, phone })}</p>
        <p>{t.rich("urgentP2", { b })}</p>
      </Clause>

      <Clause title={t("accountTitle")}>
        <p>
          {t("accountP1pre")}{" "}
          <Link href="/owner/support">{t("accountLink")}</Link>
          {t("accountP1post")}
        </p>
      </Clause>

      <Clause title={t("emailTitle")}>
        <dl>
          <dt>{t("dtGeneral")}</dt>
          <dd>
            <a href="mailto:dushimealliance3@gmail.com">dushimealliance3@gmail.com</a>
          </dd>

          {/* The top plan carries a listing cap, so /list-your-car sends
              anyone above it here. Without a line naming fleet accounts they
              would land on a generic address with no sign anybody handles
              them. */}
          <dt>{t("dtFleet")}</dt>
          <dd>
            <a href="mailto:dushimealliance3@gmail.com?subject=Fleet%20enquiry">
              dushimealliance3@gmail.com
            </a>
            .{" "}
            {t("ddFleet")}
          </dd>

          <dt>{t("dtPayments")}</dt>
          <dd>
            <a href="mailto:dushimealliance3@gmail.com">dushimealliance3@gmail.com</a>.{" "}
            {t("ddPayments")}
          </dd>

          <dt>{t("dtPrivacy")}</dt>
          <dd>
            <a href="mailto:dushimealliance3@gmail.com">dushimealliance3@gmail.com</a>.{" "}
            {t("ddPrivacy")}
          </dd>

          <dt>{t("dtSecurity")}</dt>
          <dd>
            <a href="mailto:dushimealliance3@gmail.com">dushimealliance3@gmail.com</a>.{" "}
            {t("ddSecurity")}
          </dd>

          <dt>{t("dtPress")}</dt>
          <dd>
            <a href="mailto:dushimealliance3@gmail.com">dushimealliance3@gmail.com</a>
          </dd>
        </dl>
      </Clause>

      <Clause title={t("fasterTitle")}>
        <ul>
          <li>{t("faster1")}</li>
          <li>{t("faster2")}</li>
          <li>{t("faster3")}</li>
          <li>{t("faster4")}</li>
        </ul>
        <p>
          {t("beforeYouWrite")}{" "}
          <Link href="/help">{t("helpCentre")}</Link>. {t("helpCentreAfter")}
        </p>
      </Clause>
    </ProsePage>
  );
}
