-- name: InsertRobotImage :one
INSERT INTO robot_images (
    id, robot_id, storage_key, content_type,
    display_key, display_content_type,
    thumbnail_key, size_bytes, width, height,
    captured_at, exif_orientation,
    caption, uploader_id
)
VALUES (
    $1, $2, $3, $4,
    $5, $6,
    $7, $8, $9, $10,
    $11, $12,
    $13, $14
)
RETURNING *;

-- name: GetRobotImage :one
SELECT * FROM robot_images WHERE id = $1;

-- name: ListRobotImagesByRobot :many
-- 任意で captured_at 範囲を絞れる。range が NULL の側は無制限。
-- sort 方向は caller が `order` で 'asc' / 'desc' を渡す (空なら asc)。
SELECT *
FROM robot_images
WHERE robot_id = sqlc.arg('robot_id')
  AND (sqlc.narg('from_at')::timestamptz IS NULL OR sort_at >= sqlc.narg('from_at')::timestamptz)
  AND (sqlc.narg('to_at')::timestamptz   IS NULL OR sort_at <= sqlc.narg('to_at')::timestamptz)
ORDER BY
  CASE WHEN sqlc.arg('order')::text = 'desc' THEN sort_at END DESC,
  CASE WHEN sqlc.arg('order')::text <> 'desc' THEN sort_at END ASC,
  id ASC;

-- name: UpdateRobotImage :one
UPDATE robot_images
SET
    caption     = COALESCE(sqlc.narg('caption'),     caption),
    captured_at = CASE WHEN sqlc.arg('captured_at_set')::bool
                       THEN sqlc.narg('captured_at')
                       ELSE captured_at END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteRobotImage :execrows
DELETE FROM robot_images WHERE id = $1;

-- name: SetRobotPrimaryImage :exec
UPDATE robots SET primary_image_id = sqlc.narg('image_id') WHERE id = sqlc.arg('robot_id');

-- name: ClearRobotPrimaryImageIfMatches :exec
-- 画像削除時に primary が同じ id を指していたら NULL に戻す。FK の
-- ON DELETE SET NULL でも同じ結果になるが、明示的に呼べると分かりやすい。
UPDATE robots SET primary_image_id = NULL
WHERE id = sqlc.arg('robot_id') AND primary_image_id = sqlc.arg('image_id');
