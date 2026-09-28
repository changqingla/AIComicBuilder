WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY shot_id, type, sequence_in_type ORDER BY asset_version, created_at, id
  ) AS version
  FROM shot_assets
)
UPDATE shot_assets SET asset_version = (SELECT version FROM numbered WHERE numbered.id = shot_assets.id);
--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY shot_id, type, sequence_in_type ORDER BY is_active DESC, asset_version DESC
  ) AS position
  FROM shot_assets
)
UPDATE shot_assets SET is_active = 0 WHERE id IN (SELECT id FROM ranked WHERE position > 1);
--> statement-breakpoint
CREATE UNIQUE INDEX shot_assets_slot_version ON shot_assets(shot_id, type, sequence_in_type, asset_version);
--> statement-breakpoint
CREATE UNIQUE INDEX shot_assets_active_slot ON shot_assets(shot_id, type, sequence_in_type) WHERE is_active = 1;
