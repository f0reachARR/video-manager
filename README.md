# video-manager

ロボコン テストラン動画整理アプリ。詳細は [spec.md](spec.md) を参照。

このリポジトリは Phase 1 ([spec-devflow.md](spec-devflow.md) §1〜§11) の機能を一通り
実装した段階。WebSocket リアルタイム / Annotation / ScoutingNote 等の Phase 2 は未着手。

開発のセットアップやリポジトリ地図は [docs/development.md](docs/development.md) を参照。

ホストに `ffprobe` (FFmpeg) が必要 (`brew install ffmpeg` 等)。

## 必要ツール

- [mise](https://mise.jdx.dev/) — Go と pnpm を [mise.toml](mise.toml) で固定
- Docker / Docker Compose
- 上記以外のツール（`golang-migrate`、`sqlc`、`redocly`）は `scripts/` から `go run` / `pnpm dlx` 経由で呼ぶため、ホストへの追加インストールは不要

## セットアップ

```sh
mise install
cp .env.example .env
pnpm install
./scripts/gen-api-client.sh   # OpenAPI から TS 型を生成
docker compose up -d
./scripts/migrate.sh up        # 初期スキーマを適用
./scripts/seed-dev.sh          # User / Device / Robot / Scenario / Tag を投入（冪等）
./scripts/dev.sh               # Vite (5173) + Go API (8080) を起動
```

ブラウザで <http://localhost:5173> を開くと、`/health` と `/ready` の状態が表示される。

## ポート

| サービス | ポート | 備考 |
| --- | --- | --- |
| SPA (Vite) | 5173 | `/api/*` を 8080 にプロキシ |
| Go API | 8080 | `/health`, `/ready` |
| PostgreSQL | 5432 | `video / video / video_manager` |
| MinIO API | 9000 | S3 互換。Go API がここで署名 URL を発行 |
| MinIO Console | 9001 | `minio / minio123` |
| tusd | 1080 | S3 backend で MinIO に保存。post-finish hook で Go API に通知 |

## スクリプト

| スクリプト | 用途 |
| --- | --- |
| `scripts/dev.sh` | infra コンテナ起動 → web dev + Go API を foreground 起動 |
| `scripts/migrate.sh` | `go run` 経由で `golang-migrate` を呼ぶ薄いラッパー |
| `scripts/gen-sqlc.sh` | `internal/db/query/*.sql` から `internal/db/sqlc/` に sqlc コード生成 |
| `scripts/seed-dev.sh` | `cmd/seed-dev` を実行してマスタの最小データを投入（冪等） |
| `scripts/lint-openapi.sh` | `docs/api/openapi.yaml` を Redocly で検証 |
| `scripts/gen-api-client.sh` | OpenAPI から `web/src/lib/api/generated.ts` を生成 |
| `scripts/test.sh` | `video_manager_test` DB を用意して `go test ./...` を実行 |

## ディレクトリ

[spec-dir-structure.md](spec-dir-structure.md) の「Phase 1 で先に作る最小構成」に合わせている。
本フェーズでファイルが入っているのは以下:

- [cmd/app](cmd/app/) — Go API のエントリポイント
- [internal/config](internal/config/), [internal/db](internal/db/), [internal/http](internal/http/)
- [migrations](migrations/) — golang-migrate 用 SQL
- [docs/api](docs/api/) — OpenAPI 契約
- [web](web/) — Vite + React + Mantine + TanStack Router の SPA
- [deploy/compose/postgres-init](deploy/compose/postgres-init/) — `pg_trgm` / `pgcrypto` 拡張

## テスト

```sh
docker compose up -d postgres        # 既に起動済みなら不要
./scripts/test.sh                    # 既定で video_manager_test DB を作って実行
./scripts/test.sh -run TestRuns ./internal/http/handler/...
```

- 純関数ユニットテストは `go test ./internal/...` だけでも動く
- ハンドラ統合テストは実 Postgres を使う。`TEST_DATABASE_URL` 環境変数があれば
  それを優先（既定値: `postgres://video:video@localhost:5432/video_manager_test?sslmode=disable`）
- 各テストの開始時に全テーブルが TRUNCATE されるため隔離は不要

## API 契約

`docs/api/openapi.yaml` を真実の源として扱う ([spec-devflow.md](spec-devflow.md) §3)。
変更時は次の順で:

1. `docs/api/openapi.yaml` を更新
2. `./scripts/lint-openapi.sh` で検証
3. `./scripts/gen-api-client.sh` で TS 型を再生成（差分はコミット）
4. Go 側 handler を更新

## 次のステップ

Phase 2 ([spec-devflow.md](spec-devflow.md) §「Phase 2 の進め方」) へ。

- Marker / Annotation の WebSocket リアルタイム反映
- Hocuspocus 連携 (ScoutingNote)
- Tournament / Match / 本番前モード
