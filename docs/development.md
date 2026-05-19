# 開発ガイド

Phase 1 の最後 ([spec-devflow.md](../spec-devflow.md) §11) で書き起こした、現状リポジトリで開発を始める人向けのドキュメント。

## 1. 前提ツール

| ツール | 用途 | 入れ方 |
| --- | --- | --- |
| [mise](https://mise.jdx.dev/) | Go と pnpm のバージョン固定 | `brew install mise` 等 |
| Docker / Docker Compose | postgres / minio / tusd を立てる | Docker Desktop など |
| FFmpeg (`ffprobe`, `ffmpeg`) | Video のメタデータ抽出とサムネイル生成 | `brew install ffmpeg` |

`golang-migrate` / `sqlc` / `redocly` などは [scripts/](../scripts/) から `go run` / `pnpm dlx` 経由で起動するため、ホストへの追加インストールは不要。

## 2. 初回セットアップ

```sh
mise install
cp .env.example .env

pnpm install
./scripts/gen-api-client.sh         # OpenAPI から TS 型を生成

docker compose up -d                 # postgres / minio / tusd を起動
./scripts/migrate.sh up              # 初期スキーマを適用
./scripts/seed-dev.sh                # マスタの最小データ（冪等）
./scripts/dev.sh                     # Vite (5173) + Go API (8080) + encode worker (8081) を foreground 起動
```

`scripts/dev.sh` は 3 つのプロセスを並行起動する:

- **Vite (5173)**: React SPA
- **API (8080)**: `cmd/app` をデフォルトキュー (probe / plan / finalize) で起動
- **Worker (8081)**: 同じ `cmd/app` を `WORKER_QUEUES=encode` で起動。HLS の重いエンコードジョブ専用

ポートや並列度は `.env` の `DEV_WORKER_*` で上書きできる。別マシン / 追加ワーカーを試したいときは [`scripts/dev-worker.sh`](../scripts/dev-worker.sh) を別ターミナルで起動する（`DEV_WORKER_HTTP_ADDR` を 8081 と衝突しない値にする）。

ブラウザで <http://localhost:5173> を開き、ヘッダ右の "現在のユーザー" でデフォルトユーザーを選ぶと、以降の作成 API に `X-User-Id` ヘッダが付くようになる。

## 3. リポジトリ地図

| パス | 役割 |
| --- | --- |
| [cmd/app/](../cmd/app/) | Go API のエントリポイント |
| [cmd/seed-dev/](../cmd/seed-dev/) | 開発用シード投入 |
| [internal/config/](../internal/config/) | 環境変数読み込み |
| [internal/db/](../internal/db/) | pgxpool + sqlc 生成コード |
| [internal/db/query/](../internal/db/query/) | sqlc のソース SQL（手書き） |
| [internal/http/](../internal/http/) | chi ルーター + handler + middleware |
| [internal/storage/](../internal/storage/) | S3 (MinIO) 操作ラッパー |
| [internal/worker/](../internal/worker/) | River バックグラウンドジョブ（ffprobe / サムネイル / HLS エンコード） |
| [internal/testutil/pgtest/](../internal/testutil/pgtest/) | 統合テスト用の Postgres セットアップ |
| [docs/api/](../docs/api/) | OpenAPI 契約 |
| [migrations/](../migrations/) | golang-migrate SQL |
| [web/](../web/) | Vite + React + Mantine + TanStack Router の SPA |
| [scripts/](../scripts/) | 開発用シェルスクリプト |

## 4. データフロー（Phase 1）

```
Browser ─tus─▶ tusd (1080) ─S3─▶ MinIO (9000) ─key─┐
                                                    ▼
                          post-finish hook ▶ Go API (/uploads/tus-hook)
                                                    │
                                                    ▼
                                            River jobs ─▶ ffprobe / ffmpeg
                                                    │
                                                    ▼
                                  videos.recorded_at / duration_sec / thumbnail_key
```

- アップロードはブラウザ → tusd 直結。Go API は経由しない。
- tusd の post-finish hook で Go API が videos 行を作成し、River に `video.probe` ジョブを enqueue。
- ワーカは MinIO の署名 URL を ffprobe に渡してメタデータを抽出し、`ffmpeg` で 1 秒地点のサムネイル (320 幅 JPEG) を生成して S3 に保存する。

## 5. 日常コマンド

| 目的 | コマンド |
| --- | --- |
| 開発サーバ起動 | `./scripts/dev.sh` |
| マイグレーション | `./scripts/migrate.sh up` / `down` / `version` |
| sqlc 生成 | `./scripts/gen-sqlc.sh` |
| OpenAPI lint | `./scripts/lint-openapi.sh` |
| TS 型再生成 | `./scripts/gen-api-client.sh` |
| Go テスト | `./scripts/test.sh` |
| 部分テスト | `./scripts/test.sh -run TestRuns ./internal/http/handler/...` |
| Web ビルド検証 | `pnpm --filter web build` |

## 6. API 契約の変更手順

1. [docs/api/openapi.yaml](api/openapi.yaml) を更新
2. `./scripts/lint-openapi.sh` で検証
3. `./scripts/gen-api-client.sh` で `web/src/lib/api/generated.ts` を再生成（必ずコミット）
4. Go 側 handler / sqlc query を更新
5. SPA から生成型を消費

## 7. テストの書き方

- 純関数ユニットテストは `go test ./internal/...` だけで OK。
- ハンドラ統合テストは `video_manager_test` DB を使う。`scripts/test.sh` が DB の存在チェックと作成を行うので、`docker compose up -d postgres` してあれば実行できる。
- 各テストの開始時に [internal/testutil/pgtest](../internal/testutil/pgtest/) が全テーブルを TRUNCATE する。並列テスト前提ではないので、外部状態（クライアントの参照など）は使わない。
- 既存のテスト群に倣って `setupEnv(t)` で `httptest.Server` 相当のテスト用ルーターを取得し、`env.do(t, method, path, body, &out)` でリクエストを送る。

## 8. トラブルシュート

| 症状 | 確認ポイント |
| --- | --- |
| `/ready` が 503 | `docker compose ps postgres` で healthy か。`./scripts/migrate.sh version` |
| アップロード後に Video レコードが出ない | `docker compose logs tusd` で post-finish hook が `host.docker.internal:8080` を叩けているか。Linux では Docker の `host.docker.internal` 対応が必要 |
| Video の recordedAt / duration が NULL | API のログで `video.probe` の失敗を確認。ホスト側に `ffprobe` がいるか (`brew install ffmpeg`) |
| サムネイルが出ない | 上記に加え、ffmpeg のエラーを確認。`thumbnails/<storageKey>.jpg` が MinIO に置かれているか |
| Vite で `/api/*` が 404 | `vite.config.ts` の proxy 設定と `HTTP_ADDR` の整合性 |
| `npm install` が拒否される | このリポジトリは pnpm 専用。`pnpm install` を使う |

## 9. Phase 2 以降の検討

[spec-devflow.md](../spec-devflow.md) §Phase 2 に従って WebSocket 通知や Hocuspocus 連携を載せていく予定。Annotation / ScoutingNote は Phase 1 では DB のテーブルだけ用意しており、handler や UI は未実装。
