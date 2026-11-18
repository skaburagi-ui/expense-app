# 状態カード

対象: **経費・購入申請アプリ**

## 目的と完了条件

`PROJECT.md`を参照する。目的に対する現在位置を、下の「現在地」に1〜2行で示す。

## 現在地

- 進行中タスクID: なし（TSS-002受入完了）
- 状態: 可変ルート・仮払い差額精算のローカル試作を独立再レビューPASS・最終版照合後にPM受入。
- 次の一手: 架空データでの顧客操作確認と、未決事項を解消してからのクラウド共有化。終了前の司令塔点検はON_TRACKで回収済み。
- ブランチ / 受入時の基準commit: main / 9b57b348d1a61e23b5ec4a50e6e094e018e519c8（受入済み差分は今回のコミットに保存）

## 担当

担当は`.tss-dev-os/routing.json`が正である（値はここへコピーしない）。確認は`tss-dev-os route . --show`で行う。

## 代表の判断待ち

ローカル試作は受入済み。本番ログイン・回線・窓口・保存期間等はPROJECT.mdの未決事項。今回のGitHubへのpushはユーザー承認済み（DEC-0003）。デプロイ操作・実データ投入は今回行わない。

## 導入済みツール

| ツール | 用途 | 確認日 | 使い方の入口 |
|---|---|---|---|
| Node.js / npm | 起動・テスト | 2026-11-18 | package.json |
| tss-dev-os | 文書・役割分離、hookなし | 2026-11-18 | .tss-dev-os/routing.json |
| Orca Orchestration | 別セッションでの委任・独立レビュー | 現行ガイド取得済み | orca skills get orchestration |
| Linear | 本案件では未導入、標準の対象外 | 2026-11-18 | WORKFLOW.md、DEC-0002 |

## 調査済み・再調査不要

| 論点 | 結論 | 根拠文書 |
|---|---|---|
| 導入と既存差分 | adoptで既存AGENTSを維持し追記。設計3文書の差分を保護 | DEC-0001/0002 |
| ベースライン | npm test 8件・起動HTTP確認成功。独立PASS・PM受入済み | TASKS_ARCHIVE TSS-001、REVIEW_TSS001.md |
| TSS-002 | 独立33件成功、F-01解消、PC/390pxの初回証拠と対象版を照合して受入 | REVIEW_TSS002.md、TASKS_ARCHIVE |
| 終了前点検 | ON_TRACK。製品manifestと報告hash一致、PM逸脱・重大な残課題の脱落なし。受入の代替には用いない | Run run_64122f72e65f、Dispatch ctx_1c5990612d1f |
| 関連worktree | preflight --siblingsで1作業場所、別作業フォルダ候補なし | PMの実行結果 |

利用枠・追加費用は未取得。hook未導入のためobserveログの集計対象はない。実装・レビューworkerはOrcaの自動解放を確認し、終了前点検workerも結果回収後に解放済み。

## 更新ルール

- PMがタスク状態の変更時・完了時・担当切替時に更新する。
- worktreeや別環境へ渡す前にコミットする（未コミットは新しいworktreeに届かない）。
- 未記入の項目は、PMが最初のタスク着手前に`TASKS.md`・`PROJECT.md`から転記して埋める（推測で埋めない）。
- `.tss-dev-os/pending/`にtss-dev-osの更新候補がある場合、PMが差分を確認して必要分を取り込む。既存のより厳格・詳細な規則は緩めない。
- 60行程度に保ち、履歴は`TASKS.md`に残す。
