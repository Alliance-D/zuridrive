/**
 * app/api/payments/momo/callback/route.ts
 *
 * POST /api/payments/momo/callback — MTN calls this when a payment resolves.
 *
 * WHY THIS ENDPOINT MATTERS
 * Without it, a payment is only ever confirmed by the client's browser polling
 * after they approve the prompt. Close the tab, lose signal, or let the phone
 * sleep, and the money leaves the customer's account while the booking sits
 * unconfirmed forever. The callback is what makes confirmation independent of
 * whether the customer is still watching.
 *
 * SECURITY
 * MTN does not sign these callbacks, so the body is untrusted input: anyone who
 * learns a reference could POST a fake "SUCCESSFUL". We therefore take ONLY the
 * reference id from the body and ask MTN ourselves what the status is. A forged
 * callback achieves nothing beyond making us re-check a payment we already own.
 *
 * We answer 200 for anything we cannot act on. A non-2xx makes MTN retry, and
 * there is nothing to retry for a malformed or unrecognised payload — that
 * outcome goes in the response body and the logs instead. A genuine failure on
 * our side does return 500, because there the retry is exactly what we want.
 */

import { NextRequest, NextResponse } from 'next/server'
import { settleMoMoReference } from '@/lib/payments/settle'

/** MTN puts the reference in different places depending on the product. */
function extractReference(body: unknown, req: NextRequest): string | null {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('referenceId') ?? url.searchParams.get('id')
  if (fromQuery) return fromQuery

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    for (const key of ['referenceId', 'externalId', 'financialTransactionId', 'id']) {
      const value = b[key]
      if (typeof value === 'string' && value.length > 0) return value
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  let body: unknown = null

  try {
    body = await req.json()
  } catch {
    // An unparseable body is not worth a retry.
    return NextResponse.json(
      { received: true, handled: false, reason: 'unparseable body' },
      { status: 200 },
    )
  }

  const referenceId = extractReference(body, req)

  if (!referenceId) {
    console.warn('[momo/callback] No reference id in payload', body)
    return NextResponse.json(
      { received: true, handled: false, reason: 'no reference id' },
      { status: 200 },
    )
  }

  try {
    // Everything real happens here — and identically to the polling path.
    const result = await settleMoMoReference(referenceId)

    console.log(
      '[momo/callback] %s -> %s (%s)',
      referenceId,
      result.outcome,
      result.kind ?? 'unmatched',
    )

    return NextResponse.json({
      received: true,
      handled: result.outcome !== 'UNKNOWN_REFERENCE',
      outcome: result.outcome,
    })
  } catch (error) {
    // Something on our side broke. A 500 asks MTN to try again, which is the
    // correct behaviour here: the payment is real and still unsettled.
    console.error('[momo/callback] Settlement failed for', referenceId, error)
    return NextResponse.json(
      { received: true, handled: false, reason: 'settlement error' },
      { status: 500 },
    )
  }
}

/**
 * Some MTN configurations verify a callback URL with a GET before enabling it.
 * Answering 200 costs nothing and avoids a failed setup handshake.
 */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'momo-callback' })
}
