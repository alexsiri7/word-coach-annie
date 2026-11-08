/**
 * The toast for a failed autosave (other than a 409 conflict), or null when
 * the streak it belongs to has already been announced.
 */
export function saveErrorToast(status: number, alreadyFailing: boolean): string | null {
  if (alreadyFailing) return null;
  if (status === 401) {
    return "Your changes aren't being saved: your session has expired. Sign in again in another tab, then keep editing.";
  }
  if (status === 0) {
    return "Your changes aren't being saved: check your connection. Annie will retry on your next edit.";
  }
  return `Your changes aren't being saved (HTTP ${status}). Annie will retry on your next edit.`;
}
