/** Fired after applet create/update/delete so My Apps can reload. */
export const MY_BUYS_APPLETS_CHANGED = 'mu:mybuys:applets-changed';

export type MyBuysAppletsChangedPayload = {
  action: 'created' | 'updated' | 'deleted';
  appletId: string;
  themeId?: string;
  themeCustomHex?: string;
};
