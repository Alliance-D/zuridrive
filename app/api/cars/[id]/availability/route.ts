/**
 * app/api/cars/[carId]/availability/route.ts
 *
 * GET /api/cars/[carId]/availability
 * Returns all blocked date ranges for a car — used by the booking calendar.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBlockedDates } from '@/lib/booking/availability'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const blocked = await getBlockedDates(params.id)
    return NextResponse.json({ blocked })
  } catch {
    return NextResponse.json({ error: 'Could not load availability.' }, { status: 500 })
  }
}
