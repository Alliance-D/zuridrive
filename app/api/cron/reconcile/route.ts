/**
 * app/api/cron/reconcile/route.ts
 *
 * GET /api/cron/reconcile — runs nightly.
 *
 * Checks that the books balance: everything collected should still be
 * accounted for as paid out, kept as commission, held as a deposit, or
 * returned. A gap means a record went missing or was written twice.
 *
 * The check itself already existed and was correct. What was missing is that
 * nothing ran it. It executed only when an admin opened the finance reports
 * page, so it answered "are my books balanced?" only for someone who had
 * already thought to ask — which is not what a safety net is for.
 *
 * Every run is written to ReconciliationLog whether or not it found anything.
 * A clean run is evidence too: it is what lets you say afterwards that the
 * books balanced on a given night, rather than that nobody looked.
 *
 * Only a mismatch notifies anyone. An alert every morning saying "all correct"
 * is an alert people stop reading.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runAndLogReconciliation } from '@/lib/finance/reconciliation'
import { notifyAdminsWithModule } from '@/lib/notifications'
import { formatRWF } from '@/lib/currency'
import { NotificationType } from '@prisma/client'

const CRON_SECRET = process.env.CRON_SECRET!

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { result, log } = await runAndLogReconciliation()

    if (!result.hasMismatch) {
      return NextResponse.json({
        ok: true,
        balanced: true,
        logId: log.id,
        checkedAt: log.createdAt,
      })
    }

    // A discrepancy is money that is somewhere it should not be. It goes to
    // whoever runs finance, and to the Super Admin, who cannot be excluded.
    const amount = formatRWF(Math.abs(result.discrepancyAmount))

    await notifyAdminsWithModule('FINANCE_MANAGER', {
      type: NotificationType.RECONCILIATION_MISMATCH,
      title: 'The books do not balance',
      body: `Tonight's check found a discrepancy of ${amount}. Open the finance reports for the breakdown.`,
      titleKey: 'reconciliationMismatchTitle',
      bodyKey: 'reconciliationMismatchBody',
      params: { amount },
      actionUrl: '/admin/finance/reports',
      metadata: { logId: log.id, discrepancyAmount: result.discrepancyAmount },
    })

    // Also to the server log: a notification can be dismissed, and this is the
    // kind of thing worth finding again later.
    console.error(
      `[reconcile] discrepancy of ${result.discrepancyAmount} — log ${log.id}`,
      result.notes,
    )

    return NextResponse.json({
      ok: true,
      balanced: false,
      discrepancyAmount: result.discrepancyAmount,
      logId: log.id,
      notes: result.notes,
    })
  } catch (error) {
    // A check that cannot run is itself worth knowing about, but it must not
    // take the cron down noisily every night on a transient database blip.
    console.error('[reconcile] check failed to run', error)
    return NextResponse.json(
      { ok: false, error: 'Reconciliation check failed to run.' },
      { status: 500 },
    )
  }
}
