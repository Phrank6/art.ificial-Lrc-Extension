/**
 * One-shot landing action store.
 *
 * Lives at module scope — outside React — so it is never affected by
 * re-renders, StrictMode double-invokes, or component remounts.
 *
 * Set once when the user submits from the landing page.
 * Consumed (and immediately cleared) the first time RightPanel mounts.
 * Any subsequent mount (returning from /editor or /tutorial) gets null.
 */

let _action = null   // { text: string|null, file: File|null, autoSend: bool } | null

export function setLandingAction(action) {
  _action = action
}

/** Returns the stored action and immediately clears it. */
export function consumeLandingAction() {
  const a = _action
  _action = null
  return a
}
