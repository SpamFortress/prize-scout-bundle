/** Runs at most once until the current event turn finishes. A second call in the same turn does not toggle again. */
export function runOncePerGesture(gate: { held: boolean }, run: () => void): boolean {
  if (gate.held) return false;
  gate.held = true;
  try {
    run();
    return true;
  } finally {
    queueMicrotask(() => {
      gate.held = false;
    });
  }
}
