/**
 * Product-facing strings for feed/list UI (not orchestration console copy).
 */

const TITLE_MAX = 52;

/**
 * Shorten auto-generated run titles for card headers (detail screen can show full text).
 */
export function shortenRunTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return t;

  let out = t;

  const c = out.indexOf(":");
  if (c >= 14 && c < 56 && out.length > TITLE_MAX) {
    out = out.slice(0, c).trim();
  }

  const c2 = out.indexOf(":", 12);
  if (c2 >= 20 && c2 < 44 && out.length > TITLE_MAX) {
    out = out.slice(0, c2).trim();
  }

  if (out.length <= TITLE_MAX) return out;

  const slice = out.slice(0, TITLE_MAX);
  const sp = slice.lastIndexOf(" ");
  const head = sp > 24 ? slice.slice(0, sp) : slice;
  return `${head.trim()}…`;
}

/** Shorter than run titles — step lines in expanded notes */
export function shortenStepTitle(text: string, max = 56): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const sp = slice.lastIndexOf(" ");
  return `${(sp > 22 ? slice.slice(0, sp) : slice).trim()}…`;
}

/**
 * Map raw agent/tool errors to a short, user-friendly line. Keep `raw` for detail / "Tap for more".
 */
export function summarizeErrorForFeed(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "";

  const lower = s.toLowerCase();

  if (
    /image.+exceed|exceeded.+limit|exceed.+size|conversation.+image|image.+too large|size limit/i.test(
      s
    )
  ) {
    return "Screenshot or image exceeded size limits";
  }

  if (/rate limit|429|too many requests/i.test(lower)) {
    return "Too many requests — try again shortly";
  }

  if (/simulator|xcrun simctl|bootsim/i.test(lower)) {
    return "Simulator capture or access failed";
  }

  if (
    /permission|not authorized|eacces|eperm|access denied|privacy|not permitted/i.test(
      lower
    )
  ) {
    return "Missing device or app access";
  }

  if (/enotdir|enoent|no such file/i.test(lower)) {
    return "A needed file or path wasn’t found";
  }

  if (/timeout|timed out|etimedout/i.test(lower)) {
    return "Request timed out";
  }

  if (/network|econnrefused|fetch failed|socket|getaddrinfo/i.test(lower)) {
    return "Network or connection issue";
  }

  if (/couldn.?t process|unable to process|invalid image|decode/i.test(lower)) {
    return "Couldn’t process that input";
  }

  if (/claude code returned an error/i.test(lower)) {
    const stripped = s
      .replace(/^[\s\S]*?error result:\s*/i, "")
      .replace(/^an?\s+/i, "")
      .trim();
    if (stripped && stripped !== s && stripped.length < 800) {
      return summarizeErrorForFeed(stripped);
    }
    return "This step hit an error in the agent";
  }

  if (s.length > 88) {
    return `${s.slice(0, 85).trim()}…`;
  }

  return s;
}
