"use client";

/**
 * TeamManager — create sub-admins and manage their modules.
 *
 * Module descriptions are spelled out rather than shown as bare enum names,
 * because granting FINANCE_MANAGER or DEPOSIT_MANAGER hands someone control
 * over money and the person doing the granting should see that plainly.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Loader2,
  AlertCircle,
  UserPlus,
  Check,
  Ban,
  RotateCcw,
  Trash2,
  ShieldAlert,
} from "lucide-react";

// Keys, not text — module scope has no translator.
export const MODULES = [
  {
    id: "USER_MANAGER",
    labelKey: "moduleUserManager",
    descKey: "modUserManagerDesc",
  },
  {
    id: "FLEET_MANAGER",
    labelKey: "moduleFleetManager",
    descKey: "modFleetManagerDesc",
  },
  {
    id: "BOOKING_MANAGER",
    labelKey: "moduleBookingManager",
    descKey: "modBookingManagerDesc",
  },
  {
    id: "FINANCE_MANAGER",
    labelKey: "moduleFinanceManager",
    descKey: "modFinanceManagerDesc",
    sensitive: true,
  },
  {
    id: "DEPOSIT_MANAGER",
    labelKey: "moduleDepositManager",
    descKey: "modDepositManagerDesc",
    sensitive: true,
  },
  {
    id: "CONTENT_MODERATOR",
    labelKey: "moduleContentModerator",
    descKey: "modContentModeratorDesc",
  },
  {
    id: "COMMUNICATIONS",
    labelKey: "moduleCommunications",
    descKey: "modCommunicationsDesc",
  },
  {
    id: "ANALYTICS_VIEWER",
    labelKey: "moduleAnalyticsViewer",
    descKey: "modAnalyticsViewerDesc",
  },
  {
    id: "SUPPORT_AGENT",
    labelKey: "moduleSupportAgent",
    descKey: "modSupportAgentDesc",
  },
] as const;

type ModuleId = (typeof MODULES)[number]["id"];

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  isSuspended: boolean;
  roleModules: string[];
  createdAt: string;
}

export default function TeamManager({ members }: { members: TeamMember[] }) {
  const t = useTranslations("adminForms");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {creating ? (
        <CreateForm
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <UserPlus className="h-4 w-4" />
          {t("addAnAdmin")}
        </button>
      )}

      <div className="space-y-2">
        {members.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-ink-soft shadow-sm">
            No sub-admins yet. Every section is Super Admin only until you add
            someone.
          </p>
        ) : (
          members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              editing={editing === m.id}
              onEdit={() => setEditing(editing === m.id ? null : m.id)}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Create ────────────────────────────────────────────────────────────────

function CreateForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("adminForms");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<ModuleId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: ModuleId) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/subadmins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          roleModules: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("couldNotCreateAdmin"));
        return;
      }
      onDone();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    name.trim().length >= 2 && phone.trim().length >= 10 && selected.length > 0;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-ink">{t("newAdmin")}</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("fullName")}>
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label={t("phoneNumber")}>
          <input
            className={input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("phonePlaceholder")}
            inputMode="tel"
          />
        </Field>
        <Field label={t("emailOptional")}>
          <input
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
        </Field>
      </div>

      <p className="mb-2 mt-4 text-xs font-medium text-ink-muted">
        What can they access?
      </p>
      <ModulePicker selected={selected} onToggle={toggle} />

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-danger-bg p-3">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <p className="mt-3 text-[11px] text-ink-faint">
        They sign in with their phone number and a texted code — there is no
        password to share.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={submit}
          disabled={!canSubmit || busy}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Create admin
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  editing,
  onEdit,
  onDone,
}: {
  member: TeamMember;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("adminForms");
  const tc = useTranslations("common");
  const [selected, setSelected] = useState<ModuleId[]>(
    member.roleModules as ModuleId[],
  );
  const [mode, setMode] = useState<null | "suspend" | "revoke">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subadmins/${member.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? tc("genericError"));
        return;
      }
      setMode(null);
      onDone();
    } catch {
      setError(tc("networkRetry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">{member.name}</p>
            {member.isSuspended && (
              <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-semibold text-danger">
                suspended
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft">
            {member.phone}
            {member.email ? ` · ${member.email}` : ""}
          </p>
          {!editing && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {member.roleModules.length === 0 ? (
                <span className="text-[11px] text-ink-faint">{t("noModules")}</span>
              ) : (
                member.roleModules.map((r) => {
                  const mod = MODULES.find((m) => m.id === r);
                  return (
                    <span
                      key={r}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        mod && "sensitive" in mod && mod.sensitive
                          ? "bg-warning-tint text-warning-dark"
                          : "bg-sand text-ink-muted"
                      }`}
                    >
                      {mod ? t(mod.labelKey) : r}
                    </span>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={onEdit}
            className="rounded-lg border border-sand-dark px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-brand"
          >
            {editing ? "Close" : "Edit access"}
          </button>
          {member.isSuspended ? (
            <button
              onClick={() => call("PATCH", { action: "reinstate" })}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-sand-dark px-2.5 py-1.5 text-[11px] font-semibold text-success hover:border-success"
            >
              <RotateCcw className="h-3 w-3" />
              {t("reinstate")}
            </button>
          ) : (
            <button
              onClick={() => setMode("suspend")}
              className="flex items-center gap-1 rounded-lg border border-sand-dark px-2.5 py-1.5 text-[11px] font-semibold text-warning-dark hover:border-warning-dark"
            >
              <Ban className="h-3 w-3" />
              {t("suspend")}
            </button>
          )}
          <button
            onClick={() => setMode("revoke")}
            className="flex items-center gap-1 rounded-lg border border-danger-soft px-2.5 py-1.5 text-[11px] font-semibold text-danger-strong hover:bg-danger-tint"
          >
            <Trash2 className="h-3 w-3" />
            Revoke
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t border-sand pt-3">
          <ModulePicker
            selected={selected}
            onToggle={(id) =>
              setSelected((s) =>
                s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
              )
            }
          />
          <button
            onClick={() =>
              call("PATCH", { action: "update_modules", roleModules: selected })
            }
            disabled={busy || selected.length === 0}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Save access
          </button>
        </div>
      )}

      {mode === "suspend" && (
        <div className="mt-3 space-y-2 border-t border-sand pt-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("whySuspendAdmin")}
            autoFocus
            className={input}
          />
          <div className="flex gap-2">
            <button
              onClick={() => call("PATCH", { action: "suspend", reason: reason.trim() })}
              disabled={busy || reason.trim().length < 5}
              className="rounded-lg bg-warning-dark px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {t("confirmSuspend")}
            </button>
            <button
              onClick={() => setMode(null)}
              className="text-[11px] font-semibold text-ink-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "revoke" && (
        <div className="mt-3 space-y-2 border-t border-sand pt-3">
          <div className="flex items-start gap-2 rounded-lg bg-danger-bg p-2.5">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-danger" />
            <p className="text-xs text-danger">
              This removes all admin access and turns the account back into a
              normal client. Their history and audit trail are kept.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => call("DELETE")}
              disabled={busy}
              className="rounded-lg bg-danger-strong px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Revoking…" : "Revoke access"}
            </button>
            <button
              onClick={() => setMode(null)}
              className="text-[11px] font-semibold text-ink-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger-strong">{error}</p>}
    </div>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────

function ModulePicker({
  selected,
  onToggle,
}: {
  selected: ModuleId[];
  onToggle: (id: ModuleId) => void;
}) {
  const t = useTranslations("adminForms");
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {MODULES.map((m) => {
        const on = selected.includes(m.id);
        const sensitive = "sensitive" in m && m.sensitive;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onToggle(m.id)}
            className={`flex items-start gap-2 rounded-xl border-2 p-2.5 text-left transition-colors ${
              on
                ? "border-brand bg-brand/5"
                : "border-sand-dark hover:border-ink-faint"
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                on ? "border-brand bg-brand" : "border-sand-dark"
              }`}
            >
              {on && <Check className="h-2.5 w-2.5 text-white" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-ink">
                  {t(m.labelKey)}
                </span>
                {sensitive && (
                  <span className="rounded-full bg-warning-tint px-1.5 text-[9px] font-bold text-warning-dark">
                    {t("money")}
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-ink-soft">
                {t(m.descKey)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const input =
  "w-full rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
