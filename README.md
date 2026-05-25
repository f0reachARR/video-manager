# video-manager

ロボコンのテストラン・練習動画を整理し、自チームの振り返りと対戦相手のスカウティングを
支援するセルフホスト型 Web アプリ。チーム内サーバに Docker Compose で立ち上げて使う
ことを想定している（想定 20 名規模、全員同権限、ストレージは TB 単位）。

## できること

### 動画管理

- **再開可能アップロード** — tus プロトコルでブラウザ → tusd → S3 (MinIO) に直接送信。
  TB 級ファイルや電波の弱い練習場でも送信を継続する
- **メタデータ自動抽出** — アップロード後に ffprobe で撮影時刻と長さを取得し、
  iPhone (`com.apple.quicktime.creationdate`) / Android / GoPro / ファイル mtime の順で
  `recorded_at` を決定。後から手動修正も可能
- **Device の時計ズレ補正** — 機材ごとのデフォルトオフセットを `Device` で管理。
  個別 Video で上書き可能
- **HLS トランスコード** — 外部 `cmd/hls-worker` が ffmpeg で複数解像度の HLS を生成。
  ブラウザは hls.js でストリーミング再生
- **サムネイル生成** — ffprobe で代表フレームを抽出して MinIO に保存
- **HEIC 写真サポート** — `heif-convert` (libheif) があればロボット写真の HEIC を JPEG に
  自動変換 (任意機能)
- **バルクアップロード** — PC からドラッグ&ドロップで複数ファイルを一括投入。
  デバイス選択や重複検知に対応

### Session（撮影セッション）

同じ時間帯に撮影された動画群をまとめる単位。練習日・大会の「いつの・どこの撮影か」の
エントリポイント。新動画の時間区間と既存 Session の時間区間を比較し、重なるか
ギャップが閾値以内なら既存 Session への取り込みを提案する（完全自動化はせず、必ず
確認ステップを挟む）。

### Run（試走）とマルチアングル

1 試走 = 1 Run。Video（生ファイル）と Run の関係は多対多で:

- 1 つの長回し動画に複数の Run を含められる（タイムスタンプで区切る）
- 1 つの Run に複数アングルの動画を紐づけられる（正面・コート横・ドローン等）

Run には機体 (Robot) / 走行課題 (Scenario) / 操縦者 / タイム / スコア / タグ / メモを
持たせる。成否は単一 enum ではなく Marker + memo + タグの組み合わせで表現する。

**同期再生ビュー**で 2〜4 分割のグリッドレイアウトを切り替えながら、撮影時刻ベースの
共通マスタータイムラインで再生・一時停止・シークが全アングルに反映される。

### Marker（時刻つきコメント）

Run 単位で「ここで脱輪」「ここでアーム成功」といったイベントを記録する。Run 開始からの
秒数で保存され、全アングルに同時刻で表示される。category (`success` / `failure` /
`note` 等) で絞って通し見できる。**WebSocket でリアルタイム同期**され、他の閲覧者にも
即座に反映される。

### Annotation（位置指定マークアップ・描き込み）

Video 単位で時刻 + 空間情報を持つ。動画上に SVG オーバーレイで描画し、座標は正規化
(0.0〜1.0) で保存する。

- **永続アノテーションモード** — 一時停止して点 / 矢印 / 矩形 / フリーハンド / テキスト
  ラベルを描画、表示時間範囲を指定して保存
- **テレストレーターモード** — 再生中でも自由に描けて数秒で自動フェード。「保存」で
  永続アノテーションに昇格、他参加者にリアルタイム同期 (live ink)
- author ごとに色を自動割り当て、ミーティングで「誰の指摘か」が一目で分かる

### ScoutingNote（作戦メモ）

対戦チーム × 試合への作戦メモ。本番前モードの中核。

- Tiptap (ProseMirror) のリッチテキスト
- 本文中に「動画 X の 2:34 のマーカー」へのリンクを埋め込み、クリックで該当位置に
  ジャンプ
- **Yjs + Hocuspocus による CRDT 共同編集**。他人のカーソル位置がリアルタイム表示

### Tournament / Match / 本番前モード

大会と試合のマスタを持ち、試合単位で「左に相手、右に自チーム」の該当試走動画と
ScoutingNote を並べるマッチアップビューを開ける。本番直前のミーティング運用を想定。
ロボットや動画は Tournament スコープで管理され、UI のトップレベルアンカーになる。

### 検索

機体・課題・期間・結果での絞り込み、タグ検索、メモ・ScoutingNote の全文検索
(PostgreSQL pg_trgm) を提供する。

### 認証

