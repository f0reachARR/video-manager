# 開発フロー案

この文書は `spec.md` と `spec-dir-structure.md` に従って、ロボコン動画整理アプリを実装していくときの進め方を定義する。

目的は、最初から全機能を横に広げるのではなく、動く小さな縦断スライスを早く作り、動画アップロードから振り返りまでの主要体験を段階的に太くしていくことにある。

## 基本方針

- 仕様の中心は「動画を登録し、Session / Run に整理し、マルチアングルで振り返れること」とする
- Phase 1 では練習モードを優先し、本番前モード・共同編集・高度なアノテーションは後から足す
- DB スキーマは先に広めに用意し、UI とユースケースは薄く段階実装する
- HTTP API は OpenAPI を契約の真実の源として扱い、Go API と React SPA のズレを生成・検証で早めに検出する
- 1機能ごとに、DB → API → UI → 動作確認の縦断で完成させる
- tusd / MinIO / ffprobe / WebSocket など外部境界のある部分は、早めに小さく疎通確認する
- 各層の責務は `spec-dir-structure.md` の境界に従い、便利だからといって handler や UI に処理を寄せない

## 開発全体の流れ

### 0. 仕様の棚卸し

実装前に、対象機能が `spec.md` のどの概念に属するかを確認する。

- Session
- Video
- Device
- Run
- RunVideo
- Marker
- Annotation
- ScoutingNote
- Team / Tournament / Match
- Search

曖昧な場合は、先にデータの真実の源を決める。特にリアルタイム系は次の切り分けを守る。

- Marker / Annotation: PostgreSQL が真実の源、WebSocket は通知
- live ink: 永続化しない WebSocket 中継
- ScoutingNote: Yjs 状態は Hocuspocus、検索用 plain_text は Go API 側

### 1. リポジトリ土台を作る

最初にアプリ全体の骨格を作る。

- Go API のエントリポイント: `cmd/app/main.go`
- 設定読み込み: `internal/config`
- DB 接続: `internal/db`
- ルーティング: `internal/http/route`
- ヘルスチェック API
- React SPA の初期画面
- Docker Compose の最小起動
- PostgreSQL / MinIO / tusd の開発用設定

この時点の完了条件:

- `docker compose up` で主要コンテナが起動する
- ブラウザから SPA が表示される
- SPA から Go API のヘルスチェックを呼べる
- Go API から PostgreSQL に接続できる

### 2. 初期 DB スキーマを作る

Phase 1 の UI で使わないテーブルも、後続差分を小さくするため先に切る。

対象:

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

実装順:

1. migrations を作る
2. sqlc の query を最小単位で追加する
3. 生成コードを通す
4. service から使う repository 相当の呼び出しを整理する
5. seed-dev で開発用データを入れる

この時点の完了条件:

- migration up / down が通る
- sqlc generate が通る
- 開発用 seed で User / Device / Robot / Scenario / Tag が作れる

### 3. API 契約を決める

HTTP API は OpenAPI 3.1 の YAML を契約ファイルとして管理する。

推奨配置:

```text
docs/api/openapi.yaml
docs/api/examples/
```

OpenAPI に必ず書くもの:

- `info`: API 名、バージョン、説明
- `servers`: 開発環境と本番想定のベース URL
- `tags`: videos / sessions / runs / markers などの機能単位
- `paths`: エンドポイント、HTTP メソッド、path / query parameter
- `operationId`: 生成コードで使う安定した操作名
- `requestBody`: 作成・更新系 API の入力
- `responses`: 成功レスポンスと主要エラー
- `components.schemas`: 再利用する DTO
- `components.responses`: NotFound / BadRequest などの共通エラー
- `components.parameters`: pagination や ID などの共通 parameter
- `components.securitySchemes`: 認証を入れる場合の定義

契約の粒度:

- DB テーブルをそのまま公開モデルにしない
- API の JSON は `spec-dir-structure.md` に従い camelCase にする
- UUID、timestamp、duration、offset、confidence、enum は schema で明示する
- 作成用、更新用、返却用の schema は必要なら分ける
- nullable と optional を曖昧にしない
- ページング、ソート、検索条件は共通ルールを決める
- エラー形式は全 API で統一する

