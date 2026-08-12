"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

export default function RunReconciliation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/reconcile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reconciliation failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-danger-strong">{error}</span>}
      <button
        onClick={run}
        disabled={busy}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {busy ? "Checking…" : "Run check"}
      </button>
    </div>
  );
}
