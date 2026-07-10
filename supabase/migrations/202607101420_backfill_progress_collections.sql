-- Some older accounts kept capsule forms only in user_progress.progress and
-- never wrote a collection_tiles leaderboard snapshot. Restore those accounts
-- into the public/ranked collection path as well.

update public.user_progress up
   set progress = jsonb_set(
     coalesce(up.progress, '{}'::jsonb),
     '{publicCollectionTiles}',
     coalesce(
       case when jsonb_typeof(up.progress -> 'publicCollectionTiles') = 'object'
         then up.progress -> 'publicCollectionTiles' else '{}'::jsonb end,
       '{}'::jsonb
     ) || coalesce(
       case when jsonb_typeof(up.progress -> 'verifiedCollectionTiles') = 'object'
         then up.progress -> 'verifiedCollectionTiles' else '{}'::jsonb end,
       '{}'::jsonb
     ) || coalesce(
       case when jsonb_typeof(up.progress -> 'collectionTiles') = 'object'
         then up.progress -> 'collectionTiles' else '{}'::jsonb end,
       '{}'::jsonb
     ),
     true
   ),
       updated_at = now()
 where jsonb_typeof(up.progress -> 'collectionTiles') = 'object'
    or jsonb_typeof(up.progress -> 'verifiedCollectionTiles') = 'object'
    or jsonb_typeof(up.progress -> 'publicCollectionTiles') = 'object';

with snapshots as (
  select
    user_id,
    progress -> 'publicCollectionTiles' as collection_tiles
  from public.user_progress
  where jsonb_typeof(progress -> 'publicCollectionTiles') = 'object'
)
update public.leaderboard_entries le
   set collection_tiles = snapshots.collection_tiles,
       blupets_count = (select count(*) from jsonb_object_keys(snapshots.collection_tiles)),
       collection_trusted = true
  from snapshots
 where le.user_id = snapshots.user_id;