最初に決める共通レスポンス:

```yaml
components:
  schemas:
    ErrorResponse:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: object
          additionalProperties: true
```

最初に決める operationId の命名:

- `listSessions`
- `createSession`
- `getSession`
- `updateSession`
- `listVideos`
- `createRun`
- `createMarker`
- `searchRuns`

operationId はクライアント生成やテストから参照されるため、一度公開したら安易に変えない。

この時点の完了条件:

- `docs/api/openapi.yaml` が存在する
- Phase 1 の主要リソースの最小 API が定義されている
- OpenAPI の lint / validate コマンドが用意されている
- TypeScript の API 型またはクライアントを生成できる
- Go 側の handler 実装と OpenAPI の path / method / response が対応している

### 4. 動画なしの管理 UI を先に通す

動画処理に入る前に、軽い CRUD で API と UI の型・通信・レイアウトを固める。

優先順:

1. User の簡易選択
2. Device 管理
3. Robot 管理
4. Scenario 管理
5. Tag 管理
6. Session 作成・一覧

この段階では認証を重くしない。セルフホストで全員同権限という前提に合わせ、現在ユーザーを選ぶ程度から始める。

この時点の完了条件:

- React から API 経由で基本マスタを作成・編集できる
- Session に `mode_hint` を設定できる
- フロントエンドの API クライアントと TanStack Query の置き場所が固まる

### 5. アップロード経路を最小実装する

動画アプリの最大リスクはアップロードとストレージなので、早めに実ファイルで通す。

最初に作る範囲:

- tusd への単一ファイルアップロード
- MinIO への保存
- tusd hook / webhook から Go API へ完了通知
- Video レコード作成
- storage_key の生成
- 署名 URL で動画を取得

この時点では、PWA、バッチキュー、再開 UI は簡易でよい。まず 1 ファイルが保存され、一覧に出て、ブラウザで再生できる状態を作る。

この時点の完了条件:

- ブラウザから動画を1件アップロードできる
- MinIO にオブジェクトが作られる
- videos にレコードが作られる
- 署名 URL で動画を再生できる

### 6. メタデータ抽出と Session 候補を作る

アップロード後に ffprobe ジョブを動かし、撮影時刻と長さを Video に反映する。

実装順:

1. worker の起動
2. river ジョブ投入
3. ffprobe ラッパー
4. recorded_at 抽出
5. recorded_at_confidence の判定
6. duration_sec 保存
7. Device の time offset 適用
8. Session 候補計算
9. ユーザー確認 UI

Session 自動グルーピングは完全自動にしない。仕様どおり、候補提示と確認ステップを挟む。

この時点の完了条件:

- アップロード後に recorded_at / duration_sec が埋まる
- confidence が high / medium / low / manual のいずれかになる
- 既存 Session と 30 分以内のギャップなら候補表示できる
- ユーザーが既存 Session 追加または新規 Session 作成を選べる

### 7. Run とマルチアングルの核を作る

次に、練習の振り返り体験の中心である Run を作る。

実装順:

1. Session 内 Video 一覧
2. Run 作成
3. RunVideo 紐づけ
4. video_offset_start / video_offset_end の編集
5. angle_label の設定
6. Run メタデータ編集
7. 2分割までの同期再生
8. 3〜4分割対応
9. メイン大＋サムネイル表示切替

同期再生は、撮影時刻と RunVideo の offset をもとに共通マスタータイムラインを作る。主アングルは保存せず UI の一時状態にする。

この時点の完了条件:

- 1つの Video から複数 Run を切り出せる
- 1つの Run に複数 Video を紐づけられる
- 再生 / 停止 / シークが複数動画に反映される
- Run の result / score / memo / robot / scenario / tags を編集できる

### 8. Marker を実装する

Run を見ながら時刻つきコメントを残せるようにする。

実装順:

1. Marker 作成 API
2. Run 詳細での Marker 一覧
3. プレーヤーのタイムライン表示
4. 現在時刻から Marker 追加
5. category による見分け
6. WebSocket 通知
7. 再接続時の REST 再取得
8. Marker 検索

