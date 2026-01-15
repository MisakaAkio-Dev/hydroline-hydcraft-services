ALTER TABLE "luckperms_player_cache"
  DROP CONSTRAINT IF EXISTS "uq_luckperms_cache_username_lower";

ALTER TABLE "luckperms_player_cache"
  DROP COLUMN IF EXISTS "username";
