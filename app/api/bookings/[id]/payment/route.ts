/**
 * app/api/bookings/[bookingId]/payment/route.ts
 *
 * POST /api/bookings/[bookingId]/payment
 *
 * Two sub-actions via action field:
 * 1. "initiate_momo"  — push USSD prompt to client phone, store referenceId
 * 2. "confirm_momo"   — poll MTN API, update payment status if confirmed
 * 3. "bank_transfer"  — store proof of payment URL, queue for Finance Manager
 *
 * Booking only moves to PAYMENT_CONFIRMED after full verification.
 * Never confirmed on initiation alone.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatPhoneForMoMo } from '@/lib/payments/momo'
import { getPaymentProvider } from '@/lib/payments'
import { settleBookingPayment } from '@/lib/payments/settle'
import { notifyAdminsWithModule } from '@/lib/notifications'
import { formatRWF } from '@/lib/currency'
import { uploadedFileUrl } from '@/lib/validation/urls'
import { z } from 'zod'

const InitiateMoMoSchema = z.object({
  action: z.literal('initiate_momo'),
  phoneNumber: z.string().min(10),
})

const ConfirmMoMoSchema = z.object({
  action: z.literal('confirm_momo'),
  referenceId: z.string().uuid(),
})

const BankTransferSchema = z.object({
  action: z.literal('bank_transfer'),
  proofUrl: uploadedFileUrl,
  uploaderName: z.string().optional(),
})

const PaymentActionSchema = z.discriminatedUnion('action', [
  InitiateMoMoSchema,
  ConfirmMoMoSchema,
  BankTransferSchema,
])

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // ── Who is asking ──────────────────────────────────────────────────────
    //
    // This route had no authentication at all. A booking id is not a secret —
    // it sits in a URL — and initiate_momo takes the destination phone number
    // from the request body, so anyone holding an id could push a payment
    // prompt to any number they chose, repeatedly, at the platform's expense
    // and to a stranger's phone.
    //
    // Checked before the body is parsed, so an anonymous caller cannot use the
    // validation errors to learn what this endpoint accepts.
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = PaymentActionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payment request.' }, { status: 400 })
    }

    // Load booking with payment record
    const booking = await db.booking.findUnique({
      where: { id: params.id },
      include: {
        // A booking can accumulate several payment rows (retries, refunds).
        // The live one is the newest non-voided record.
        payments: {
          where: { isVoided: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        client: { select: { id: true, phone: true, name: true } },
        car: {
          select: {
            make: true,
            model: true,
            owner: {
              include: { user: { select: { id: true, phone: true, name: true } } },
            },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    // Only the client the booking belongs to may act on its payment. Finance
    // staff use their own admin routes, which log what they do.
    if (booking.clientId !== session.user.id) {
      // 404 rather than 403: confirming that a booking exists to someone who
      // has no business with it is itself a small leak.
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    const payment = booking.payments[0]
    if (!payment) {
      return NextResponse.json(
        { error: 'No payment record found for this booking.' },
        { status: 404 },
      )
    }

    // Booking has no single "total charged" column — it is rental + deposit.
    const totalChargedNow = booking.subtotal + booking.depositAmount

    if (booking.status !== 'PENDING_PAYMENT') {
      return NextResponse.json(
        { error: 'This booking has already been processed.' },
        { status: 400 },
      )
    }

    const action = parsed.data.action

    // -----------------------------------------------------------------------
    // ACTION: initiate_momo
    // Push USSD prompt to client's phone, store MTN referenceId
    // -----------------------------------------------------------------------
    if (action === 'initiate_momo') {
      const { phoneNumber } = parsed.data
      const formattedPhone = formatPhoneForMoMo(phoneNumber)

      // Charge through the provider interface rather than calling MTN
      // directly. This used to import requestToPay() straight from
      // lib/payments/momo, which meant the booking flow knew which provider it
      // was talking to — so adding a second one would have required finding and
      // rewriting this call site. Now it asks whoever is configured.
      const provider = getPaymentProvider()

      // Guard: a provider that cannot collect must never be asked to. The
      // registry already falls back to DIRECT on a misconfiguration, and DIRECT
      // has no USSD prompt to send, so reaching here means something upstream
      // offered a payment method that is not actually available.
      if (!provider.canCollect) {
        return NextResponse.json(
          {
            error:
              'Mobile money payments are not available yet. This booking settles directly with the owner.',
          },
          { status: 409 },
        )
      }

      const { reference: referenceId } = await provider.charge({
        amount: totalChargedNow,
        phoneNumber: formattedPhone,
        externalId: booking.reference,
        description: `ZuriDrive booking ${booking.reference} — ${booking.car.make} ${booking.car.model}`,
      })

      // Store the MTN reference ID on the payment record
      await db.payment.update({
        where: { id: payment.id },
        data: {
          momoReference: referenceId,
          momoNumber: formattedPhone,
          // Stays PENDING until MTN confirms — PaymentStatus has no
          // intermediate "processing" state, and inventing one would break
          // the finance ledger's assumptions.
          status: 'PENDING',
        },
      })

      return NextResponse.json({
        success: true,
        referenceId,
        message: 'A payment prompt has been sent to your phone. Please approve it to confirm your booking.',
      })
    }

    // -----------------------------------------------------------------------
    // ACTION: confirm_momo
    // Check MTN API for payment status
    // -----------------------------------------------------------------------
    if (action === 'confirm_momo') {
      // All the real work lives in settleBookingPayment(), which the MTN
      // callback webhook also calls. Keeping one implementation is what stops
      // a payment confirmed by webhook and one confirmed by polling from
      // producing different results.
      const settlement = await settleBookingPayment(parsed.data.referenceId)

      switch (settlement.outcome) {
        case 'CONFIRMED':
        case 'ALREADY_SETTLED':
          return NextResponse.json({ status: 'CONFIRMED', bookingId: booking.id })

        case 'FAILED':
          return NextResponse.json({
            status: 'FAILED',
            error: 'Payment was not approved. Please try again or use bank transfer.',
          })

        case 'UNKNOWN_REFERENCE':
          return NextResponse.json(
            { error: 'We could not find that payment. Please start again.' },
            { status: 404 },
          )

        default:
          return NextResponse.json({ status: 'PENDING' })
      }
    }

    // -----------------------------------------------------------------------
    // ACTION: bank_transfer
    // Store proof URL, mark for Finance Manager review
    // -----------------------------------------------------------------------
    if (action === 'bank_transfer') {
      const { proofUrl } = parsed.data

      await db.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            // Remains PENDING — a Finance Manager confirms it manually, which
            // is what sets CONFIRMED and confirmedById.
            status: 'PENDING',
            proofUrl,
          },
        })

        // Booking stays at PENDING_PAYMENT until Finance Manager confirms
        // (bank transfer is never auto-confirmed)
      })

      // Notify every Finance Manager (and all super admins)
      await notifyAdminsWithModule('FINANCE_MANAGER', {
        type: 'BANK_TRANSFER_PENDING',
        title: 'Bank transfer proof uploaded',
        body: `Booking ${booking.reference} — ${formatRWF(totalChargedNow)} — awaiting confirmation`,
        titleKey: 'bankProofTitle',
        bodyKey: 'bankProofBody',
        params: {
          reference: booking.reference,
          amount: formatRWF(totalChargedNow),
        },
        actionUrl: '/admin/finance/payments',
        metadata: { bookingId: booking.id, paymentId: payment.id },
      })

      return NextResponse.json({
        success: true,
        message: 'Your payment proof has been received. Our finance team will confirm within a few hours.',
      })
    }
  } catch (error) {
    console.error('[POST /api/bookings/[bookingId]/payment]', error)
    return NextResponse.json(
      { error: 'Something went wrong processing your payment. Please try again.' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/bookings/[bookingId]/payment
 * Poll payment status — used by frontend to check MoMo confirmation
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Same rule as POST: a booking id in a URL is not authorisation to read
    // its payment state.
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const booking = await db.booking.findUnique({
      where: { id: params.id },
      select: {
        status: true,
        clientId: true,
        payments: {
          where: { isVoided: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          // totalAmount is what the renter is actually asked to approve on
          // their phone. The payment screen had no amount available and was
          // interpolating its elapsed-seconds counter instead, so it read
          // "approve RWF 0", then 1, then 2 — a wrong figure, counting up.
          select: { status: true, momoReference: true, totalAmount: true },
        },
      },
    })

    if (!booking || booking.clientId !== session.user.id) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    const latestPayment = booking.payments[0]

    return NextResponse.json({
      bookingStatus: booking.status,
      paymentStatus: latestPayment?.status,
      momoReference: latestPayment?.momoReference,
      totalAmount: latestPayment?.totalAmount ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Could not check payment status.' }, { status: 500 })
  }
}
