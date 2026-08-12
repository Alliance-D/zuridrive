/**
 * lib/payments/momo.ts
 *
 * MTN Mobile Money (Rwanda) API client.
 * Handles: USSD push (Collections), status polling, disbursements (future).
 * All amounts are in RWF integers — never decimals.
 *
 * API flow:
 * 1. requestToPay() → sends USSD prompt to client's phone
 * 2. Client confirms on their phone
 * 3. getPaymentStatus() → poll until SUCCESSFUL or FAILED
 */

const MOMO_BASE_URL = process.env.MTN_MOMO_BASE_URL!        // e.g. https://sandbox.momodeveloper.mtn.com
const MOMO_COLLECTION_KEY = process.env.MTN_MOMO_COLLECTION_PRIMARY_KEY!
const MOMO_API_USER = process.env.MTN_MOMO_API_USER!
const MOMO_API_KEY = process.env.MTN_MOMO_API_KEY!
const MOMO_ENVIRONMENT = process.env.MTN_MOMO_ENVIRONMENT || 'sandbox'  // 'sandbox' | 'production'
const MOMO_CURRENCY = 'RWF'

/**
 * Where MTN should call us back when a payment resolves.
 *
 * Without this header MTN never calls, and confirmation depends entirely on the
 * customer keeping the tab open — close it at the wrong moment and the money
 * leaves their account with the booking still unconfirmed.
 *
 * MTN only accepts a publicly reachable HTTPS URL, so this is skipped in local
 * development, where polling remains the only path.
 */
function callbackUrl(): string | null {
  const base = process.env.MTN_MOMO_CALLBACK_URL ?? process.env.NEXTAUTH_URL
  if (!base) return null
  if (!base.startsWith('https://')) return null
  return `${base.replace(/\/$/, '')}/api/payments/momo/callback`
}

export type MoMoPaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED'

export interface MoMoPaymentRequest {
  amount: number           // RWF integer
  phoneNumber: string      // e.g. 2507XXXXXXXX (international format)
  externalId: string       // our booking reference — for reconciliation
  payerMessage: string     // shown to client on USSD prompt
  payeeNote: string        // internal note
}

export interface MoMoPaymentResult {
  referenceId: string      // MTN's transaction UUID — store this
  status: MoMoPaymentStatus
  reason?: string          // failure reason if FAILED
  /**
   * What MTN says was actually paid, in RWF. Their status response carries it
   * and we used to discard it — but a provider reporting SUCCESSFUL for less
   * than we asked for is a real failure mode, and one that is invisible if you
   * only read the status field. See StatusResult in lib/payments/provider.ts.
   */
  amount?: number
}

/**
 * Build the Authorization header for MTN MoMo Collections API.
 * Uses Basic auth with apiUser:apiKey encoded in base64.
 */
function buildAuthHeader(): string {
  const credentials = Buffer.from(`${MOMO_API_USER}:${MOMO_API_KEY}`).toString('base64')
  return `Basic ${credentials}`
}

/**
 * Step 1: Initiate a payment request — sends USSD prompt to client's phone.
 * Returns a referenceId (UUID) that we use to poll for status.
 * Store this referenceId in the Payment record immediately.
 */
export async function requestToPay(request: MoMoPaymentRequest): Promise<string> {
  // MTN MoMo requires a UUID as the X-Reference-Id header
  const referenceId = crypto.randomUUID()

  const callback = callbackUrl()

  const response = await fetch(`${MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      'Authorization': buildAuthHeader(),
      'X-Reference-Id': referenceId,
      'X-Target-Environment': MOMO_ENVIRONMENT,
      'Ocp-Apim-Subscription-Key': MOMO_COLLECTION_KEY,
      'Content-Type': 'application/json',
      // Omitted in local dev, where MTN cannot reach us.
      ...(callback ? { 'X-Callback-Url': callback } : {}),
    },
    body: JSON.stringify({
      amount: request.amount.toString(),   // MTN API expects string
      currency: MOMO_CURRENCY,
      externalId: request.externalId,
      payer: {
        partyIdType: 'MSISDN',
        partyId: request.phoneNumber,
      },
      payerMessage: request.payerMessage,
      payeeNote: request.payeeNote,
    }),
  })

  // 202 Accepted = request queued successfully
  if (response.status !== 202) {
    const error = await response.text()
    throw new Error(`MTN MoMo requestToPay failed: ${response.status} — ${error}`)
  }

  return referenceId
}

/**
 * Step 2: Poll payment status using the referenceId from requestToPay.
 * Typical flow: poll every 3 seconds for up to 2 minutes.
 * Status: PENDING → SUCCESSFUL or FAILED
 */
export async function getPaymentStatus(referenceId: string): Promise<MoMoPaymentResult> {
  const response = await fetch(
    `${MOMO_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': buildAuthHeader(),
        'X-Target-Environment': MOMO_ENVIRONMENT,
        'Ocp-Apim-Subscription-Key': MOMO_COLLECTION_KEY,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`MTN MoMo status check failed: ${response.status}`)
  }

  const data = await response.json()

  // Map MTN's status string to our enum
  let status: MoMoPaymentStatus = 'PENDING'
  if (data.status === 'SUCCESSFUL') status = 'SUCCESSFUL'
  else if (data.status === 'FAILED') status = 'FAILED'

  // MTN returns amount as a string.
  const amount = data.amount != null ? Number(data.amount) : undefined

  return {
    referenceId,
    status,
    reason: data.reason,
    amount: Number.isFinite(amount) ? amount : undefined,
  }
}

/**
 * Poll payment status with exponential backoff until resolved or timeout.
 * Used by the payment confirmation API route.
 * Max wait: 3 minutes (18 × 10s intervals)
 */
export async function pollPaymentUntilResolved(
  referenceId: string,
  maxAttempts = 18,
  intervalMs = 10000,
): Promise<MoMoPaymentResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getPaymentStatus(referenceId)

    if (result.status !== 'PENDING') {
      return result
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  // Timeout — treat as failed
  return {
    referenceId,
    status: 'FAILED',
    reason: 'Payment confirmation timed out. Please contact support if your money was deducted.',
  }
}

/**
 * Format a phone number to MTN MoMo international format.
 * Handles: 07XXXXXXXX → 2507XXXXXXXX
 */
export function formatPhoneForMoMo(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('250')) return digits
  if (digits.startsWith('0')) return `250${digits.slice(1)}`
  return `250${digits}`
}
