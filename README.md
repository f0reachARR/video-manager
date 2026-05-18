# video-manager

ロボコン テストラン動画整理アプリ。詳細は [spec.md](spec.md) を参照。

このリポジトリは現在 [spec-devflow.md](spec-devflow.md) §1「リポジトリ土台」までを実装した段階。
動画アップロード・Run・Marker などの本機能は §2 以降で順次追加する。

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
./scripts/migrate.sh up        # users テーブルを作成
./scripts/dev.sh               # Vite (5173) + Go API (8080) を起動
```

ブラウザで <http://localhost:5173> を開くと、`/health` と `/ready` の状態が表示される。

## ポート

| サービス | ポート | 備考 |
| --- | --- | --- |
| SPA (Vite) | 5173 | `/api/*` を 8080 にプロキシ |
| Go API | 8080 | `/health`, `/ready` |
| PostgreSQL | 5432 | `video / video / video_manager` |
| MinIO API | 9000 | S3 互換 |
| MinIO Console | 9001 | `minio / minio123` |
| tusd | 1080 | Phase 1 §1 では疎通確認のみ |

## スクリプト

| スクリプト | 用途 |
| --- | --- |
| `scripts/dev.sh` | infra コンテナ起動 → web dev + Go API を foreground 起動 |
| `scripts/migrate.sh` | `go run` 経由で `golang-migrate` を呼ぶ薄いラッパー |
| `scripts/gen-sqlc.sh` | `internal/db/query/*.sql` から sqlc コード生成（§2 で query 追加後） |
| `scripts/lint-openapi.sh` | `docs/api/openapi.yaml` を Redocly で検証 |
| `scripts/gen-api-client.sh` | OpenAPI から `web/src/lib/api/generated.ts` を生成 |

## ディレクトリ

[spec-dir-structure.md](spec-dir-structure.md) の「Phase 1 で先に作る最小構成」に合わせている。
本フェーズでファイルが入っているのは以下:

- [cmd/app](cmd/app/) — Go API のエントリポイント
- [internal/config](internal/config/), [internal/db](internal/db/), [internal/http](internal/http/)
- [migrations](migrations/) — golang-migrate 用 SQL
- [docs/api](docs/api/) — OpenAPI 契約
- [web](web/) — Vite + React + Mantine + TanStack Router の SPA
- [deploy/compose/postgres-init](deploy/compose/postgres-init/) — `pg_trgm` / `pgcrypto` 拡張

## API 契約

`docs/api/openapi.yaml` を真実の源として扱う ([spec-devflow.md](spec-devflow.md) §3)。
変更時は次の順で:

1. `docs/api/openapi.yaml` を更新
2. `./scripts/lint-openapi.sh` で検証
3. `./scripts/gen-api-client.sh` で TS 型を再生成（差分はコミット）
4. Go 側 handler を更新

## 次のステップ

[spec-devflow.md](spec-devflow.md) §2「初期 DB スキーマ」へ進む。

- 主要テーブル（sessions / videos / runs / run_videos / markers ほか）を migration として追加
- `internal/db/query/*.sql` を書いて sqlc 生成
- `internal/domain` / `internal/service` を立ち上げる
