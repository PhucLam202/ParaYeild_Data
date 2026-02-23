/**
 * Returns the current UTC date as a string in "YYYY-MM-DD" format.
 * Used as the daily bucket key for snapshot upserts.
 *
 * Example: "2026-02-22"
 */
export function getUtcDateKey(date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
