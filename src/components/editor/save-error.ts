/**
 * The toast for a failed autosave (other than a 409 conflict), or null when
 * the streak it belongs to has already been announced.
 */
export function saveErrorToast(status: number, alreadyFailing: boolean): string | null {
  if (alreadyFailing) return null;
  return status === 401
    ? "Your changes aren't being saved: your session has expired. Sign in again in another tab, then keep editing."
    : `Your changes aren't being saved (HTTP ${status}). Annie will retry on your next edit.`;
}
