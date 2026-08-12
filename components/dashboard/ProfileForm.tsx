"use client";

/**
 * ProfileForm — Interactive profile editor.
 * Handles: name, phone (with OTP re-verification flow), email, national ID,
 * driver license number + photo upload, profile photo upload.
 * All uploads go to Cloudinary via /api/upload.
 * Phone changes require OTP verification before saving.
 * Inline validation with human-friendly error messages.
 */

import { useState, useRef, useTransition } from "react";
import Image from "next/image";
import {
  User, Phone, Mail, CreditCard, Car,
  Upload, CheckCircle2, AlertCircle,
  Loader2, Camera, Edit2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  name:                  string;
  phone:                 string;
  email:                 string;
  profilePhotoUrl:       string;
}

interface ProfileFormProps {
  userId:      string;
  initialData: ProfileData;
  memberSince: Date;
}

// ─── Inline field component ───────────────────────────────────────────────────

function Field({
  label, icon: Icon, children, hint, error,
}: {
  label:    string;
  icon:     React.ElementType;
  children: React.ReactNode;
  hint?:    string;
  error?:   string;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <Icon className="h-3.5 w-3.5 text-brand" />
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-sand-dark bg-white px-3.5 py-2.5 text-sm text-ink " +
  "placeholder:text-sand-mute focus:border-brand focus:outline-none focus:ring-2 " +
  "focus:ring-brand/15 transition-colors disabled:bg-bone disabled:text-ink-faint";

// ─── Upload helper (calls /api/upload) ────────────────────────────────────────

async function uploadToCloudinary(
  file: File,
  folder: string
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed. Please try again.");
  const { url } = await res.json();
  return url as string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProfileForm({
  userId,
  initialData,
  memberSince,
}: ProfileFormProps) {
  const [data,   setData]   = useState<ProfileData>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileData, string>>>({});
  const [saved,  setSaved]  = useState(false);
  const [globalError, setGlobalError] = useState("");

  // Upload states
  const [profileUploading, setProfileUploading] = useState(false);

  // Phone OTP flow
  const [phoneChangeMode, setPhoneChangeMode] = useState(false);
  const [newPhone,        setNewPhone]        = useState("");
  const [otpSent,         setOtpSent]         = useState(false);
  const [otpValue,        setOtpValue]        = useState("");
  const [otpError,        setOtpError]        = useState("");
  const [otpLoading,      setOtpLoading]      = useState(false);

  const [isPending, startTransition] = useTransition();

  const profileInputRef = useRef<HTMLInputElement>(null);

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!data.name.trim())          errs.name = "Your full name is required.";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      errs.email = "Please enter a valid email address.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Handle profile photo upload ────────────────────────────────────────────

  async function handleProfilePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setGlobalError("Profile photo must be under 5 MB.");
      return;
    }
    setProfileUploading(true);
    setGlobalError("");
    try {
      const url = await uploadToCloudinary(file, "zuridrive/profiles");
      setData((d) => ({ ...d, profilePhotoUrl: url }));
    } catch {
      setGlobalError("Profile photo upload failed. Please try a different image.");
    } finally {
      setProfileUploading(false);
    }
  }

  // ── Handle license photo upload ────────────────────────────────────────────


  // ── Phone OTP: send ────────────────────────────────────────────────────────

  async function handleSendOtp() {
    if (!/^(\+250|0)[0-9]{9}$/.test(newPhone.replace(/\s/g, ""))) {
      setOtpError("Enter a valid Rwandan phone number (e.g. 078 123 4567).");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone, context: "phone-change" }),
      });
      if (!res.ok) throw new Error();
      setOtpSent(true);
    } catch {
      setOtpError("Couldn't send the verification code. Please try again in a moment.");
    } finally {
      setOtpLoading(false);
    }
  }

  // ── Phone OTP: verify ──────────────────────────────────────────────────────

  async function handleVerifyOtp() {
    if (otpValue.length !== 6) {
      setOtpError("Enter the 6-digit code sent to your new number.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone, otp: otpValue, context: "phone-change" }),
      });
      if (!res.ok) throw new Error();
      setData((d) => ({ ...d, phone: newPhone }));
      setPhoneChangeMode(false);
      setOtpSent(false);
      setOtpValue("");
      setNewPhone("");
    } catch {
      setOtpError("That code is incorrect or has expired. Please request a new one.");
    } finally {
      setOtpLoading(false);
    }
  }

  // ── Save profile ───────────────────────────────────────────────────────────

  function handleSave() {
    if (!validate()) return;
    setGlobalError("");
    setSaved(false);

    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? "Save failed");
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err: any) {
        setGlobalError(
          err.message === "Save failed"
            ? "We couldn't save your changes. Please try again."
            : err.message
        );
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const memberSinceStr = memberSince.toLocaleDateString("en-RW", {
    month: "long",
    year:  "numeric",
  });

  return (
    <div className="space-y-5">

      {/* ── Profile Photo Card ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-sand-dark">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-sand ring-2 ring-sand-dark">
              {data.profilePhotoUrl ? (
                <Image
                  src={data.profilePhotoUrl}
                  alt="Profile photo"
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <User className="h-8 w-8 text-ink-faint" />
                </div>
              )}
            </div>
            {/* Upload overlay */}
            <button
              onClick={() => profileInputRef.current?.click()}
              disabled={profileUploading}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white shadow hover:bg-brand-light transition-colors disabled:opacity-60"
              aria-label="Change profile photo"
            >
              {profileUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={profileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleProfilePhoto}
            />
          </div>

          {/* Name + member since */}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-ink">
              {data.name || "Your Name"}
            </h2>
            <p className="text-sm text-ink-soft">Member since {memberSinceStr}</p>
            <p className="mt-1 text-xs text-ink-faint">Max 5 MB · JPG, PNG, or WebP</p>
          </div>
        </div>
      </div>

      {/* ── Personal Info Card ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-sand-dark">
        <h3 className="mb-5 text-sm font-semibold text-ink">Personal Information</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Full name */}
          <Field label="Full Name" icon={User} error={errors.name}>
            <input
              type="text"
              value={data.name}
              placeholder="Your full legal name"
              onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
              className={inputCls}
            />
          </Field>

          {/* Email */}
          <Field
            label="Email Address"
            icon={Mail}
            hint="Optional — used for booking receipts"
            error={errors.email}
          >
            <input
              type="email"
              value={data.email}
              placeholder="you@example.com"
              onChange={(e) => setData((d) => ({ ...d, email: e.target.value }))}
              className={inputCls}
            />
          </Field>


        </div>

        {/* ── Phone number (with OTP change flow) ──────────────────────── */}
        <div className="mt-4">
          <Field label="Phone Number" icon={Phone} hint="Primary identifier — requires OTP to change">
            <div className="flex gap-2">
              <input
                type="tel"
                value={data.phone}
                readOnly
                disabled
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={() => { setPhoneChangeMode(true); setOtpSent(false); setOtpError(""); }}
                className="flex items-center gap-1.5 rounded-xl border border-sand-dark px-3 text-sm font-medium text-brand hover:border-brand hover:bg-sand transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" /> Change
              </button>
            </div>
          </Field>

          {/* OTP change flow */}
          {phoneChangeMode && (
            <div className="mt-3 rounded-xl border border-sand-dark bg-bone p-4 space-y-3">
              <p className="text-xs font-medium text-ink-muted">
                Enter your new phone number — we&apos;ll send a verification code.
              </p>
              {!otpSent ? (
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="07X XXX XXXX"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    onClick={handleSendOtp}
                    disabled={otpLoading}
                    className="flex items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60 transition-colors"
                  >
                    {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Code"}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    className={`${inputCls} flex-1 text-center tracking-widest`}
                  />
                  <button
                    onClick={handleVerifyOtp}
                    disabled={otpLoading}
                    className="flex items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60 transition-colors"
                  >
                    {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                  </button>
                </div>
              )}
              {otpError && (
                <p className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" /> {otpError}
                </p>
              )}
              <button
                onClick={() => { setPhoneChangeMode(false); setOtpSent(false); setNewPhone(""); setOtpValue(""); }}
                className="text-xs text-ink-faint hover:text-ink-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>


      {/* ── Save Bar ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 flex items-center justify-between rounded-2xl border border-sand-dark bg-white p-4 shadow-lg">
        {globalError ? (
          <p className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {globalError}
          </p>
        ) : saved ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Profile saved successfully
          </p>
        ) : (
          <p className="text-xs text-ink-faint">Changes are saved to your account.</p>
        )}

        <button
          onClick={handleSave}
          disabled={isPending || profileUploading}
          className="flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-light active:scale-95 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </div>
  );
}
