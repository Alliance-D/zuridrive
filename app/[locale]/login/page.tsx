"use client";

// =============================================================================
// ZuriDrive — Login Page (/login)
// Primary flow: phone number → OTP code → signed in
// Fallback: email + password toggle (for admin users)
// Shows friendly error messages mapped from auth error codes
// =============================================================================

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { resolveLandingPath } from "@/lib/auth/landing";
import { Phone, Mail, Lock, ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { getAuthErrorMessage } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";

type LoginMode = "phone" | "email";
type PhoneStep = "enterPhone" | "enterOtp";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<LoginMode>("phone");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("enterPhone");

  // Phone OTP fields
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpTimer, setOtpTimer] = useState(0);

  // Email fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  /**
   * Routes to the right area for whoever just signed in.
   *
   * The session has to be read back rather than assumed: the role lives on the
   * JWT, and it is the role that decides whether this person belongs in
   * /owner, /admin or /dashboard.
   */
  async function goToLanding() {
    let role: string | undefined;
    try {
      const session = await getSession();
      role = (session?.user as { role?: string } | undefined)?.role;
    } catch {
      // Fall through: resolveLandingPath copes with an unknown role.
    }
    router.push(resolveLandingPath(role, requestedUrl));
    router.refresh();
  }

  // Check for error from NextAuth redirect (e.g. suspended account)
  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (errorCode) {
      setError(getAuthErrorMessage(errorCode));
    }
  }, [searchParams]);

  // OTP countdown timer
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => setOtpTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  // What the user was trying to reach, if anything. NOT defaulted to
  // /dashboard: that is the client area, and sending an owner or admin there
  // gets them bounced straight back to the home page. The destination is
  // decided from their role once we know it - see lib/auth/landing.ts.
  const requestedUrl =
    searchParams.get("callbackUrl") ?? searchParams.get("next");

  // --------------------------------------------------------------------------
  // SIGN IN WITH PHONE + PASSWORD (primary)
  //
  // The default path. A one-time code costs money on every attempt and makes
  // the SMS provider a single point of failure for getting into the platform
  // at all; a password does neither. The code route stays available below for
  // anyone who has forgotten theirs.
  // --------------------------------------------------------------------------
  const handlePasswordSignIn = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn("phone-password", {
        phone,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(getAuthErrorMessage(result.error));
        return;
      }

      await goToLanding();
    } catch {
      setError(t("signInFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // SEND OTP
  // --------------------------------------------------------------------------
  const handleSendOtp = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(ROUTES.api.otpRequest, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, isSignup: false }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(getAuthErrorMessage(data.error) || data.message);
        return;
      }

      setPhoneStep("enterOtp");
      setOtpTimer(300); // 5 minutes countdown
    } catch {
      setError(t("somethingWentWrong"));
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // VERIFY OTP + SIGN IN
  // --------------------------------------------------------------------------
  const handleVerifyOtp = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn("phone-otp", {
        phone,
        otp,
        redirect: false,
      });

      if (result?.error) {
        const msg = getAuthErrorMessage(result.error);
        setError(msg);
        if (result.error === "OTP_INVALID") {
          setAttemptsLeft((a) => (a !== null ? a - 1 : null));
        }
        return;
      }

      await goToLanding();
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // EMAIL + PASSWORD SIGN IN
  // --------------------------------------------------------------------------
  const handleEmailSignIn = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn("email-password", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(getAuthErrorMessage(result.error));
        return;
      }

      await goToLanding();
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      {/* Top bar */}
      <div className="flex items-center justify-between p-5">
        <Link
          href={ROUTES.home}
          className="font-display text-[clamp(1.3rem,3vw,1.6rem)] font-semibold tracking-[-0.02em] text-brand no-underline"
        >
          Zuri<span className="text-accent">Drive</span>
        </Link>
        <Link
          href={ROUTES.home}
          className="flex items-center gap-1.5 text-fluid-sm text-ink-soft no-underline"
        >
          <ArrowLeft size={14} /> {t("backToHome")}
        </Link>
      </div>

      {/* Main card */}
      <div className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-[440px] animate-[scaleIn_0.2s_ease] rounded-3xl border border-sand-light bg-white p-[clamp(1.75rem,4vw,2.75rem)] shadow-[var(--shadow-lg)]">
          {/* Heading */}
          <div className="mb-6">
            <h1 className="mb-2 font-display text-fluid-2xl font-normal tracking-[-0.03em] text-ink">
              {phoneStep === "enterOtp" ? t("enterYourCode") : t("welcomeBack")}
            </h1>
            <p className="text-fluid-sm text-ink-soft">
              {phoneStep === "enterOtp"
                ? t("codeSentTo", { phone })
                : mode === "phone"
                  ? t("signInWithPhonePassword")
                  : t("signInWithEmailPassword")}
            </p>
          </div>

          {/* Error message */}
          {/* The error box's three hex literals were already tokens —
              danger-bg, danger-soft and danger — just written out longhand. */}
          {error && (
            <div className="mb-5 rounded-2xl border border-danger-soft bg-danger-bg px-4 py-3 text-fluid-sm leading-normal text-danger">
              {error}
              {attemptsLeft !== null && attemptsLeft > 0 && (
                <span className="mt-1 block font-semibold">
                  {t("attemptsRemaining", { count: attemptsLeft })}
                </span>
              )}
            </div>
          )}

          {/* ---- PHONE OTP FLOW ---- */}
          {mode === "phone" && (
            <>
              {phoneStep === "enterPhone" ? (
                <div>
                  <label className="input-label">{t("phoneNumber")}</label>
                  <div className="relative">
                    <Phone size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
                    <input
                      type="tel"
                      className="input pl-11"
                      placeholder={t("phonePlaceholder")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                      autoFocus
                    />
                  </div>
                  <p className="mt-2 text-fluid-xs text-ink-faint">
                    {t("rwandanNumbers")}
                  </p>

                  <div className="mt-4">
                    <label className="input-label">{t("password")}</label>
                    <div className="relative">
                      <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
                      <input
                        type={showPassword ? "text" : "password"}
                        className="input px-11"
                        placeholder={t("passwordPlaceholder")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handlePasswordSignIn()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-soft"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handlePasswordSignIn}
                    disabled={isLoading || phone.length < 9 || password.length < 1}
                    className="btn btn-primary btn-lg mt-5 w-full justify-center"
                  >
                    {isLoading ? <><Loader2 size={16} className="spin" /> {t("signingIn")}</> : t("signIn")}
                  </button>

                  <button
                    onClick={handleSendOtp}
                    disabled={isLoading || phone.length < 9}
                    className="mt-3 w-full bg-none text-fluid-sm text-ink-soft underline"
                  >
                    {t("forgotOneTimeCode")}
                  </button>
                </div>
              ) : (
                <div>
                  {/* Back to phone */}
                  <button
                    onClick={() => { setPhoneStep("enterPhone"); setOtp(""); setError(null); }}
                    className="mb-4 flex cursor-pointer items-center gap-1.5 border-none bg-none p-0 font-sans text-fluid-sm text-ink-soft"
                  >
                    <ArrowLeft size={14} /> {t("changeNumber")}
                  </button>

                  <label className="input-label">{t("sixDigitCode")}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input text-fluid-xl text-center font-mono tracking-[0.3em]"
                    placeholder={t("sixDigitCodePlaceholder")}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && handleVerifyOtp()}
                    autoFocus
                    maxLength={6}
                  />

                  {/* Timer */}
                  <div className="mt-3 flex items-center justify-between text-fluid-sm text-ink-soft">
                    <span>
                      {otpTimer > 0
                        ? t("codeExpiresIn", { time: formatTimer(otpTimer) })
                        : t("codeExpired")}
                    </span>
                    {otpTimer === 0 && (
                      <button
                        onClick={() => { setPhoneStep("enterPhone"); setOtp(""); }}
                        className="cursor-pointer border-none bg-none font-sans text-fluid-sm font-semibold text-brand"
                      >
                        {t("resend")}
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleVerifyOtp}
                    disabled={isLoading || otp.length !== 6}
                    className="btn btn-primary btn-lg mt-5 w-full justify-center"
                  >
                    {isLoading ? <><Loader2 size={16} /> {t("verifying")}</> : t("verifyAndSignIn")}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ---- EMAIL + PASSWORD FLOW ---- */}
          {mode === "email" && (
            <div>
              <div className="mb-4">
                <label className="input-label">{t("emailAddress")}</label>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
                  <input
                    type="email"
                    className="input pl-11"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="mb-5">
                <label className="input-label">{t("password")}</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input pr-12"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEmailSignIn()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-none p-0 text-ink-soft"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleEmailSignIn}
                disabled={isLoading || !email || !password}
                className="btn btn-primary btn-lg w-full justify-center"
              >
                {isLoading ? <><Loader2 size={16} /> {t("signingIn")}</> : t("signIn")}
              </button>
            </div>
          )}

          {/* Toggle mode */}
          <div className="mt-5 border-t border-sand-light pt-5 text-center">
            <button
              onClick={() => { setMode(mode === "phone" ? "email" : "phone"); setError(null); setPhoneStep("enterPhone"); }}
              className="mx-auto flex cursor-pointer items-center gap-1.5 border-none bg-none font-sans text-fluid-sm font-semibold text-brand"
            >
              {mode === "phone" ? <><Mail size={14} /> {t("signInWithEmailInstead")}</> : <><Phone size={14} /> {t("signInWithPhoneInstead")}</>}
            </button>
          </div>

          {/* Sign up link */}
          <p className="mt-4 text-center text-fluid-sm text-ink-soft">
            {t("noAccount")}{" "}
            <Link href={ROUTES.signup} className="font-semibold text-brand">
              {t("signUpFree")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