Marker は Run 単位のデータであり、Video や angle に依存しない。保存値は `run_offset_sec` とする。

この時点の完了条件:

- Run 再生中に現在時刻へ Marker を追加できる
- 別ブラウザに Marker 追加がリアルタイム反映される
- 失敗 / 成功 / note などの category で絞り込める
- 再接続後も DB の内容から復元できる

### 9. 検索・フィルタを Phase 1 レベルまで作る

練習モードで必要な検索を実用レベルにする。

対象:

- 期間
- Robot
- Scenario
- result
- tags
- memo
- Marker category

全文検索は最初から完璧にしないが、pg_trgm の index 設計は早めに入れておく。

この時点の完了条件:

- Session / Run / Video を主要条件で絞り込める
- よく使う検索条件でレスポンスが重くなりすぎない
- UI 上で条件を組み合わせても結果が破綻しない

### 10. PWA とアップロード体験を仕上げる

核が通った後に、現場で使いやすいアップロード体験へ寄せる。

実装対象:

- manifest
- ホーム画面追加
- スマホ向け即時アップロード画面
- PC 向けドラッグ&ドロップ
- 複数ファイルキュー
- 進捗表示
- tus の再開
- 失敗時の再試行
- オフライン時の扱い

この時点の完了条件:

- スマホから撮影直後の動画を選んでアップロードできる
- PC から複数ファイルをまとめてアップロードできる
- 大きいファイルでも進捗と再試行が見える

### 11. Phase 1 の仕上げ

Phase 1 の終わりでは、練習モードが実運用で試せる状態を目指す。

仕上げ対象:

- サムネイル生成
- 一覧の表示密度調整
- Session / Run の編集導線
- Device の時計ズレ補正 UI
- 基本的なエラー表示
- Docker Compose 一発起動の確認
- 開発用 README または docs/development.md

Phase 1 完了条件:

- 動画をアップロードできる
- 撮影時刻・長さ・サムネイルが自動登録される
- Session に整理できる
- Run を切り出せる
- 複数アングルを同期再生できる
- Marker をリアルタイム共有できる
- 検索・フィルタで振り返り対象を探せる

## Phase 2 の進め方

Phase 2 は、Phase 1 の実運用で見えた改善点を吸収してから入る。

優先順:

1. Team 登録 UI
2. Tournament / Match 管理
3. 本番前モードのナビゲーション
4. マッチアップビュー
5. Annotation 永続モード
6. テレストレーター live ink
7. Hocuspocus 導入
8. ScoutingNote 共同編集
9. TipTap marker_link
10. 共有ページ・PNG エクスポート

Annotation は Video 単位、Marker は Run 単位という境界を崩さない。ScoutingNote は Hocuspocus を独立コンテナとして扱い、Go API は検索用 plain_text とマーカーリンク解決を担当する。

## API 契約の維持方法

OpenAPI は「後でドキュメントを書くためのもの」ではなく、実装前に合意する契約として扱う。

変更手順:

1. `docs/api/openapi.yaml` を先に変更する
2. lint / validate を通す
3. TypeScript の型または API クライアントを生成する
4. Go 側の request / response DTO と handler を更新する
5. フロントエンド feature から生成済み型を使う
6. 実装後に API の実レスポンスが OpenAPI と一致するか確認する
7. PR や実装メモでは API 契約の変更点を明記する

維持するためのコマンドを `scripts/` に置く。

```text
scripts/lint-openapi.sh
scripts/gen-api-client.sh
scripts/check-api-contract.sh
```

CI または手元確認で見るもの:

- OpenAPI YAML が構文的に正しい
- `operationId` が重複していない
- `$ref` が壊れていない
- required / nullable / enum が意図どおりになっている
- 生成された TypeScript 型に差分がある場合、OpenAPI の変更と同じコミットに含まれている
- Go handler が未実装の path を残していない
- 主要 API のレスポンス例が schema と一致している

破壊的変更の扱い:

- response から field を消す
- field の型を変える
- enum 値を消す、または意味を変える
- required field を増やす
- path / method / operationId を変える
- エラー形式を変える

