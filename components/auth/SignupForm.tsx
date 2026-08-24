"use client";

/**
 * SignupForm — phone-first signup for clients and owners.
 *
 * One step. Details in, account created, signed straight in on the password
 * they just chose.
 *
 * There used to be a second step for an SMS code. It was removed because it
 * cost a message to prove a number that the password then made unnecessary —
 * verification now happens where the number has to work, which is when an
 * owner lists a car. See app/api/auth/signup/route.ts.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { Loader2, AlertCircle, ArrowLeft, Phone, User, Mail, Building2, Lock, Eye, EyeOff } from "lucide-react";

export default function SignupForm({ role }: { role: "CLIENT" | "OWNER" }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Owners only. Asked here so a company's very first listing already carries
  // the business name rather than the founder's personal name.
  const [ownerType, setOwnerType] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = role === "OWNER";

  async function requestCode() {
    // Caught here so a mistyped confirmation does not cost an SMS to discover.
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwordsDontMatch"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Owners go through their own endpoint, which also creates the
      // CarOwnerProfile the onboarding checklist depends on.
      // Clients go to /api/auth/signup, which creates the account with a
      // password and then sends the code. /api/auth/otp is only for requesting
      // a code against an account that already exists.
      const endpoint = isOwner ? "/api/auth/signup/owner" : "/api/auth/signup";
      const body = isOwner
        ? {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            password,
            ownerType,
            businessName: ownerType === "COMPANY" ? businessName.trim() : undefined,
          }
        : { phone: phone.trim(), name: name.trim(), password, email: email.trim() || undefined };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? data.error ?? t("couldntCreateAccount"));
        return;
      }

      // Straight in on the password they just chose. No code is sent at
      // sign-up — the number is verified later, at the point where it has to
      // work, which is where the check already lives.
      const result = await signIn("phone-password", {
        phone: normalise(phone),
        password,
        redirect: false,
      });

      if (result?.error) {
        // The account exists either way, so send them to sign in rather than
        // leaving them stranded on a form that has already done its job.
        setError(t("accountCreatedPleaseSignIn"));
        return;
      }

      router.push(isOwner ? "/owner/onboarding" : routes.dashboard);
      router.refresh();
    } catch {
      setError(tc("networkError"));
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
          {isOwner ? t("ownerIntro") : t("renterIntro")}
        </p>

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
              <Field label={t("businessName")} icon={Building2} htmlFor="businessName">
                <input
                  id="businessName"
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
            
              htmlFor="name"
            >
              <input
                id="name"
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

            <Field label={t("phoneNumber")} icon={Phone} htmlFor="phone">
              <input
                id="phone"
                className={input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("phonePlaceholder")}
                inputMode="tel"
              />
            </Field>

            <Field label={t("emailOptional")} icon={Mail} htmlFor="email">
              <input
                id="email"
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </Field>

            <Field label={t("password")} icon={Lock} htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  className={`${input} pr-10`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-faint">{t("passwordHint")}</p>
            </Field>

            <Field label={t("confirmPassword")} icon={Lock} htmlFor="confirm">
              <input
                id="confirm"
                className={input}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
              />
            </Field>

            {error && <ErrorBox>{error}</ErrorBox>}

            <button
              onClick={requestCode}
              disabled={!canRequest}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? t("creatingAccount") : t("createAccount")}
            </button>

            <p className="text-center text-[11px] text-ink-faint">
              {t("agreeToTerms")}
            </p>
          </div>
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

/**
 * `htmlFor` is required rather than optional: the label carried no association
 * at all before, so a screen reader announced an unlabelled box and clicking
 * the label did nothing. Making it required means a new field cannot repeat
 * that by omission.
 */
function Field({
  label,
  htmlFor,
  icon: Icon,
  children,
}: {
  label: string;
  htmlFor: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-muted"
      >
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
