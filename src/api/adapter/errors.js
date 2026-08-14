/**
 * Adapter errors.
 *
 * 01_REBUILD_PLAN.md B.5's adapter contract is explicit that call sites read
 * BOTH `err.status` and `err.response.status` — Game.jsx:253 does exactly that
 * on the saveScore retry path. Every error this adapter throws therefore
 * carries both, so no call site needs editing to keep working.
 */

export class AdapterError extends Error {
  constructor(message, status = 500, extra = {}) {
    super(message);
    this.name = 'AdapterError';
    this.status = status;
    // The SDK shape the 118 importers were written against.
    this.response = { status, data: { error: message, ...extra } };
    Object.assign(this, extra);
  }
}

/**
 * A base44 backend function that has no Supabase counterpart YET.
 *
 * 🔴 It THROWS. It does not return an empty result, a null, or a shrug.
 * A silent stub reads exactly like a working call that found nothing, which is
 * the failure mode 023 spent a session on (`omenx_sku_id` null read as "no").
 * 501 is chosen so it cannot be mistaken for a 4xx the retry loops treat as
 * transient — Game.jsx retries on anything that is not 401, and a 501 that
 * retried four times would look like a network fault instead of a gap.
 */
export class NotPortedError extends AdapterError {
  constructor(name, note) {
    super(
      `[adapter] '${name}' has no Supabase path yet. ${note || ''}`.trim() +
        " — see docs/migration/30_FRONTEND_ADAPTER.md §3.",
      501,
      { adapterName: name, adapterState: 'not_ported' }
    );
    this.name = 'NotPortedError';
  }
}

/** A base44 concept that will never exist here (admin suite, base44-only tooling). */
export class RetiredError extends AdapterError {
  constructor(name, note) {
    super(
      `[adapter] '${name}' is retired and is not coming back. ${note || ''}`.trim() +
        " — see docs/migration/30_FRONTEND_ADAPTER.md §4.",
      410,
      { adapterName: name, adapterState: 'retired' }
    );
    this.name = 'RetiredError';
  }
}

/** Translate a PostgREST/supabase-js error into the shape the call sites expect. */
export function fromPostgrest(err, ctx) {
  if (!err) return null;
  // PostgREST maps a raised SQLSTATE onto an HTTP status; supabase-js surfaces
  // the code but not always the status, so derive one rather than defaulting to
  // 500 and having the caller's 401 branch never fire.
  const code = err.code || '';
  const status =
    err.status ||
    (code === '42501' ? 401 : code === '22023' ? 400 : code === '23514' ? 400 : code === '40001' ? 409 : 500);
  return new AdapterError(`[adapter:${ctx}] ${err.message || String(err)}`, status, {
    pgCode: code || null,
    pgDetail: err.details || null,
  });
}
