/**
 * Shared constants for the ContactList feature. Kept out of `actions.ts`
 * because "use server" files may only export async functions — exporting a
 * constant array from one produces:
 *   Error: A "use server" file can only export async functions, found object.
 */
export const CONTACT_LIST_COLORS = ["emerald", "teal", "sky", "amber", "rose", "violet", "slate"] as const;

export type ContactListColor = (typeof CONTACT_LIST_COLORS)[number];
