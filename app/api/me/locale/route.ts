/**
 * app/api/me/locale/route.ts
 *
 * PUT /api/me/locale — remember which language the signed-in user reads.
 *
 * The cookie already covers the browser. This covers everything sent when
 * there is no browser to read a cookie from: SMS, and the cron jobs that send
 * it. Without this a Kinyarwanda-reading owner gets English SMS forever.
 *
 * Signed out this is a no-op rather than an error — the switcher fires it
 * without knowing whether anyone is logged in, and a guest changing language
 * has not done anything wrong.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { routing } from '@/i18n/routing'
import { z } from 'zod'

const Schema = z.object({
  locale: z.enum(routing.locales as unknown as [string, ...string[]]),
})

export async function PUT(req: NextRequest) {
  try {
    const parsed = Schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Unknown language.' }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      // Guest — the cookie is the whole story for them.
      return NextResponse.json({ success: true, stored: false })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { locale: parsed.data.locale },
    })

    return NextResponse.json({ success: true, stored: true })
  } catch (error) {
    console.error('[PUT /api/me/locale]', error)
    return NextResponse.json(
      { error: 'We couldn’t save your language preference.' },
      { status: 500 },
    )
  }
}
