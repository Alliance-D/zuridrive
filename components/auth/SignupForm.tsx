"use client";

/**
 * SignupForm — phone-first signup for clients and owners.
 *
 * Two steps: details → SMS code. There is no password, because the platform
 * signs people in with a one-time code; creating one here would be a
 * credential nobody needs.
 *
 * In development the API returns the code (`devOtp`) since no SMS provider is
 * configured, and the form shows it rather than leaving you stuck.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { Loader2, AlertCircle, ArrowLeft, Phone, User, Mail , Building2} from "lucide-react";

export default function SignupForm({ role }: { role: "CLIENT" | "OWNER" }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Owners only. Asked here so a company's very first listing already carries
  // the business name rather than the founder's personal name.
  const [ownerType, setOwnerType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [businessName, setBusinessName] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = role === "OWNER";

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      // Owners go through their own endpoint, which also creates the
      // CarOwnerProfile the onboarding checklist depends on.
      const endpoint = isOwner ? "/api/auth/signup/owner" : "/api/auth/otp";
      const body = isOwner
        ? {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            ownerType,
            businessName: ownerType === "COMPANY" ? businessName.trim() : undefined,
          }
        : { phone: phone.trim(), name: name.trim(), isSignup: true };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? data.error ?? t("couldntSendCode"));
        return;
      }

      setDevOtp(data.devOtp ?? null);
      setStep("code");
    } catch {
      setError(tc("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn("phone-otp", {
        phone: normalise(phone),
        otp: code.trim(),
        redirect: false,
      });

      if (result?.error) {
        setError(
          result.error === "OTP_INVALID"
            ? t("codeNotRight")
            : result.error === "OTP_EXPIRED"
              ? t("codeHasExpired")
              : t("couldntSignYouIn"),
        );
        return;
      }

      router.push(isOwner ? "/owner/onboarding" : routes.dashboard);
      router.refresh();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  const canRequest =
    name.trim().length >= 2 && phone.trim().length >= 10 && !busy;

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ink">
          {isOwner ? t("listYourCarOnZuriDrive") : t("createYourAccount")}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {step === "details"
            ? isOwner
              ? t("ownerIntro")
              : t("renterIntro")
            : t("codeSentToDot", { phone })}
        </p>

        {step === "details" ? (
          <div className="mt-5 space-y-3">
            {isOwner && (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  {t("listingAsYourselfOrBusiness")}
                </p>
                <div className="flex gap-2">
                  {(["INDIVIDUAL", "COMPANY"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setOwnerType(option)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        ownerType === option
                          ? "border-brand bg-brand text-white"
                          : "border-sand-edge bg-white text-ink-muted hover:border-brand"
                      }`}
                    >
                      {option === "INDIVIDUAL" ? t("myself") : t("aBusiness")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isOwner && ownerType === "COMPANY" && (
              <Field label={t("businessName")} icon={Building2}>
                <input
                  className={input}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t("businessNamePlaceholder")}
                />
              </Field>
            )}

            <Field
              label={
                isOwner && ownerType === "COMPANY"
                  ? t("yourFullName")
                  : t("fullName")
              }
              icon={User}
            >
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  isOwner && ownerType === "COMPANY"
                    ? t("personManaging")
                    : t("yourLegalName")
                }
                autoFocus
              />
            </Field>

            <Field label={t("phoneNumber")} icon={Phone}>
              <input
                className={input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("phonePlaceholder")}
                inputMode="tel"
              />
            </Field>

            <Field label={t("emailOptional")} icon={Mail}>
              <input
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </Field>

            {error && <ErrorBox>{error}</ErrorBox>}

            <button
              onClick={requestCode}
              disabled={!canRequest}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t("sendingCode") : t("sendMeACode")}
            </button>

            <p className="text-center text-[11px] text-ink-faint">
              {t("agreeToTerms")}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {devOtp && (
              <div className="rounded-lg bg-warning-bg px-3 py-2">
                <p className="text-xs text-warning">
                  {t("devModeCode")}{" "}
                  <strong className="font-mono text-sm">{devOtp}</strong>
                </p>
              </div>
            )}

            <Field label={t("sixDigitCode")}>
              <input
                className={`${input} text-center font-mono text-lg tracking-[0.4em]`}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))
                }
                inputMode="numeric"
                placeholder={t("sixDigitCodePlaceholder")}
                autoFocus
              />
            </Field>

            {error && <ErrorBox>{error}</ErrorBox>}

            <button
              onClick={verify}
              disabled={code.length !== 6 || busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t("creatingAccount") : t("createAccount")}
            </button>

            <button
              onClick={() => {
                setStep("details");
                setCode("");
                setError(null);
              }}
              className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('changeDetails')}
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-ink-soft">
        {t("alreadyHaveAccount")}{" "}
        <Link href={routes.login} className="font-semibold text-brand hover:underline">
          {t("signIn")}
        </Link>
      </p>

      <p className="mt-2 text-center text-sm text-ink-soft">
        {isOwner ? (
          <>
            {t("lookingToRent")}{" "}
            <Link href={routes.signup} className="font-semibold text-brand hover:underline">
              {t("createRenterAccount")}
            </Link>
          </>
        ) : (
          <>
            {t("haveCarToRentOut")}{" "}
            <Link href={routes.signupOwner} className="font-semibold text-brand hover:underline">
              {t("listYourCar")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

/** Matches the server's normalisation so sign-in finds the account. */
function normalise(phone: string) {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (/^\+250[0-9]{9}$/.test(cleaned)) return cleaned;
  if (/^250[0-9]{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0[0-9]{9}$/.test(cleaned)) return `+250${cleaned.slice(1)}`;
  return cleaned;
}

const input =
  "w-full rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20";

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        {Icon && <Icon className="h-3 w-3 text-ink-faint" />}
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-danger-bg p-2.5">
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" />
      <p className="text-xs text-danger">{children}</p>
    </div>
  );
}
