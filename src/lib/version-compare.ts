/**
 * Version parsing & comparison helpers for the app update flow.
 *
 * WHY THIS EXISTS (v3.7.1 bugfix — "force update never reaches the app"):
 * The Android client reports its *manifest* versionCode in the
 * `currentVersionCode` query param. That code is inherited from the upstream
 * Telegram build (e.g. 54699) because the integration script never touches
 * the manifest versionCode — it only rewrites AzadGramBuildConfig's
 * CLIENT_VERSION. Panel releases, on the other hand, historically carry small
 * admin-entered codes (form default was "1", e.g. 197 for v1.9.7).
 *
 * A naive `release.versionCode > currentVersionCode` therefore always
 * evaluates to false, and every client answers "شما آخرین نسخه را دارید" —
 * including force updates, whose flag only rides along when an update is
 * detected at all.
 *
 * The client, however, always sends its real AzadGram version inside the
 * User-Agent header on every request: `AzadGram/1.9.6 Android`. These
 * helpers let the version endpoint compare versions semantically as the
 * primary signal, falling back to versionCode only when the header is
 * absent.
 */

export interface SemVer {
  major: number
  minor: number
  patch: number
}

/**
 * Parses the leading numeric triple of a version string.
 * Accepts "1.9.6", "v1.9.6", "1.9.6-beta", "1.9" (patch defaults to 0).
 * Returns null when no `major.minor` prefix can be found.
 */
export function parseSemVer(input: string | null | undefined): SemVer | null {
  if (!input) return null
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(input.trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] !== undefined ? Number(m[3]) : 0
  }
}

/** Compares two parsed versions: negative if a < b, 0 if equal, positive if a > b. */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

/**
 * Extracts the AzadGram client version from a User-Agent such as
 * `AzadGram/1.9.6 Android` → "1.9.6". Case-insensitive, tolerates 1–3
 * numeric components. Returns null when the header is missing or has no
 * AzadGram token (e.g. plain curl requests during manual testing).
 */
export function parseClientVersionFromUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null
  const m = /AzadGram\/(\d+(?:\.\d+){0,2})/i.exec(ua)
  return m ? m[1] : null
}

/**
 * Ranks two version strings for "which is the newest release" purposes.
 * Used when the endpoint must choose the current release out of all active
 * rows: semantic version wins, versionCode breaks ties, then release date.
 */
export function compareReleaseRank(
  a: { version: string; versionCode: number; releasedAt: Date },
  b: { version: string; versionCode: number; releasedAt: Date }
): number {
  const va = parseSemVer(a.version)
  const vb = parseSemVer(b.version)
  if (va && vb) {
    const c = compareSemVer(va, vb)
    if (c !== 0) return c
  }
  if (a.versionCode !== b.versionCode) return a.versionCode - b.versionCode
  return a.releasedAt.getTime() - b.releasedAt.getTime()
}

/**
 * Computes the update decision for a client hitting /api/client/version.
 *
 * Priority of signals:
 *  1. User-Agent AzadGram version vs the release's version string — the
 *     authoritative "is there a newer AzadGram version" answer, immune to
 *     versionCode scheme mismatches.
 *  2. currentVersionCode (query param) vs release.versionCode — fallback for
 *     callers that send no recognizable User-Agent.
 *
 * Returns `undefined` only when neither signal is available (same contract
 * as the original v3.7.0 endpoint).
 */
export function computeUpdateAvailable(params: {
  releaseVersion: string
  releaseVersionCode: number
  currentVersionCode: number | null
  userAgent: string | null
}): boolean | undefined {
  const { releaseVersion, releaseVersionCode, currentVersionCode, userAgent } = params

  const uaRaw = parseClientVersionFromUserAgent(userAgent)
  const uaSem = uaRaw ? parseSemVer(uaRaw) : null
  const releaseSem = parseSemVer(releaseVersion)

  if (uaSem && releaseSem) {
    return compareSemVer(releaseSem, uaSem) > 0
  }

  if (currentVersionCode !== null && Number.isFinite(currentVersionCode)) {
    return releaseVersionCode > currentVersionCode
  }

  return undefined
}
