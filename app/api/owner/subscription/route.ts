/**
 * app/api/owner/subscription/route.ts
 *
 * POST /api/owner/subscription — an owner buys or renews a plan.
 *
 * Three actions, mirroring the booking payment flow:
 *   initiate_momo  — push a USSD prompt to the owner's phone
 *   confirm_momo   — poll MTN; only a SUCCESSFUL result activates the plan
 *   bank_transfer  — store proof, queue it for a Finance Manager
 *
 * Nothing here grants a benefit. The subscription sits at PENDING_PAYMENT,
 * which every entitlement check ignores, until money is actually verified —
 * and activation happens in exactly one place, activateSubscription().
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatPhoneForMoMo } from '@/lib/payments/momo'
import { getPaymentProviderForCountry } from '@/lib/payments'
import { settleSubscriptionPayment } from '@/lib/payments/settle'
import { beginSubscriptionPurchase } from '@/lib/subscriptions/checkout'
import { notifyAdminsWithModule } from '@/lib/notifications'
import { formatMoney } from '@/lib/currency'
import { uploadedFileUrl } from '@/lib/validation/urls'
import { z } from 'zod'

const InitiateMoMoSchema = z.object({
  action: z.literal('initiate_momo'),
  planId: z.string().min(1),
  phoneNumber: z.string().min(10),
})

const ConfirmMoMoSchema = z.object({
  action: z.literal('confirm_momo'),
  subscriptionId: z.string().min(1),
})

const BankTransferSchema = z.object({
  action: z.literal('bank_transfer'),
  planId: z.string().min(1),
  proofUrl: uploadedFileUrl,
})

const ActionSchema = z.discriminatedUnion('action', [
  InitiateMoMoSchema,
  ConfirmMoMoSchema,
  BankTransferSchema,
])

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const profile = await prisma.carOwnerProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Finish setting up your owner profile first.' },
        { status: 403 },
      )
    }

    const parsed = ActionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'That request was incomplete. Please try again.' },
        { status: 400 },
      )
    }

    // ── MoMo: push the prompt ─────────────────────────────────────────────
    if (parsed.data.action === 'initiate_momo') {
      const { planId, phoneNumber } = parsed.data

      const purchase = await beginSubscriptionPurchase(
        profile.id,
        planId,
        'MTN_MOMO',
      )

      const momoNumber = formatPhoneForMoMo(phoneNumber)

      // Through the provider interface, same as the booking flow — this used
      // to call MTN directly, which is the coupling that makes adding a second
      // provider expensive.
      //
      // An owner pays their subscription in their own market: a Ugandan owner
      // is collected by the Ugandan MTN account, not the Rwandan one.
      const ownerCountry = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { country: { select: { paymentProvider: true } } },
      })
      const provider = getPaymentProviderForCountry(
        ownerCountry?.country?.paymentProvider,
      )
      if (!provider.canCollect) {
        return NextResponse.json(
          {
            error:
              'Mobile money payments are not available yet. Contact ZuriDrive to arrange your subscription.',
          },
          { status: 409 },
        )
      }

      const { reference: referenceId } = await provider.charge({
        amount: purchase.priceMonthly,
        phoneNumber: momoNumber,
        externalId: purchase.id,
        description: `ZuriDrive ${purchase.planName} plan — monthly subscription`,
      })

      await prisma.ownerSubscription.update({
        where: { id: purchase.id },
        data: { momoNumber, momoReference: referenceId },
      })

      return NextResponse.json({
        success: true,
        subscriptionId: purchase.id,
        message:
          'Check your phone and approve the payment prompt to activate your plan.',
      })
    }

    // ── MoMo: check whether it went through ───────────────────────────────
    if (parsed.data.action === 'confirm_momo') {
      // Ownership check first: settleSubscriptionPayment() works from a MoMo
      // reference alone, so without this any signed-in owner could settle
      // somebody else's subscription by guessing an id.
      const subscription = await prisma.ownerSubscription.findFirst({
        where: { id: parsed.data.subscriptionId, ownerId: profile.id },
        select: { momoReference: true },
      })

      if (!subscription?.momoReference) {
        return NextResponse.json(
          { error: 'We couldn’t find that payment. Please start again.' },
          { status: 404 },
        )
      }

      // Shared with the MTN callback webhook — see lib/payments/settle.
      const settlement = await settleSubscriptionPayment(subscription.momoReference)

      if (settlement.outcome === 'CONFIRMED' || settlement.outcome === 'ALREADY_SETTLED') {
        const active = await prisma.ownerSubscription.findUniqueOrThrow({
          where: { id: parsed.data.subscriptionId },
          include: { plan: { select: { name: true } } },
        })
        return NextResponse.json({
          status: 'CONFIRMED',
          planName: active.plan.name,
          expiresAt: active.expiresAt,
        })
      }

      if (settlement.outcome === 'FAILED') {
        return NextResponse.json({
          status: 'FAILED',
          error: 'That payment wasn’t approved. Try again, or pay by bank transfer.',
        })
      }

      return NextResponse.json({ status: 'PENDING' })
    }

    // ── Bank transfer: proof goes to Finance ──────────────────────────────
    const { planId, proofUrl } = parsed.data

    const purchase = await beginSubscriptionPurchase(
      profile.id,
      planId,
      'BANK_TRANSFER',
    )

    await prisma.ownerSubscription.update({
      where: { id: purchase.id },
      data: { paymentProofUrl: proofUrl },
    })

    await notifyAdminsWithModule('FINANCE_MANAGER', {
      type: 'BANK_TRANSFER_PENDING',
      title: 'Subscription payment proof uploaded',
      body: `${purchase.planName} — ${formatMoney(purchase.priceMonthly)} — awaiting confirmation`,
      titleKey: 'subscriptionProofTitle',
      bodyKey: 'subscriptionProofBody',
      params: {
        plan: purchase.planName,
        amount: formatMoney(purchase.priceMonthly),
      },
      actionUrl: '/admin/finance/subscriptions',
      metadata: { subscriptionId: purchase.id },
    })

    return NextResponse.json({
      success: true,
      subscriptionId: purchase.id,
      message:
        'We’ve got your proof of payment. Finance will confirm it within a few hours and your plan starts then.',
    })
  } catch (error) {
    console.error('[POST /api/owner/subscription]', error)
    return NextResponse.json(
      { error: 'We couldn’t process that. Please try again.' },
      { status: 500 },
    )
  }
}
