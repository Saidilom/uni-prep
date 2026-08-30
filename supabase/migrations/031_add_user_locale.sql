-- Persist each user's preferred UI language (RU/UZ interface switcher).
alter table public.users
  add column if not exists locale text not null default 'ru' check (locale in ('ru', 'uz'));

notify pgrst, 'reload schema';
