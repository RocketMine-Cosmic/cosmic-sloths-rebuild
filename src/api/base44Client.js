/**
 * 🔴 THIS FILE IS NOW THE SEAM'S FRONT DOOR AND NOTHING ELSE.
 *
 * It kept its name and its export deliberately: 118 modules import
 * `{ base44 } from '@/api/base44Client'` and none of them has to change. What
 * they get is the adapter (src/api/adapter/), which talks to Supabase.
 *
 * D-74: there is no base44 delegation path and there will not be one — there is
 * no deployment in which this frontend calls base44.
 *
 * ⚠️ The name is now a lie about the destination. Renaming it is 118 edits for
 * no behaviour, so it stays until something else needs those files opened.
 */
export { base44, cs } from './adapter/index';
export { base44 as default } from './adapter/index';
