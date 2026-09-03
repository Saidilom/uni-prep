// Client-side mirror of the entry-window logic baked into the
// can_access_mock() Postgres function (066_admin_free_mock.sql)
// — used only to render the right message/button on the catalog and mock
// pages. The database remains the source of truth; a stale/tampered client
// check here can never grant access that can_access_mock would deny.
//
// Окно больше не зависит от цены: бесплатный админский мок тоже можно
// проводить строго в назначенное время, поэтому единственный признак
// «расписание задано» — наличие обеих границ.
export type MockEntryState = "unscheduled" | "not_open_yet" | "open" | "closed";

export function getMockEntryState(params: {
  startsAt: string | null | undefined;
  endsAt: string | null | undefined;
  hasExistingResult: boolean;
  now?: Date;
}): MockEntryState {
  const { startsAt, endsAt, hasExistingResult, now = new Date() } = params;
  if (!startsAt || !endsAt) return "unscheduled";
  if (hasExistingResult) return "open";

  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (now.getTime() < startMs) return "not_open_yet";
  if (now.getTime() > endMs) return "closed";
  return "open";
}

