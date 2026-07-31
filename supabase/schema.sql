-- Supabase schema for uni-prep

-- Users table used by app profile logic
create table if not exists public.users (
  id uuid primary key,
  shortId text not null,
  email text not null,
  phone text,
  name text not null,
  surname text,
  role text not null,
  subjects text[] not null default '{}',
  isRegistanStudent boolean not null default false,
  registeredVia text not null,
  avatar text,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Classes for teacher-created groups
create table if not exists public.classes (
  id uuid primary key,
  teacherId uuid not null,
  name text not null,
  subjectId text not null,
  students uuid[] not null default '{}',
  createdAt timestamptz not null default now()
);

-- Badges for user achievements
create table if not exists public.badges (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  description text,
  textbookId text,
  unlockedAt timestamptz not null default now()
);

-- Ratings used by stats logic
create table if not exists public.ratings (
  id uuid primary key,
  user_id uuid not null,
  subjectId text not null,
  stars int not null default 0,
  lastUpdated timestamptz not null default now()
);

-- User progress table referenced by stats logic
create table if not exists public.user_progress (
  id uuid primary key,
  user_id uuid not null,
  topicId text not null,
  solvedQuestions int not null default 0,
  correctFirstCount int not null default 0,
  correctRetryCount int not null default 0,
  errors int not null default 0,
  markedQuestions int not null default 0,
  medal text not null default 'none',
  accuracy int not null default 0,
  completedAt timestamptz
);