これらは破壊的変更として扱い、呼び出し側の修正と同時に行う。セルフホストで利用者が限られるためバージョニングは重くしないが、Phase 1 運用開始後は `deprecated: true` と移行期間を使う。

非破壊的変更として扱いやすいもの:

- response に optional field を追加する
- enum 値を追加する。ただし UI の fallback 表示も同時に用意する
- 新しい path を追加する
- query parameter を optional で追加する

OpenAPI と実装の役割分担:

- OpenAPI: 外から見える HTTP 契約、DTO、エラー、認証、例
- sqlc: DB との契約
- domain: アプリ内部の型とルール
- service: ユースケースと整合性
- handler: OpenAPI DTO と service 入出力の変換

生成方針:

- TypeScript 側は OpenAPI から型または API クライアントを生成する
- Go 側は最初から全面生成に寄せすぎず、handler の型チェックや contract test に使う
- 生成物は置き場所を固定し、手編集しない
- 生成物の差分が大きくなった場合は、OpenAPI の変更単位が大きすぎないか見直す

## 機能ごとの実装ループ

各機能は次の順で進める。

1. 仕様確認
2. データモデル確認
3. migration 追加
4. sqlc query 追加
5. domain 型追加
6. service 実装
7. handler 実装
8. route 登録
9. フロントエンド API クライアント追加
10. feature UI 実装
11. 動作確認
12. 必要に応じてテスト追加
13. docs 更新

判断基準:

- 複数画面で使う低レベル UI は `web/src/components`
- ユーザー機能に閉じる UI は `web/src/features`
- サーバ状態は TanStack Query
- 画面をまたぐ一時状態は Zustand
- DB に関係する処理は service
- 外部 I/O は storage / upload / worker / realtime に閉じ込める

## テストと確認

最初から巨大なテスト群を作るより、壊れると困る境界に重点を置く。

優先して確認するもの:

- migration up / down
- sqlc generate
- service の時間計算
- Session 自動グルーピング
- Device offset 適用
- RunVideo の offset 計算
- Marker の run_offset_sec
- WebSocket の再接続後復元
- tus upload hook
- ffprobe metadata parse

UI は、Phase 1 の主要導線を手動で何度も通す。

主要導線:

1. Device を登録する
2. 動画をアップロードする
3. Session 候補を選ぶ
4. Run を作る
5. 複数アングルを紐づける
6. 同期再生する
7. Marker を追加する
8. 検索で Run を見つける

## 先に決めすぎないこと

次の項目は、Phase 1 の実運用前に作り込みすぎない。

- HLS 変換
- 高度なダッシュボード
- キーフレーム補間つきアノテーション
- プレゼンス機能
- 音声波形同期
- 複雑な Tournament 階層
- 完全な権限管理

ただし、後から追加できるように DB とディレクトリ境界だけは意識しておく。

## 実装時の合意事項

- `spec.md` と矛盾する変更が必要になった場合は、実装だけでなく仕様も更新する
- `spec-dir-structure.md` にない大きなディレクトリを増やす場合は、先に理由を明文化する
- Phase 1 では練習モードの完成度を優先する
- UI は実際の練習場で素早く使える密度と導線を優先する
- TB 単位の動画を扱うため、ファイルコピーや変換を安易に増やさない
- DB とオブジェクトストレージの整合性が崩れる操作には、失敗時の扱いを必ず設計する

## 開発のおすすめ順まとめ

最短で実用に近づける順番は次の通り。

1. Compose / Go API / React / PostgreSQL の疎通
2. 初期 migration と sqlc
3. OpenAPI 契約と生成・検証コマンド
4. Device / Robot / Scenario / Tag / Session の軽い CRUD
5. tusd + MinIO + Video レコード作成
6. ffprobe metadata 抽出
7. Session 候補確認
8. Run / RunVideo
9. マルチアングル同期再生
10. Marker + WebSocket
11. 検索・フィルタ
12. PWA / バッチアップロード / 再開 UI
13. Phase 1 運用テスト
14. Phase 2 の本番前モードと Annotation / ScoutingNote

