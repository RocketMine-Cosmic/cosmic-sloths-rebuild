/**
 * entities.* — 90 call sites across 24 base44 entity names.
 *
 * NONE of them is ported, and that is not an oversight. base44's entities were
 * a REST-over-collections SDK with .filter()/.create()/.update()/.list() and no
 * server-side authority; the rebuild has RLS-forced tables with READ POLICIES
 * ONLY and exactly one write policy in the entire database (D-46). There is no
 * entities.X.update() that could work, and building one would be building the
 * thing D-46 exists to prevent.
 *
 * Reads that a page genuinely needs become a named RPC or a view with its own
 * policy — cs_weekly_board and cs_weekly_kills are the two that exist.
 *
 * So every property access throws, by name, with that reason. A Proxy is used
 * rather than 24 hand-written stubs so a name nobody has thought of throws too.
 */
import { NotPortedError } from './errors';

const REASON =
  'base44 entities were direct table access from the browser. This database is ' +
  'RLS-forced with read policies only and one write policy (D-46), so there is ' +
  'no equivalent — a read becomes a named RPC or a policied view, a write becomes ' +
  'a SECURITY DEFINER RPC.';

function entityStub(name) {
  return new Proxy(
    {},
    {
      get(_t, method) {
        if (method === 'then') return undefined; // never look thenable to await
        return () => {
          throw new NotPortedError(`entities.${name}.${String(method)}`, REASON);
        };
      },
    }
  );
}

export const entities = new Proxy(
  {},
  {
    get(_t, name) {
      if (name === 'then') return undefined;
      return entityStub(String(name));
    },
  }
);

export const integrations = new Proxy(
  {},
  {
    get(_t, name) {
      if (name === 'then') return undefined;
      return new Proxy(
        {},
        {
          get(_t2, method) {
            if (method === 'then') return undefined;
            return () => {
              throw new NotPortedError(
                `integrations.${String(name)}.${String(method)}`,
                'base44 platform integrations (UploadFile and friends) have no ' +
                  'counterpart. Supabase Storage is the destination when a call site ' +
                  'earns one — EmojiPicker.jsx:18 is the only user.'
              );
            };
          },
        }
      );
    },
  }
);
