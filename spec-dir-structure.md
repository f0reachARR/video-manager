# ディレクトリ構成案

この構成は `spec.md` のアーキテクチャに合わせて、Go API、React SPA、Hocuspocus、Docker Compose、DB マイグレーション、動画処理ジョブを分離する方針にする。

Phase 1 では Go API + React SPA + PostgreSQL + MinIO + tusd を先に成立させ、Phase 2 で Hocuspocus / Annotation / ScoutingNote を同じ構成の中に足していく。

## 全体構成

```text
soiree/
├── cmd/
│   └── app/
│       └── main.go
├── internal/
│   ├── config/
│   ├── db/
│   │   ├── query/
│   │   └── sqlc/
│   ├── domain/
│   ├── http/
│   │   ├── handler/
│   │   ├── middleware/
│   │   └── route/
│   ├── realtime/
│   ├── service/
│   ├── storage/
│   ├── upload/
│   └── worker/
├── migrations/
├── web/
│   ├── public/
│   └── src/
│       ├── app/
│       ├── components/
│       ├── features/
│       ├── hooks/
│       ├── lib/
│       ├── routes/
│       ├── stores/
│       └── styles/
├── hocuspocus/
│   └── src/
├── deploy/
│   ├── docker/
│   └── compose/
├── scripts/
├── docs/
├── docker-compose.yml
├── go.mod
├── sqlc.yaml
├── package.json
└── spec.md
```

## バックエンド

### `cmd/app`

Go アプリのエントリポイント。

`app` コンテナではこのバイナリを起動し、API、WebSocket、静的ファイル配信、ジョブワーカーの起動をまとめて行う。

```text
cmd/app/
└── main.go
```

### `internal/config`

環境変数、Docker Compose 向け設定、MinIO / PostgreSQL / tusd / Hocuspocus Webhook の接続情報を読む。

例:

```text
internal/config/
├── config.go
└── env.go
```

### `internal/db`

sqlc + pgx の置き場。

`query` に手書き SQL、`sqlc` に生成コードを置く。生成物を明確に分けることで、レビュー時に見るべきファイルが分かりやすくなる。

```text
internal/db/
├── db.go
├── query/
│   ├── annotations.sql
│   ├── markers.sql
│   ├── runs.sql
│   ├── scouting_notes.sql
│   ├── sessions.sql
│   ├── tags.sql
│   └── videos.sql
└── sqlc/
```

### `internal/domain`

DB や HTTP に依存しない中心モデルと値オブジェクトを置く。

撮影時刻の信頼度、Session の mode、Run の result、正規化座標、時間範囲など、複数層で使う型をここに集める。

```text
internal/domain/
├── annotation.go
├── marker.go
├── run.go
├── session.go
├── time_range.go
└── video.go
```

### `internal/http`

HTTP API の入口。

handler は薄くし、実処理は `internal/service` に寄せる。ルーティングは機能単位で分ける。

```text
internal/http/
├── handler/
│   ├── annotations.go
│   ├── devices.go
│   ├── markers.go
│   ├── runs.go
│   ├── scouting_notes.go
│   ├── sessions.go
│   ├── uploads.go
│   └── videos.go
├── middleware/
│   ├── logging.go
│   └── user_context.go
└── route/
    └── router.go
```

### `internal/service`

ユースケース層。

Session 自動グルーピング、時計ズレ補正、Run と Video の紐付け、Marker 作成時の WebSocket 通知、検索などをここに置く。

```text
internal/service/
├── annotation_service.go
├── marker_service.go
├── run_service.go
├── scouting_note_service.go
├── search_service.go
├── session_grouping.go
├── session_service.go
├── sync_playback_service.go
└── video_service.go
```

### `internal/realtime`

Marker / Annotation / live ink 用の WebSocket Hub。

Yjs の共同編集は Hocuspocus に任せるため、ここでは DB を真実の源にする通知と、保存しない live ink の中継を扱う。

```text
internal/realtime/
├── hub.go
├── message.go
├── subscription.go
└── live_ink.go
```

### `internal/storage`

MinIO / S3 互換ストレージへのアクセスを閉じ込める。

署名 URL、サムネイル保存先、オブジェクトキー生成、存在確認などを担当する。

```text
internal/storage/
├── minio.go
├── object_key.go
└── signed_url.go
```

### `internal/upload`

tusd と Go API の接続部分。

tusd からの hook / webhook を受けて Video レコード作成、ffprobe ジョブ投入、Session 候補作成につなげる。

```text
internal/upload/
├── tus_hook.go
├── tus_metadata.go
└── upload_finalize.go
```

### `internal/worker`

river ジョブと動画処理。

Phase 1 では ffprobe によるメタデータ抽出とサムネイル生成を置き、Phase 3 で HLS 変換や波形解析を追加する。

```text
internal/worker/
├── jobs.go
├── ffmpeg/
│   ├── ffprobe.go
│   ├── metadata.go
│   └── thumbnail.go
└── river.go
```

## DB

### `migrations`

golang-migrate もしくは goose のマイグレーションを置く。

Phase 1 の時点で `spec.md` の主要テーブルは作っておき、UI 未実装の Team / Tournament / Match / ScoutingNote / Annotation もスキーマだけ先に切る。

```text
migrations/
├── 000001_init_core.up.sql
├── 000001_init_core.down.sql
├── 000002_indexes_search.up.sql
└── 000002_indexes_search.down.sql
```

想定する初期スキーマ範囲:

- users
- devices
- sessions
- videos
- runs
- run_videos
- markers
- annotations
- robots
- scenarios
- teams
- tournaments
- matches
- scouting_notes
- tags
- run_tags
- video_tags

