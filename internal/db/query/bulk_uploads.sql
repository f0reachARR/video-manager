-- name: LookupBulkUploadFingerprint :one
-- 1 件単位で (tournament, hash, size) を引く。 N+1 を避けるため Check API は
-- これを並べて発行する代わりに ListBulkUploadFingerprintsByHashes を使う。
SELECT *
FROM bulk_upload_fingerprints
WHERE tournament_id = sqlc.arg('tournament_id')
  AND head_hash     = sqlc.arg('head_hash')
  AND size_bytes    = sqlc.arg('size_bytes');

-- name: ListBulkUploadFingerprintsByHashes :many
-- Check API 用バッチ取得。 (head_hash, size_bytes) のペアを 2 つの配列で渡し、
-- UNNEST で行に展開してジョインする。
SELECT f.*
FROM bulk_upload_fingerprints f
JOIN (
    SELECT UNNEST(sqlc.arg('head_hashes')::bytea[]) AS head_hash,
           UNNEST(sqlc.arg('size_bytes_list')::bigint[]) AS size_bytes
) AS q
  ON q.head_hash  = f.head_hash
 AND q.size_bytes = f.size_bytes
WHERE f.tournament_id = sqlc.arg('tournament_id');

-- name: UpsertBulkUploadFingerprint :one
-- 動画 / 画像 アップロード完了時に呼ぶ。 既存行があればメディア ID を
-- 上書きする (race で同じ fingerprint が同時に飛んできても 1 行に収束)。
INSERT INTO bulk_upload_fingerprints (
    tournament_id, head_hash, size_bytes, filename, media_kind,
    video_id, robot_image_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (tournament_id, head_hash, size_bytes) DO UPDATE
SET filename        = EXCLUDED.filename,
    media_kind      = EXCLUDED.media_kind,
    video_id        = COALESCE(EXCLUDED.video_id,        bulk_upload_fingerprints.video_id),
    robot_image_id  = COALESCE(EXCLUDED.robot_image_id,  bulk_upload_fingerprints.robot_image_id)
RETURNING *;

-- name: ClearBulkUploadFingerprintsForTournament :execrows
DELETE FROM bulk_upload_fingerprints WHERE tournament_id = $1;
