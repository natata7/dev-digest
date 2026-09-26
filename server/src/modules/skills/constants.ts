/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Reject zip / `.skill` archives larger than this (compressed bytes). */
export const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;

/** Reject a `SKILL.md` (or uploaded markdown) larger than this. */
export const MAX_SKILL_MD_BYTES = 1024 * 1024;

/** Filename suffixes accepted by skill import. `.skill` is a zip. */
export const IMPORT_EXTENSIONS = ['.md', '.zip', '.skill'] as const;

/** Import-from-URL: safe-fetch tuning. */
export const URL_FETCH_TIMEOUT_MS = 10_000;
export const MAX_FETCH_BYTES = MAX_ARCHIVE_BYTES;
export const ALLOWED_IMPORT_PROTOCOLS = ['https:'] as const;
export const MAX_IMPORT_REDIRECTS = 3;

/** TTL for the cached Level-2 (LLM) scan verdict, keyed by `hashKey(body)`. */
export const SCAN_VERDICT_TTL_MS = 10 * 60 * 1000;
