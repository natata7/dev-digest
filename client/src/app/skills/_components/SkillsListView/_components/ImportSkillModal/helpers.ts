import type { SkillScanResult } from "@devdigest/shared";

/** Strip a FileReader data-URL prefix so the API receives raw base64. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** Mirrors the server's `isBlocked` (scan.ts) — only used here to avoid a
 *  pointless round-trip; the server enforces this regardless. */
export function isScanBlocked(scan: SkillScanResult | undefined): boolean {
  return scan?.severity === "malicious";
}
