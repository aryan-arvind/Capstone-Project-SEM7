// The Arbiter pod at the centre of the office. The old "Brain" notes graph is gone: this pod is
// where proposals meet the constraint layer. It keeps the small interface main.js and tasks.js
// already call, so the scene needs no special cases; the audit-log view (G) opens from here.
export function initArbiter() {
  const state = { notes: 0 };
  let auditOpen = null;
  const noop = () => {};
  return {
    read: noop, readNote: noop, write: noop, setGraph: noop, setTheme: noop, setOwner: noop, setQuiet: noop, tick: noop,
    onOpen(fn) { auditOpen = fn; },
    open() { if (auditOpen) auditOpen(); }, close: noop, toggle() { if (auditOpen) auditOpen(); },
    isOpen: () => false, state, nodes: [], links: [],
  };
}
