CREATE TABLE IF NOT EXISTS shot_assets (
  id                 TEXT PRIMARY KEY NOT NULL,
  shot_id            TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  type               TEXT NOT NULL,
  sequence_in_type   INTEGER NOT NULL DEFAULT 0,
  asset_version      INTEGER NOT NULL DEFAULT 1,
  is_active          INTEGER NOT NULL DEFAULT 1,
  prompt             TEXT NOT NULL DEFAULT '',
  file_url           TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  characters         TEXT,
  model_provider     TEXT,
  model_id           TEXT,
  meta               TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shot_assets_shot_type ON shot_assets(shot_id, type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_shot_assets_active ON shot_assets(shot_id, type, sequence_in_type, is_active);
--> statement-breakpoint
INSERT INTO shot_assets (id, shot_id, type, prompt, file_url, status, created_at, updated_at)
SELECT lower(hex(randomblob(16))), shot_id, type, coalesce(prompt, ''), file_url,
       CASE WHEN file_url IS NULL THEN 'pending' ELSE 'completed' END, unixepoch(), unixepoch()
FROM (
  SELECT id AS shot_id, 'first_frame' AS type, start_frame_desc AS prompt, first_frame AS file_url FROM shots
  UNION ALL
  SELECT id, 'last_frame', end_frame_desc, coalesce(last_frame, last_frame_url) FROM shots
  UNION ALL
  SELECT id, 'keyframe_video', video_prompt, video_url FROM shots
  UNION ALL
  SELECT id, 'reference_video', video_prompt, reference_video_url FROM shots
  UNION ALL
  SELECT id, 'reference', prompt, scene_ref_frame FROM shots
)
WHERE coalesce(file_url, '') <> '' OR coalesce(prompt, '') <> '';
--> statement-breakpoint
INSERT INTO shot_assets (
  id, shot_id, type, sequence_in_type, asset_version, is_active,
  prompt, file_url, status, characters, model_provider, model_id, created_at, updated_at
)
WITH references_to_import AS (
  SELECT shots.id AS shot_id, CAST(item.key AS INTEGER) + 1 AS position,
         json_extract(item.value, '$.prompt') AS prompt,
         json_extract(item.value, '$.imagePath') AS current_file,
         json_extract(item.value, '$.characters') AS characters,
         json_extract(item.value, '$.model.providerId') AS model_provider,
         json_extract(item.value, '$.model.modelId') AS model_id,
         coalesce(json_extract(item.value, '$.history'), '[]') AS history
  FROM shots, json_each(coalesce(shots.reference_images, '[]')) AS item
  WHERE item.type = 'object' AND json_extract(item.value, '$.type') = 'reference'
), files AS (
  SELECT refs.*, history.key AS ordinal, history.value AS file_url
  FROM references_to_import AS refs, json_each(json_insert(refs.history, '$[#]', refs.current_file)) AS history
), unique_files AS (
  SELECT *, max(ordinal) AS last_ordinal FROM files GROUP BY shot_id, position, file_url
)
SELECT lower(hex(randomblob(16))), shot_id, 'reference', position,
       row_number() OVER (PARTITION BY shot_id, position ORDER BY last_ordinal),
       CASE WHEN file_url IS current_file THEN 1 ELSE 0 END,
       coalesce(prompt, ''), file_url,
       CASE WHEN file_url IS NULL THEN 'pending' ELSE 'completed' END,
       characters, model_provider, model_id, unixepoch(), unixepoch()
FROM unique_files;
