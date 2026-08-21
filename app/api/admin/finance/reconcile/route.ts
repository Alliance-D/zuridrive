/**
 * POST /api/admin/finance/reconcile — run a reconciliation check.
 *
 * Appends a ReconciliationLog row and, if the books don't balance, alerts
 * every Super Admin. Finance Managers can run the check; only Super Admins get
 * the mismatch alert, since a discrepancy implies something wrote outside the
 * normal flow.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { runAndLogReconciliation } from '@/lib/finance/reconciliation'
import { formatMoney } from '@/lib/currency'
import { Prisma, NotificationChannel } from '@prisma/client'

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const hasAccess = await requireModuleAccess(session.user.id, 'FINANCE_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const { result, log } = await runAndLogReconciliation()

    await logAdminAction({
      actorId: session.user.id,
      action: 'RECONCILIATION_ALERT_ACKNOWLEDGED',
      targetType: 'ReconciliationLog',
      targetId: log.id,
      description: result.hasMismatch
        ? `Reconciliation found a ${formatMoney(result.discrepancyAmount)} discrepancy`
        : 'Reconciliation ran clean',
      metadata: {
        discrepancyAmount: result.discrepancyAmount,
        hasMismatch: result.hasMismatch,
      },
    })

    if (result.hasMismatch) {
      const superAdmins = await prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', isSuspended: false },
        select: { id: true },
      })

      if (superAdmins.length > 0) {
        await prisma.notification.createMany({
          data: superAdmins.map((a) => ({
            userId: a.id,
            type: 'ADMIN_BROADCAST' as const,
            channel: NotificationChannel.IN_APP,
            title: 'Reconciliation mismatch',
            body: `The books are off by ${formatMoney(result.discrepancyAmount)}. ${result.notes[0] ?? ''}`,
            titleKey: 'reconciliationMismatchTitle',
            bodyKey: 'reconciliationMismatchBody',
            params: {
              amount: formatMoney(result.discrepancyAmount),
              note: result.notes[0] ?? '',
            } as Prisma.InputJsonValue,
            actionUrl: '/admin/finance/reports',
            metadata: { logId: log.id } as Prisma.InputJsonValue,
          })),
        })

        await prisma.reconciliationLog.update({
          where: { id: log.id },
          data: { mismatchAlertSentAt: new Date() },
        })
      }
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('[POST /api/admin/finance/reconcile]', error)
    return NextResponse.json(
      { error: 'Reconciliation failed to run. Please try again.' },
      { status: 500 },
    )
  }
}
