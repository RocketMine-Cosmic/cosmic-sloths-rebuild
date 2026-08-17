import React from 'react';
import { AlertTriangle, RotateCw, Wrench } from 'lucide-react';

/**
 * 🔴 THE ONLY ERROR BOUNDARY IN THE APP — and before 2026-08-17 there were none.
 *
 * Rob: *"all pages are white screen till i refresh the whole page"* and
 * *"im human i cant read tables like you can"*. Both are the same complaint and
 * this file is the answer to it.
 *
 * WHY A WHITE SCREEN WAS THE DEFAULT. `src/api/adapter/entities.js` is a Proxy
 * that throws `NotPortedError` on EVERY property access, by design, so nothing
 * can silently read wrong data. That instinct is right. But React unmounts the
 * whole tree when a render/effect throws and no ancestor catches it, and a grep
 * for `componentDidCatch` / `getDerivedStateFromError` / `ErrorBoundary` across
 * `src/` returned NOTHING. So one deliberate, documented, correct throw took the
 * entire SPA down until a hard reload.
 *
 * ⚠️ AND IT WAS WORSE THAN ONE PAGE, because `LazySlide` mounts the active slide
 * AND ITS NEIGHBOURS: slide 4 (Leaderboard) crashing also killed slides 3 and 5,
 * and slide 5 (Squads — 12 unported entity calls) killed 4 and 6. Two broken
 * slides poisoned most of the carousel, which is why pages that work looked
 * broken. 27 files read `base44.entities.*`; any one of them could do this.
 *
 * 🟢 SO THIS IS NOT JUST A CRASH GUARD, IT IS THE MIGRATION PROGRESS DISPLAY.
 * An unported feature now renders a labelled "not migrated yet" card naming the
 * call that is missing, in the slide where it belongs. The remaining work becomes
 * something you find by walking the menus instead of something I read out of a
 * registry at you. That is the whole point: it has to be visible to a human.
 *
 * ⚠️ IT DOES NOT SWALLOW ANYTHING. Every catch still logs the real error and
 * component stack to the console, because a boundary that hides faults would
 * trade a visible white screen for an invisible one.
 */

/** The adapter's deliberate refusals, which are DATA about the migration rather than bugs. */
const MIGRATION_ERRORS = new Set(['NotPortedError', 'RetiredError']);

function parseAdapterError(error) {
  const name = error?.name || '';
  const msg = error?.message || String(error || 'Unknown error');
  if (!MIGRATION_ERRORS.has(name)) return null;
  // NotPortedError messages carry the call name first, e.g.
  //   "[adapter] 'entities.Squad.filter' has no Supabase path yet. …"
  const call = msg.match(/'([^']+)'/)?.[1] || null;
  return { kind: name === 'RetiredError' ? 'retired' : 'not_ported', call, msg };
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Loud on purpose — see the header note.
    console.error(
      `[ErrorBoundary] ${this.props.label || 'unlabelled'} crashed:`,
      error,
      info?.componentStack
    );
    this.setState({ info });
    try {
      window.dispatchEvent(
        new CustomEvent('boundaryCaught', {
          detail: { label: this.props.label || null, name: error?.name || null, message: error?.message || null },
        })
      );
    } catch {}
  }

  retry = () => this.setState({ error: null, info: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { label } = this.props;
    const adapter = parseAdapterError(error);

    // ---- The migration case: a deliberate refusal, shown as status, not failure.
    if (adapter) {
      const retired = adapter.kind === 'retired';
      return (
        <div className="w-full h-full min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border-2 border-amber-500/60 bg-amber-950/40 p-5 text-center shadow-[0_0_20px_rgba(245,158,11,0.25)]">
            <Wrench className="w-7 h-7 text-amber-400 mx-auto mb-3" />
            <div className="text-amber-200 font-bold tracking-wide uppercase text-sm mb-1">
              {label || 'This page'} — {retired ? 'removed' : 'not migrated yet'}
            </div>
            <div className="text-amber-100/80 text-xs leading-relaxed mb-3">
              {retired
                ? 'This feature was deliberately retired in the rebuild, so nothing here is coming back.'
                : 'The rest of the game works. This panel needs its Supabase path wired up before it can show anything.'}
            </div>
            {adapter.call && (
              <div className="text-[11px] font-mono text-amber-300/90 bg-black/40 border border-amber-500/30 rounded px-2 py-1 mb-3 break-all">
                {adapter.call}
              </div>
            )}
            <button
              onClick={this.retry}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-300 hover:text-amber-100 border border-amber-500/40 rounded px-3 py-1.5"
            >
              <RotateCw className="w-3 h-3" /> Try again
            </button>
          </div>
        </div>
      );
    }

    // ---- The genuine-bug case: a real fault, shown with enough to act on.
    return (
      <div className="w-full h-full min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border-2 border-red-500/60 bg-red-950/40 p-5 shadow-[0_0_20px_rgba(239,68,68,0.25)]">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
            <div className="text-red-200 font-bold tracking-wide uppercase text-sm">
              {label ? `${label} hit an error` : 'Something went wrong here'}
            </div>
          </div>
          <div className="text-red-100/80 text-xs leading-relaxed mb-3">
            Only this panel is affected — you can still use the rest of the game. The full error and
            component stack are in the browser console.
          </div>
          <pre className="text-[11px] font-mono text-red-200/90 bg-black/40 border border-red-500/30 rounded p-2 mb-3 max-h-32 overflow-auto whitespace-pre-wrap break-all">
            {error?.name ? `${error.name}: ` : ''}
            {error?.message || String(error)}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={this.retry}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-red-300 hover:text-red-100 border border-red-500/40 rounded px-3 py-1.5"
            >
              <RotateCw className="w-3 h-3" /> Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-[11px] uppercase tracking-wider text-red-300/70 hover:text-red-100 border border-red-500/25 rounded px-3 py-1.5"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
