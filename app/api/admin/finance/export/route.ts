/**
 * GET /api/admin/finance/export?type=… — CSV export of a finance ledger.
 *
 * Types: payments | payouts | deposits | commissions | subscriptions | reconciliation
 *
 * Amounts are exported as plain integers (RWF), not formatted strings, so the
 * output is usable in a spreadsheet without cleaning.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'

// Reads session headers — never prerender.
export const dynamic = 'force-dynamic'

type Row = Record<string, string | number | null | undefined>

/** RFC 4180 quoting — escape quotes by doubling, wrap anything risky. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(',')),
  ]
  // BOM so Excel reads UTF-8 correctly
  return '﻿' + lines.join('\r\n')
}

const d = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : ''

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const type = new URL(req.url).searchParams.get('type') ?? 'payments'

    // Deposits sit under the Deposit Manager module; everything else finance.
    const requiredModule = type === 'deposits' ? 'DEPOSIT_MANAGER' : 'FINANCE_MANAGER'
    const hasAccess = await requireModuleAccess(session.user.id, requiredModule)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    let rows: Row[] = []

    switch (type) {
      case 'payments': {
        const payments = await prisma.payment.findMany({
          include: {
            booking: {
              select: {
                reference: true,
                client: { select: { name: true, phone: true } },
                car: { select: { make: true, model: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
        rows = payments.map((p) => ({
          payment_id: p.id,
          booking_ref: p.booking.reference,
          client: p.booking.client.name,
          client_phone: p.booking.client.phone,
          car: `${p.booking.car.make} ${p.booking.car.model}`,
          method: p.method,
          status: p.status,
          voided: p.isVoided ? 'yes' : 'no',
          rental_rwf: p.rentalAmount,
          deposit_rwf: p.depositAmount,
          total_rwf: p.totalAmount,
          momo_reference: p.momoReference,
          created: d(p.createdAt),
          confirmed: d(p.confirmedAt),
        }))
        break
      }

      case 'payouts': {
        const payouts = await prisma.payout.findMany({
          include: {
            owner: { select: { user: { select: { name: true, phone: true } } } },
            _count: { select: { items: true } },
          },
          orderBy: { requestedAt: 'desc' },
        })
        rows = payouts.map((p) => ({
          payout_id: p.id,
          owner: p.owner.user.name,
          owner_phone: p.owner.user.phone,
          status: p.status,
          method: p.method,
          destination:
            p.method === 'MTN_MOMO' ? p.momoNumber : p.bankAccountNumber,
          trips: p._count.items,
          gross_rwf: p.grossAmount,
          commission_rwf: p.commissionDeducted,
          net_rwf: p.netAmount,
          large_payout: p.requiresSuperAdminApproval ? 'yes' : 'no',
          requested: d(p.requestedAt),
          approved: d(p.approvedAt),
          paid: d(p.paidAt),
          reference: p.referenceNumber,
          failure_reason: p.failureReason,
        }))
        break
      }

      case 'deposits': {
        const deposits = await prisma.deposit.findMany({
          include: {
            booking: {
              select: {
                reference: true,
                status: true,
                client: { select: { name: true } },
                car: { select: { make: true, model: true } },
              },
            },
          },
          orderBy: { heldAt: 'desc' },
        })
        rows = deposits.map((x) => ({
          deposit_id: x.id,
          booking_ref: x.booking.reference,
          booking_status: x.booking.status,
          client: x.booking.client.name,
          car: `${x.booking.car.make} ${x.booking.car.model}`,
          status: x.status,
          amount_rwf: x.amount,
          returned_to_client_rwf: x.clientRefundAmount,
          awarded_to_owner_rwf: x.ownerAwardAmount,
          held_at: d(x.heldAt),
          released_at: d(x.releasedAt),
          released_by: x.releaseTriggeredBy,
        }))
        break
      }

      case 'commissions': {
        const commissions = await prisma.commission.findMany({
          include: {
            booking: {
              select: {
                reference: true,
                status: true,
                tripEndedAt: true,
                createdAt: true,
                car: {
                  select: {
                    make: true,
                    model: true,
                    owner: { select: { user: { select: { name: true } } } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
        rows = commissions.map((c) => ({
          commission_id: c.id,
          booking_ref: c.booking.reference,
          booking_status: c.booking.status,
          owner: c.booking.car.owner.user.name,
          car: `${c.booking.car.make} ${c.booking.car.model}`,
          commissionable_rwf: c.baseAmount,
          rate_percent: c.rate,
          commission_rwf: c.commissionAmount,
          owner_net_rwf: c.netOwnerAmount,
          booked: d(c.booking.createdAt),
          completed: d(c.booking.tripEndedAt),
        }))
        break
      }

      case 'subscriptions': {
        const subs = await prisma.ownerSubscription.findMany({
          include: {
            plan: true,
            owner: { select: { user: { select: { name: true, phone: true } } } },
          },
          orderBy: { startedAt: 'desc' },
        })
        rows = subs.map((s) => ({
          subscription_id: s.id,
          owner: s.owner.user.name,
          owner_phone: s.owner.user.phone,
          plan: s.plan.name,
          tier: s.plan.tier,
          status: s.status,
          monthly_rwf: s.plan.priceMonthly,
          started: d(s.startedAt),
          expires: d(s.expiresAt),
          manual_override: s.isManualOverride ? 'yes' : 'no',
        }))
        break
      }

      case 'reconciliation': {
        const logs = await prisma.reconciliationLog.findMany({
          orderBy: { runAt: 'desc' },
        })
        rows = logs.map((l) => ({
          log_id: l.id,
          run_at: l.runAt.toISOString(),
          balanced: l.hasMismatch ? 'no' : 'yes',
          collected_rwf: l.totalCollected,
          paid_out_rwf: l.totalPaidOut,
          commission_rwf: l.totalCommission,
          deposits_held_rwf: l.totalDepositsHeld,
          deposits_released_rwf: l.totalDepositsReleased,
          deposits_withheld_rwf: l.totalDepositsWithheld,
          discrepancy_rwf: l.discrepancyAmount,
          notes: l.notes,
        }))
        break
      }

      default:
        return NextResponse.json(
          { error: `Unknown export type "${type}".` },
          { status: 400 },
        )
    }

    // Exports contain personal and financial data — record who took one.
    await logAdminAction({
      actorId: session.user.id,
      action: 'RECONCILIATION_ALERT_ACKNOWLEDGED',
      targetType: 'Export',
      description: `Exported ${rows.length} ${type} rows to CSV`,
      metadata: { type, rowCount: rows.length },
    })

    const stamp = new Date().toISOString().slice(0, 10)

    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zuridrive-${type}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[GET /api/admin/finance/export]', error)
    return NextResponse.json(
      { error: 'Export failed. Please try again.' },
      { status: 500 },
    )
  }
}
