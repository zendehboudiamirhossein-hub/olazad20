import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { compareReleaseRank, computeUpdateAvailable } from '@/lib/version-compare'

/**
 * GET /api/client/version
 * Update check endpoint for the AzadGram client.
 *
 * Optional query: ?currentVersionCode=54699
 *
 * v3.9.2 — "force update never reaches the app" fix:
 *  • The client's currentVersionCode is the Android manifest code inherited
 *    from the upstream Telegram build (≈54xxx) because the integration build
 *    never touches the manifest versionCode — it only rewrites
 *    AzadGramBuildConfig's CLIENT_VERSION. Panel releases, on the other
 *    hand, carry small admin-entered codes (form default was "1").
 *    A naive `release.versionCode > currentVersionCode` therefore always
 *    evaluated to false, so every client answered "شما آخرین نسخه را دارید"
 *    — including force updates, whose flag only rides along when an update
 *    is detected at all.
 *  • The client always sends its true AzadGram version in the User-Agent
 *    (`AzadGram/1.9.6 Android`) on every request, so the endpoint now
 *    compares versions semantically from the header first and only falls
 *    back to the versionCode query param when no recognizable User-Agent
 *    is present.
 *  • The "current" release is no longer `orderBy versionCode desc` (unreli-
 *    able with mixed code schemes) — all active releases are fetched and the
 *    highest semantic version wins, with versionCode and release date as
 *    tie-breakers. The releases table is tiny, so this stays cheap.
 */
export async function GET(request: NextRequest) {
  const releases = await db.appRelease.findMany({
    where: { isActive: true }
  })
  if (releases.length === 0) {
    return NextResponse.json({ message: 'No release published' }, { status: 404 })
  }

  const release = [...releases].sort((a, b) => compareReleaseRank(b, a))[0]

  const { searchParams } = new URL(request.url)
  const currentCodeRaw = parseInt(searchParams.get('currentVersionCode') ?? '', 10)
  const currentCode = Number.isFinite(currentCodeRaw) ? currentCodeRaw : null

  const updateAvailable = computeUpdateAvailable({
    releaseVersion: release.version,
    releaseVersionCode: release.versionCode,
    currentVersionCode: currentCode,
    userAgent: request.headers.get('user-agent')
  })

  return NextResponse.json({
    version: release.version,
    versionCode: release.versionCode,
    downloadUrl: release.downloadUrl,
    changelog: release.changelog,
    minAndroid: release.minAndroid,
    forceUpdate: release.forceUpdate,
    releasedAt: release.releasedAt,
    updateAvailable,
    updateRequired:
      updateAvailable === undefined ? undefined : release.forceUpdate && updateAvailable
  })
}
