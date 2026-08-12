import type { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'

/**
 * Pure queue transition for pending permission requests.
 *
 * - Passing a confirm enqueues it at the back (the head is what the dialog
 *   renders), so concurrent canUseTool promises no longer clobber each other.
 * - Passing null pops the head; the next queued request becomes visible.
 */
export function transitionToolUseConfirmQueue(
  pending: ToolUseConfirm[],
  next: ToolUseConfirm | null,
): ToolUseConfirm[] {
  if (next === null) {
    return pending.length > 1 ? pending.slice(1) : []
  }
  return pending.length === 0 ? [next] : [...pending, next]
}
