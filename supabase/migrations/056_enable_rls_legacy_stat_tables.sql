-- Security fix: badges/ratings/user_progress (001_init.sql, Firestore-era
-- leftovers) never had RLS enabled — confirmed via grep across all prior
-- migrations. They're read from the anon-key browser client
-- (src/lib/stats-utils.ts, src/lib/profile-utils.ts) filtered by
-- .eq("user_id", userId), which is a client-side convenience only, not a
-- security boundary: without RLS, any authenticated (or possibly anon, per
-- default Supabase grants) caller could hit the REST endpoint directly and
-- read/write every user's rows. All three tables are currently empty in
-- production and only ever SELECTed (grepped exhaustively — no .insert()/
-- .update() call exists anywhere in src/), and the only consumer
-- (achievements/page.tsx) always passes the caller's own user.id — so a
-- strict own-row-only policy has zero legitimate-usage impact.
--
-- user_id on these three tables is genuinely `uuid` at runtime (verified via
-- information_schema — unlike public.users.id, which is `text` despite
-- looking similar), so auth.uid() is compared directly with no ::text cast.

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY badges_own ON public.badges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ratings_own ON public.ratings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_progress_own ON public.user_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
