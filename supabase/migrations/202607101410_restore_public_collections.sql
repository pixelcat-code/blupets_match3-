-- Restore the capsule collection feature after the temporary replay-only
-- restriction hid every legacy collection from both public profiles and the
-- Blupets leaderboard. These snapshots already live in server-owned rows.

with best_collection as (
  select distinct on (user_id)
    user_id,
    collection_tiles,
    blupets_count
  from public.leaderboard_entries
  where collection_tiles is not null
    and jsonb_typeof(collection_tiles) = 'object'
  order by user_id, blupets_count desc, score desc, created_at desc
)
update public.user_progress progress
   set progress = jsonb_set(
     coalesce(progress.progress, '{}'::jsonb),
     '{publicCollectionTiles}',
     best_collection.collection_tiles,
     true
   ),
       updated_at = now()
  from best_collection
 where progress.user_id = best_collection.user_id;

update public.leaderboard_entries
   set collection_trusted = true
 where collection_tiles is not null
   and jsonb_typeof(collection_tiles) = 'object';
