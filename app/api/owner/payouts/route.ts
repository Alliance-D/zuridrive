/**
 * app/api/owner/payouts/route.ts
 *
 * POST /api/owner/payouts — owner requests a payout of their available balance.
 *
 * Financial rules:
 * - The amount is computed server-side from the Commission ledger. The client
 *   cannot name a figure.
 * - Every completed-but-unpaid booking is attached as a PayoutItem, so the
 *   payout is fully traceable back to individual trips.
 * - Payouts above the large-payout threshold are flagged for Super Admin
 *   sign-off in addition to the Finance Manager.
 * - Created as PENDING_REQUEST. Money only moves when finance marks it PAID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notifyAdminsWithModule } from '@/lib/notifications'
import { formatRWF } from '@/lib/currency'
import { getPlatformSettings } from '@/lib/platform-settings'
import { z } from 'zod'

const RequestPayoutSchema = z.object({
  method: z.enum(['MTN_MOMO', 'BANK_TRANSFER']),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Please sign in to continue.' },
        { status: 401 },
      )
    }

    const profile = await prisma.carOwnerProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        momoNumber: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
      },
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Only registered car owners can request a payout.' },
        { status: 403 },
      )
    }

    const parsed = RequestPayoutSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please choose how you want to be paid.' },
        { status: 400 },
      )
    }

    const { method } = parsed.data

    // The chosen method must actually be set up.
    if (method === 'MTN_MOMO' && !profile.momoNumber) {
      return NextResponse.json(
        { error: 'Add your MoMo number in your profile before requesting a payout.' },
        { status: 400 },
      )
    }
    if (method === 'BANK_TRANSFER' && !profile.bankAccountNumber) {
      return NextResponse.json(
        { error: 'Add your bank details in your profile before requesting a payout.' },
        { status: 400 },
      )
    }

    // One open request at a time keeps the ledger unambiguous.
    const openRequest = await prisma.payout.findFirst({
      where: {
        ownerId: profile.id,
        status: { in: ['PENDING_REQUEST', 'APPROVED'] },
      },
      select: { id: true },
    })
    if (openRequest) {
      return NextResponse.json(
        { error: 'You already have a payout in progress. We’ll notify you once it’s processed.' },
        { status: 409 },
      )
    }

    // Completed bookings whose earnings have not been attached to any payout.
    const payable = await prisma.booking.findMany({
      where: {
        car: { ownerId: profile.id },
        status: 'COMPLETED',
        payoutItems: { none: {} },
      },
      select: {
        id: true,
        commission: {
          select: { netOwnerAmount: true, commissionAmount: true, baseAmount: true },
        },
      },
    })

    const items = payable.filter((b) => b.commission !== null)

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'You have no earnings available to withdraw yet.' },
        { status: 400 },
      )
    }

    const grossAmount = items.reduce((s, b) => s + (b.commission!.baseAmount ?? 0), 0)
    const commissionDeducted = items.reduce(
      (s, b) => s + (b.commission!.commissionAmount ?? 0),
      0,
    )
    const netAmount = items.reduce((s, b) => s + (b.commission!.netOwnerAmount ?? 0), 0)

    const { largePayoutThreshold } = await getPlatformSettings()

    const payout = await prisma.payout.create({
      data: {
        ownerId: profile.id,
        status: 'PENDING_REQUEST',
        grossAmount,
        commissionDeducted,
        netAmount,
        method,
        momoNumber: method === 'MTN_MOMO' ? profile.momoNumber : null,
        bankName: method === 'BANK_TRANSFER' ? profile.bankName : null,
        bankAccountNumber:
          method === 'BANK_TRANSFER' ? profile.bankAccountNumber : null,
        requiresSuperAdminApproval: netAmount >= largePayoutThreshold,
        items: {
          create: items.map((b) => ({
            bookingId: b.id,
            amount: b.commission!.netOwnerAmount,
          })),
        },
      },
      select: { id: true, netAmount: true, requiresSuperAdminApproval: true },
    })

    await notifyAdminsWithModule('FINANCE_MANAGER', {
      type: 'PAYOUT_REQUESTED',
      title: 'New payout request',
      titleKey: 'newPayoutTitle',
      body: `${formatRWF(payout.netAmount)} requested across ${items.length} trip${
        items.length === 1 ? '' : 's'
      }.${payout.requiresSuperAdminApproval ? ' Requires Super Admin sign-off.' : ''}`,
      actionUrl: '/admin/finance/payouts',
      metadata: { payoutId: payout.id },
    })

    return NextResponse.json(
      {
        success: true,
        payoutId: payout.id,
        netAmount: payout.netAmount,
        tripCount: items.length,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/owner/payouts]', error)
    return NextResponse.json(
      { error: 'We couldn’t submit your request. Please try again.' },
      { status: 500 },
    )
  }
}