## フロントエンド

### `web`

Vite + React SPA + Mantine UI の置き場。

機能単位の `features` を中心にし、共通 UI は `components`、API クライアントやユーティリティは `lib` に置く。

```text
web/
├── public/
│   ├── manifest.webmanifest
│   └── icons/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── providers.tsx
│   │   └── router.tsx
│   ├── components/
│   │   ├── layout/
│   │   ├── player/
│   │   └── ui/
│   ├── features/
│   │   ├── annotations/
│   │   ├── devices/
│   │   ├── markers/
│   │   ├── matchup/
│   │   ├── runs/
│   │   ├── scouting-notes/
│   │   ├── search/
│   │   ├── sessions/
│   │   ├── tags/
│   │   └── uploads/
│   ├── hooks/
│   ├── lib/
│   │   ├── api/
│   │   ├── realtime/
│   │   ├── time/
│   │   └── tus/
│   ├── routes/
│   ├── stores/
│   └── styles/
└── vite.config.ts
```

### 主要 feature の責務

- `features/uploads`: PWA 即時アップロード、PC バッチアップロード、tus クライアント、進捗キュー
- `features/sessions`: 練習日 / 大会単位の一覧、Session 候補確認、mode_hint 切替
- `features/runs`: Run 作成、長回し動画からの切り出し、メタデータ編集
- `features/markers`: 時刻つきコメント、成功 / 失敗マーカー検索、WebSocket 反映
- `features/annotations`: SVG オーバーレイ、永続アノテーション、テレストレーター
- `features/scouting-notes`: TipTap、marker_link ノード、Yjs 接続
- `features/matchup`: 本番前モードの試合単位ビュー
- `features/search`: 期間、機体、課題、結果、タグ、全文検索

### 動画プレーヤー関連

マルチアングル同期再生は複数 feature から使うため、低レベルのプレーヤー部品は `components/player` に置く。

```text
web/src/components/player/
├── MultiAnglePlayer.tsx
├── PlayerGrid.tsx
├── PlayerTimeline.tsx
├── VideoPane.tsx
└── overlay/
    ├── AnnotationLayer.tsx
    ├── MarkerLayer.tsx
    └── TelestatorLayer.tsx
```

## Hocuspocus

ScoutingNote の CRDT 共同編集サーバ。

Go API と独立した Node コンテナにし、PostgreSQL 永続化と Go API への plain_text 更新 webhook を担当する。

```text
hocuspocus/
├── package.json
├── tsconfig.json
└── src/
    ├── auth.ts
    ├── db.ts
    ├── hooks.ts
    ├── marker-link.ts
    └── server.ts
```

## Docker / デプロイ

### `docker-compose.yml`

ルートに置き、チーム内サーバで一発起動できるようにする。

Compose のサービスは `spec.md` に合わせて次の 5 つを基本にする。

- `postgres`
- `minio`
- `tusd`
- `app`
- `hocuspocus`

### `deploy`

Dockerfile、初期化 SQL、MinIO バケット作成、開発用 compose override などを置く。

```text
deploy/
├── docker/
│   ├── app.Dockerfile
│   └── hocuspocus.Dockerfile
└── compose/
    ├── compose.dev.yml
    └── postgres-init/
```

## scripts

開発補助コマンドを置く。

```text
scripts/
├── dev.sh
├── gen-sqlc.sh
├── migrate.sh
├── seed-dev.sh
└── thumbnail-fixture.sh
```

## docs

仕様以外の運用資料を置く。

TB 単位の動画を扱うため、バックアップ、リストア、容量見積もり、代替わり時のオンボーディングは早めに文書化できるよう分けておく。

```text
docs/
├── backup-restore.md
├── deployment.md
├── development.md
├── onboarding.md
└── storage-policy.md
```

## Phase 1 で先に作る最小構成

最初から全部を作ると重くなるため、Phase 1 の実装開始時は次の範囲を先に作る。

```text
soiree/
├── cmd/app/main.go
├── internal/
│   ├── config/
│   ├── db/
│   ├── http/
│   ├── realtime/
│   ├── service/
│   ├── storage/
│   ├── upload/
│   └── worker/
├── migrations/
├── web/
├── deploy/
├── scripts/
├── docker-compose.yml
├── go.mod
├── sqlc.yaml
└── package.json
```

Phase 2 で `hocuspocus/` を追加してもよいが、Docker Compose のサービス定義だけ先に空に近い形で用意しておくと、ScoutingNote 実装時の差分が小さくなる。

## 命名方針

- Go の package 名は短くする: `service`, `storage`, `realtime`, `worker`
- HTTP handler は REST リソース名に合わせる: `videos.go`, `runs.go`, `markers.go`
- React feature はユーザー機能名に合わせる: `uploads`, `sessions`, `runs`, `markers`
- DB テーブル名は snake_case 複数形にする: `run_videos`, `scouting_notes`
- API の JSON は snake_case ではなく TypeScript と相性のよい camelCase を基本にする

## この構成で分離したい境界

- tusd はアップロード本体を担当し、Go API は完了通知とメタデータ登録を担当する
- MinIO 操作は `internal/storage` に閉じ込める
- ffmpeg / ffprobe 呼び出しは `internal/worker/ffmpeg` に閉じ込める
- Marker / Annotation の永続データは Go API + PostgreSQL を真実の源にする
- live ink は DB に入れず `internal/realtime` の WebSocket 中継に留める
- ScoutingNote の共同編集は Hocuspocus に寄せ、検索用 plain_text だけ Go API 側で扱う