OIDC でログイン (Authorization Code Flow + 署名付き Cookie セッション)。`OIDC_*` を
未設定にすると OIDC を無効化し、`AUTH_DEV_BYPASS=true` で `X-User-Id` ヘッダによる
開発用ユーザ切替が使える。

## 技術スタック

| レイヤ | 採用技術 |
| --- | --- |
| Backend | Go (chi router) + pgxpool + sqlc + River (job queue) |
| Frontend | Vite + React 19 + TypeScript + Mantine + TanStack Router/Query/Form + Tiptap + hls.js + tus-js-client |
| DB | PostgreSQL 16 (`pg_trgm` / `pgcrypto`) |
| Object Storage | S3 互換 (MinIO で開発) |
| Upload | tusd (S3 backend) |
| Realtime | API in-process pub/sub + WebSocket (Marker / Annotation) / Hocuspocus (ScoutingNote 用 Yjs サーバ) |
| Auth | OIDC + 署名付きクッキーセッション |
| Media | ffprobe + ffmpeg (外部 `cmd/hls-worker` プロセス) + libheif (任意) |

## 必要ツール

- [mise](https://mise.jdx.dev/) — Go と pnpm を [mise.toml](mise.toml) で固定
- Docker / Docker Compose
- FFmpeg (`ffprobe`, `ffmpeg`) — 動画メタデータ抽出 / サムネ生成 / HLS エンコード
- libheif (`heif-convert`) — HEIC ロボット写真の JPEG 変換 (任意)
- 上記以外 (`golang-migrate` / `sqlc` / `redocly` 等) は `scripts/` から `go run` /
  `pnpm dlx` 経由で呼ぶため、ホストへの追加インストールは不要

## セットアップ

```sh
mise install
cp .env.example .env
pnpm install
./scripts/gen-api-client.sh   # OpenAPI から TS 型を生成
docker compose up -d           # postgres / minio / tusd / hocuspocus を起動
./scripts/migrate.sh up        # 初期スキーマを適用
./scripts/seed-dev.sh          # User / Device / Robot / Scenario / Tag 等を投入（冪等）
./scripts/dev.sh               # Vite (5173) + Go API (8080) + hls-worker を foreground 起動
```

ブラウザで <http://localhost:5173> を開く。`.env` の `OIDC_*` が空のとき (デフォルト) は
OIDC が無効化されるので、`AUTH_DEV_BYPASS=true` のままユーザピッカーから "現在のユーザー"
を選んでリロードする。OIDC を使う場合は `OIDC_*` と `SESSION_SECRET` を設定して
`AUTH_DEV_BYPASS=false` にする。

HLS エンコード / ffprobe ジョブを動かすには `.env` の `WORKER_AUTH_TOKEN` を設定する
(未設定だと `scripts/dev.sh` は `cmd/hls-worker` の起動をスキップし、ジョブはキューに
積まれたまま実行されない)。

## ポート

| サービス | ポート | 備考 |
| --- | --- | --- |
| SPA (Vite) | 5173 | `/api/*` を 8080 にプロキシ |
| Go API | 8080 | `/health`, `/ready`, `/auth/*`, `/internal/worker/*` |
| PostgreSQL | 5432 | `video / video / video_manager` |
| MinIO API | 9000 | S3 互換。Go API が署名 URL を発行 |
| MinIO Console | 9001 | `minio / minio123` |
| tusd | 1080 | S3 backend で MinIO に保存。post-finish hook で API に通知 |
| Hocuspocus | 1234 | ScoutingNote (Tiptap + Yjs) のリアルタイム同期 |

`docker compose` の profile (`COMPOSE_PROFILES`) で構成を切り替えられる:

- `internal-postgres` — Postgres をコンテナで起動 (既定)
- `internal-s3` — MinIO をコンテナで起動 (既定)
- `app` — Go API + nginx + ビルド済み SPA を 1 ポート (`NGINX_PORT`) で配信

## アーキテクチャ

```text
Browser ─tus─▶ tusd (1080) ─S3─▶ MinIO (9000)
                                      │
              post-finish hook ▶ Go API (/uploads/tus-hook)
                                      │
                                      ▼
                          River jobs (probe / hls.plan / hls.finalize)
                                      │
                          /internal/worker/jobs/* (HTTP long-poll)
                                      ▼
                          cmd/hls-worker (ffprobe / ffmpeg)
                                      │
                                      ▼
                  videos.recorded_at / duration_sec / hls_*
```

- 動画本体はブラウザ → tusd → MinIO の経路で流れ、Go API はデータ経路に入らない
  (API は通知とメタデータ更新だけを担当)
- ffprobe / ffmpeg を実行する `cmd/hls-worker` は API に対して HTTP long-poll で
  ジョブを引き取る外部プロセス。DB 認証情報は不要で、S3 と API URL だけ知っていればよい。
  `docker compose up --scale worker=N` でスケールアウト可能
- API は River のジョブキューを Postgres 上で運用し、外部ワーカーへのディスパッチは
  API 内の in-memory ディスパッチャ経由
- Marker / Annotation のリアルタイム同期は API 内の pub/sub Hub と WebSocket で実装。
  ScoutingNote の Yjs 同期だけは別プロセスの Hocuspocus サーバ (Node) を経由する

## スクリプト

| スクリプト | 用途 |
| --- | --- |
| `scripts/dev.sh` | infra コンテナ起動 → Vite + Go API + hls-worker を foreground 起動 |
| `scripts/dev-worker.sh` | hls-worker をスタンドアロンで追加起動（スケールアウト検証用） |
| `scripts/migrate.sh` | `go run` 経由で `golang-migrate` を呼ぶ薄いラッパー (`up` / `down` / `version`) |
| `scripts/gen-sqlc.sh` | `internal/db/query/*.sql` から `internal/db/sqlc/` に sqlc コード生成 |
| `scripts/seed-dev.sh` | `cmd/seed-dev` を実行してマスタの最小データを投入（冪等） |
| `scripts/lint-openapi.sh` | `docs/api/openapi.yaml` を Redocly で検証 |
| `scripts/gen-api-client.sh` | OpenAPI から `web/src/lib/api/generated.ts` を生成 |
| `scripts/test.sh` | `video_manager_test` DB を用意して `go test ./...` を実行 |

## ディレクトリ

- [cmd/app](cmd/app/) — Go API + in-process River ワーカー (probe / hls.plan / hls.finalize)
- [cmd/hls-worker](cmd/hls-worker/) — 外部 HLS / ffprobe ワーカー
- [cmd/seed-dev](cmd/seed-dev/) — 開発マスタ投入
- [internal/auth](internal/auth/) — OIDC + 署名付きセッションクッキー
- [internal/config](internal/config/) — 環境変数ロード
- [internal/db](internal/db/) — pgxpool ラッパー、sqlc 生成済みコード、ハンド書きクエリ
- [internal/http](internal/http/) — chi ルータ、ハンドラ、ミドルウェア
- [internal/worker](internal/worker/) — River ジョブ定義 (probe / HLS plan / finalize)
- [internal/hlsrunner](internal/hlsrunner/), [internal/hlswire](internal/hlswire/) — 外部 hls-worker との HTTP プロトコル定義と claim/heartbeat 実装
- [internal/realtime](internal/realtime/) — pub/sub Hub と WebSocket ハンドラ
- [internal/storage](internal/storage/) — S3 (MinIO) ラッパーと署名 URL 発行
- [internal/imageproc](internal/imageproc/) — ロボット写真処理 (HEIC→JPEG)
- [internal/testutil](internal/testutil/) — Postgres ベースのテストハーネス
- [migrations](migrations/) — golang-migrate 用 SQL (sequential)
- [docs/api](docs/api/) — OpenAPI 契約 (真実の源)
- [web](web/) — Vite + React + Mantine + TanStack の SPA (`src/routes/` ページ、`src/features/` ドメイン UI)
- [hocuspocus](hocuspocus/) — ScoutingNote 用 Hocuspocus サーバ (Node)
- [deploy/compose](deploy/compose/), [deploy/docker](deploy/docker/) — compose 用初期化スクリプトと Dockerfile

## テスト

```sh
docker compose up -d postgres        # 既に起動済みなら不要
./scripts/test.sh                    # 既定で video_manager_test DB を作って実行
./scripts/test.sh -run TestRuns ./internal/http/handler/...
```

- 純関数ユニットテストは `go test ./internal/...` だけでも動く
- ハンドラ統合テストは実 Postgres を使う。`TEST_DATABASE_URL` 環境変数があれば
  それを優先（既定値: `postgres://video:video@localhost:5432/video_manager_test?sslmode=disable`）
- 各テストの開始時に全テーブルが TRUNCATE されるため隔離は不要 (ただし並列実行は不可)

## API 契約

`docs/api/openapi.yaml` を真実の源として扱う。変更時は次の順で:

1. `docs/api/openapi.yaml` を更新
2. `./scripts/lint-openapi.sh` で検証
3. `./scripts/gen-api-client.sh` で TS 型を再生成（差分をコミット）
4. Go 側 handler / sqlc クエリを更新
5. SPA で新しい型を利用
