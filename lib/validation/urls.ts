// =============================================================================
// ZuriDrive — URL validation for user-supplied links
//
// WHY THIS EXISTS
// z.string().url() is not a security check. It accepts every one of these:
//
//   javascript:alert(document.cookie)
//   data:text/html,<script>...</script>
//   file:///etc/passwd
//
// Those URLs are stored on disputes, support tickets, payout proofs and
// subscription payment proofs — and every one of them is later rendered as an
// <a href> in the admin panel. A `javascript:` proof link is stored XSS that
// executes in an administrator's session the moment they click "View proof",
// which is about the worst place on this platform to be running someone
// else's code.
//
// Every one of these URLs is produced by our own /api/upload, which returns a
// Cloudinary secure_url. So the check can be strict: https, and a host we
// actually upload to. Anything else is not a file we issued.
// =============================================================================

import { z } from "zod";

/** Hosts we serve uploaded files from. */
const ALLOWED_HOSTS = new Set(["res.cloudinary.com"]);

/**
 * An extra host for self-hosted or proxied setups, e.g. a CDN in front of
 * Cloudinary. Must still be https — the scheme check is not negotiable.
 */
const extraHost = process.env.NEXT_PUBLIC_UPLOAD_HOST?.trim();
if (extraHost) ALLOWED_HOSTS.add(extraHost);

export function isSafeUploadUrl(value: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  // Scheme first. This is the check that actually stops XSS.
  if (parsed.protocol !== "https:") return false;

  // Credentials in a URL are never legitimate here and confuse host parsing
  // in some clients (https://res.cloudinary.com@evil.test/...).
  if (parsed.username || parsed.password) return false;

  return ALLOWED_HOSTS.has(parsed.hostname);
}

const message =
  "That file link isn’t one we issued. Upload the file through ZuriDrive rather than pasting a link.";

/** A single uploaded-file URL. Use this instead of z.string().url(). */
export const uploadedFileUrl = z.string().refine(isSafeUploadUrl, { message });

/** A list of uploaded-file URLs, with a sane cap. */
export const uploadedFileUrls = (max = 5) =>
  z.array(uploadedFileUrl).max(max);
