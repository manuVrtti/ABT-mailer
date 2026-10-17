/**
 * Last-touch attribution, pure.
 *
 * Every action is credited to at most ONE email: the most recent one sent to
 * the same address before the action, within the window. So when Asha got
 * Monday's announcement, Wednesday's reminder and Friday's last call and
 * registered on Saturday, Friday's email gets the one conversion — totals
 * across campaigns add up to the real number of actions.
 */

export interface Send {
  jobId: string;
  email: string;
  sentAt: Date;
  campaignId: string | null;
  directSendId: string | null;
  /** Times this email's links were clicked (to tell "clicked → acted"). */
  clickTimes: Date[];
}

export interface Action {
  email: string;
  kind: string;
  ref: string | null;
  label: string;
  at: Date;
}

export interface Credited {
  send: Send;
  action: Action;
  /** A link in the credited email was clicked before the action. */
  clicked: boolean;
}

const DAY = 86_400_000;

export function attribute(sends: Send[], actions: Action[], windowDays: number): Credited[] {
  const byEmail = new Map<string, Send[]>();
  for (const s of sends) {
    const key = s.email.toLowerCase();
    const list = byEmail.get(key);
    if (list) list.push(s);
    else byEmail.set(key, [s]);
  }
  for (const list of byEmail.values()) list.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  const windowMs = windowDays * DAY;
  const out: Credited[] = [];
  for (const action of actions) {
    const list = byEmail.get(action.email.toLowerCase());
    if (!list) continue;
    const t = action.at.getTime();
    // Latest send at or before the action.
    let credited: Send | undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      if (s.sentAt.getTime() <= t) {
        credited = s;
        break;
      }
    }
    if (!credited || t - credited.sentAt.getTime() > windowMs) continue;
    out.push({ send: credited, action, clicked: credited.clickTimes.some((c) => c.getTime() <= t) });
  }
  return out;
}
