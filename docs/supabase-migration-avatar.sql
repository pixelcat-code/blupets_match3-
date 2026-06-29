-- Migration: add avatar_url to leaderboard_entries
-- Run in Supabase Dashboard → SQL Editor → New query

ALTER TABLE public.leaderboard_entries
  ADD COLUMN IF NOT EXISTS avatar_url text;
