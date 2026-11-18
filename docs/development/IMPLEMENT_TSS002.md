# TSS-002 実装報告

実装担当による変更・検証の報告。独立レビューの判定・PM受入は行っていない。

## 実行主体と対象

- 担当アプリ: Codex / OrcaのIMPLEMENTER worker。`.tss-dev-os/routing.json`のimplementer=codexを確認。
- 起動方法: PMからOrca Orchestrationでdispatch。補助worker・サブエージェントは起動していない。
- coordinator: `orca_session_id:codex_7de79080_07c6_4315_815d_ae79af010c68`
- worker: `orca_session_id:b2ddd25e-d903-4df5-959a-182699a2524e`
- Task: `task_0fcdb15762a2` / Dispatch: `ctx_2d61bfb7e9b7`
- 起動コマンド全体・モデル指定・effort・厳密な開始時刻はこのworkerで未取得。作業日は2026-11-18、最終ブラウザー操作は18:46 JST頃。
- 対象: `D:/Users/projects/expense-app`、HEAD `9b57b348d1a61e23b5ec4a50e6e094e018e519c8` と未コミット差分。開始時は製品ファイルに差分なし、既存8件のテスト成功。
- AGENTS、routing、STATUS、DEVELOPMENT_OS、IMPLEMENTER、TASKS TSS-002、DECISIONS、PROJECT、ARCHITECTURE、README、DESIGN、REVIEW_TSS001を読取。Core参照元3文書は存在を確認して読取したが、一括出力に省略があり全文の独立監査とは扱わない。CoreのSkill導入・変更はしていない。

## 変更ファイル

| ファイル | 変更 |
|---|---|
| routes.mjs（新規） | パターン・公開版・割当、下書き／公開／新規利用停止、公開検証、保存ルートの工程・旧固定ルート移行 |
| workflow.mjs | 公開ルートを写した新規提出、工程ID・revision・担当による遷移、内容版と添付本体を含む履歴、購入実績保持、仮払い紐付け・差額処理。従来のrouteなし入力向け遷移も維持 |
| storage.mjs（新規） | v1保全→v2の一度限りの移行、保存形式検証、不正データ時停止、保存失敗・別画面更新の検知 |
| app.mjs / index.html / style.css | 保守担当と設定画面、工程編集・順序変更・プレビュー・公開版割当、現在工程／次担当／進捗、仮払い紐付け、処理記録、見積・領収書区別、旧版添付の閲覧、390px対応 |
| server.mjs | 新規製品モジュール2件だけ配信許可リストへ追加 |
| package.json | `npm test`で既存・追加の両テストファイルを実行。依存追加なし |
| routes.test.mjs（新規） | 重要な新規ケース18件 |
| README.md | 試し方・実装状況・保存移行と制約・今回検証へのリンク。既存要件・承認記録・過去の検証記録を維持 |
| 本報告 | 実装・検証・対象版の記録 |

`workflow.test.mjs`はHEADから無変更で8件の意味とテストコードを維持。AGENTS、DESIGN、Dev-OS、templates、正本・受入欄は変更していない。commit/push、外部設定、実データ投入はしていない。

## 完了条件との対応（実装・検証の範囲）

| 条件 | 実装と今回の根拠 |
|---|---|
| 作成・編集・下書き・公開・停止・公開版割当 | configureで保守担当と設定revisionを検証。公開版は追加保存し、編集は下書きに限定。実ブラウザーで既存編集と新規作成、公開・割当・停止を操作。npm testで設定権限・不正公開・未割当・停止後の新規提出拒否を確認 |
| プレビューと進捗 | 種類別プレビュー、一覧・詳細に現在工程／担当／次担当／全体工程数。経理の事前確認と処理待ちを分ける。実ブラウザーで両パターンのプレビュー・一覧・詳細を確認 |
| 各工程と両例 | 工程ID・kind・roleと現在位置で確認／承認／本人実績／経理処理を区別。購入の経理2回を分離。仮払いは領収書なしで承認→支給済み。npm testと実ブラウザーで確認 |
| 提出時ルートと再申請 | パターン名・版・工程順・担当の写しを申請へ保存。差戻し修正・購入前変更は保存ルート先頭から再実行。npm testで新版公開・割当変更・停止の非遡及、理由必須・再申請・中止を確認 |
| 担当／現工程・二重処理 | 現工程ID、担当、期待revisionを検証。終端・工程飛越・重複を拒否。保存全体にも競合検知。npm testで確認。実認証・サーバー側認可ではない |
| 見積と領収書、実績保持、仮払い差額 | quote/receiptを分け、見積だけの精算を拒否。増額・品目用途変更で再確認・再承認し購入実績は保持。仮払い支給・実費精算・追加／返金／差額ゼロを記録し二重紐付け・精算を拒否。npm testで各ケース、実ブラウザーで増額再承認と返金まで確認 |
| 旧保存データ保全 | 下記移行方針。npm testで正常／空配列／欠損／不正JSON／不正状態／容量不足、移行後の購入増額・差戻しも確認 |
| テストと実ブラウザー | 最終npm testは26件成功（既存8＋追加18）、失敗・skip 0。PCと390px幅で実描画・操作。独立レビュー・PM受入は未実施で、担当へ返す |

## 旧データの扱い

- `expense-prototype-v1`を変更・削除しない。元のJSON文字列・履歴・添付本体をそのまま残す。v2がない初回だけ、旧固定の社長承認→購入の場合は実績→経理処理を写して`expense-prototype-v2`へ保存する。
- v2が存在するときはv2だけを読み取り、v1へ自動的に戻して新形式の記録を失わせる処理はしない。v1もない新規ブラウザーでは従来の架空サンプルを旧ルート付きで作成する。
- 旧申請に経理事前確認を追加しない。元の状態・履歴・添付を保ち、保存ルート・工程位置・版などを付加する。旧購入の実績フラグと状態が矛盾するものは推測で補正せず停止する。
- 欠損・不正形式・JSON破損・移行保存失敗は画面に表示し、編集・新規作成を止める。自動seed置換やリセットボタンはない。実ブラウザーの既存データを壊す試験はせず、異常移行はテスト用メモリストレージで実施した。
- 従来履歴に添付名しかなかった箇所は当時のファイル本体を復元できない。移行後の操作履歴はその時点の添付本体も保持する。容量上限では操作を成功扱いにせずエラーを返す。

## 今回実行したコマンドと結果

| コマンド・確認 | 結果 |
|---|---|
| `orca skills get orchestration`、`orca skills get orca-cli`、`orca skills get orca-cli --reference browser` | 現行ガイド取得。実体は`ORCA_CLI_COMMAND=C:/Users/user/AppData/Local/Programs/orca/resources/bin/orca.exe`。以後はこの実体を使用 |
| `Get-Content`による上記規則・設計・製品コードの読取、`git status --short` / `git diff --stat` / `git diff README.md` | 既存未コミット差分を確認。開始時の製品コードはHEADと同一 |
| 開始時と実装後の`npm test` | 開始時8件、追加後22→24→25件、支払方法の整合性を追加した最終26件すべて成功。最終duration約125ms |
| `node --check app.mjs` / `workflow.mjs` / `routes.mjs` / `storage.mjs` | 構文エラーなし。最後のUI変更後もapp.mjsを再確認 |
| `git diff --check` | 途中でpackage/serverの余分な末尾空行を検出し除去。最終exit 0。CRLF置換予告のみ |
| `git diff --exit-code HEAD -- workflow.test.mjs` | exit 0、既存テスト無変更 |
| `$env:PORT='4187'; node server.mjs` | 127.0.0.1:4187で所有する試験サーバーを起動。初回PID 76212、最終変更確認の再起動PID 57364 |
| Node `fetch`によるHTTP確認 | `/`、app/workflow/routes/storageの各mjs、style.cssは200と適切なContent-Type。README、DESIGN、routing.json、routes.test.mjsは404 |
| Orca `tab create` / `snapshot` / `click` / `fill` / `select` / `upload` / `eval` / `viewport` / `screenshot` / `reload` / `console` | 下記の実ブラウザー操作。最終console entriesは空。初期のPowerShellの未引用`@e7`とevalの再宣言はCLI／検証スクリプトエラーとして修正し、対象操作を再実行。製品の成功とは扱っていない |
| `Get-FileHash` / `git rev-parse HEAD` | 下表を取得、HEADは指定版、AGENTSとDESIGNは開始時hash一致 |
| PIDを`Get-CimInstance`でnode server.mjsと照合後`Stop-Process`、`Get-NetTCPConnection` | 所有する上記2プロセスをそれぞれ停止。最終4187リスナーなし。実行セッション50323／54637も終了を回収（停止によるexit 1） |

## 実ブラウザーで操作した内容

- Browser page: `947ee3cd-fd08-4058-89f3-202c71276121`、URL `http://127.0.0.1:4187/`。Orca組込みブラウザーで実ページを描画。最初のPC表示は1930px程度、後で1366×900、スマホは390×844・mobile=true。
- 社員から保守担当に切替。直接ルートをプレビュー、名前を編集して下書き保存、新版v2公開、仮払いへv2割当。新規パターンに2工程を追加して作成・プレビュー・公開・新規利用停止。
- 仮払い1万円を添付なしで提出→社長承認→経理が日付・担当・金額を入れて支給。支給済み表示と公開版v2の保持を確認。
- 新規購入2万円を提出→経理事前確認→社長承認。差戻し理由空欄は拒否。社員の実績登録で領収書なしは拒否、架空PNGを`orca upload`で実ファイル添付し実績額2.3万円を登録→経理事前確認へ戻る→社長再承認→実績再登録を要求せず最後の経理処理→完了。
- 390px幅で、支給済み1万円に実費8千円の経費精算を紐付けて提出（同じ架空PNG添付）→社長承認→経理で返金2千円を記録。元仮払いが実費精算済みと表示され、新規紐付け候補から除外されることを確認。
- 設定画面で購入ルート先頭を支払工程へ変えて下書き保存→公開拒否を確認し、元の確認工程へ戻して保存・プレビュー。既存公開版を破壊していない。
- スマホ設定の行為欄が狭い箇所を画像で検出しCSSを修正、再描画画像で確認。ページscrollWidth=390、申請／詳細／設定dialogのclientWidth=scrollWidth=356を確認。
- 最終変更後に再読み込みし、追加の架空仮払い3千円を提出→承認→支給まで再実行。支給方法の候補が振込・現金だけになり、エラーなしで支給済みになることを確認。
- 一部の入力・クリックはOrca eval経由で実ページのDOMコントロールを操作しイベントを発火した。業務モジュール関数を直接呼んだり、モックDOMだけで済ませたりしたものではない。キー操作・upload・画像確認も併用。
- 添付は`D:/Temp/tss002-fictional-receipt.png`（生成した1pxの架空PNG）だけ。実名・実領収書等は使用していない。

目視確認した一時スクリーンショット（Orca出力の期限は2026-11-19頃）:

- PC一覧: `D:/Temp/orca-browser-screenshots/08fa6582-0f30-475f-94a6-cd1040336764-screenshot.png`
- 390px一覧: `D:/Temp/orca-browser-screenshots/2eb84e4d-78c5-4c2d-afd1-f7a9b687982a-screenshot.png`
- 390px詳細: `D:/Temp/orca-browser-screenshots/4f975d0e-ed83-4395-8826-b5356d8717b3-screenshot.png`
- 390px設定修正後: `D:/Temp/orca-browser-screenshots/7e529b87-8a78-46ac-b757-262014f539a6-screenshot.png`
- PC設定: `D:/Temp/orca-browser-screenshots/706e26c1-46fc-4f80-8d5b-6875befa2eb7-screenshot.png`

## 対象ファイルのSHA-256

以下は最終の製品・テスト・READMEの生バイトhash。本報告自身は自己参照を避けて含めない。

| ファイル | SHA-256 |
|---|---|
| README.md | 02FFB55257BA9C36732E28F6ADD1E874AB298E723949A70D1834519FF6FEA801 |
| app.mjs | A98242D88F886D1EED164F051101EF4B5F9673D1985350289C9E3019EE7B1A8C |
| workflow.mjs | E6065FA3FF663FF1F138D643358E5FBA9C938A82AE4A80453EE8C84C15DDB5A2 |
| routes.mjs | 0C20A7D8266F44023243D34E6326467B6E2242BA0296836A0B4DCEBC5BEBF040 |
| storage.mjs | 47E27F63599771D7DB22CE69884AD749D68BE4AA42F49FA17CC2E369BAEBA699 |
| index.html | C737BBC0F63E1A68DEC08715AC37CF6A9F7DAB6C77222A0E3E881C2EB382F24D |
| style.css | 16D5DC9CB145E201EECF58A5C7D478FF24807B7AFF665834A90C4ED1B74CFC4B |
| server.mjs | 6B552F124D5167A41F8D681EC9E8832AD3BDEDC115F20DBF6225AC2CB8B18A94 |
| package.json | ED2FF0E95CC4A15ADAEFDD88FEDA7B70B5FE0D3200012CE48484E14B46053124 |
| routes.test.mjs | 1326B421B36F3CAE25EBAE6267BBE7C83006509D2CA81997FF4041F230A45D27 |
| workflow.test.mjs（無変更） | D304552AC18D9E1575414147B8EF3DA142DC31E484C0E9DDB0DBA9292EF74FBD |
| AGENTS.md（保護・無変更） | 26F5410A7536B660014D7B3770BD414A2FF79DCB6E392C6518888BF0B83B32F5 |
| DESIGN.md（保護・無変更） | D93B45B91FAA27AA262ED397BB0B81FC7125813E1BA96E670B524B7B657080C2 |

## 未確認・残る境界とレビュー重点

- 独立REVIEWERの評価とPM受入、正本TASKS/STATUS/ARCHITECTUREの更新はPMへ返す。実装担当は代筆していない。
- 本番の共有DB・本人認証・実際のアクセス制御・接続元制限・Cloudflare変更・銀行送金・正式証憑保管・バックアップ復元、別端末、実機社内Wi-Fi、顧客自身の操作・省力化の効果は未確認・対象外。
- localStorageの更新競合検知はローカル試作用で、共有DBのトランザクションではない。履歴添付の複製で容量に達しやすいため、実運用保管として扱わない。実際のブラウザー容量上限での大きな添付投入は未実施、保存失敗はメモリストレージで検証。
- 旧raw入力向けの従来transitionと、移行済みの保存ルート向けtransitionが共存する。UIは移行後のルート付きレコードだけを扱い、旧入力互換を現行UIの工程制御回避に用いていないこと、移行の拒否条件・履歴保持、差額処理の一体保存を独立レビューで重点確認してほしい。
- PC・390pxは同じ実ブラウザーのviewport変更による検証で、スマホ実機そのものではない。全例外操作をブラウザーで網羅したわけではなく、単体テストと役割を分担した。

## F-01 修正追記（2026-11-18）

この節は初回報告の追記であり、上の実装・検証履歴を消去しない。独立レビュー`REVIEW_TSS002.md`のF-01全文とPMの採用記録を確認して修正した。独立再レビュー・PM受入の判定はしていない。

- 担当: 同じCodex / Orca IMPLEMENTER、worker `orca_session_id:b2ddd25e-d903-4df5-959a-182699a2524e`。
- 新Task: `task_49f7b4234099` / Dispatch: `ctx_3e74a833a421`、coordinatorは前回と同じ。
- 開始後の明示時計: `2026-11-18T18:58:58.5081216+09:00`、hash取得時計: `2026-11-18T19:03:45.9818653+09:00`。
- 対象HEADは前回と同じ。TASKS/STATUSはF-01修正中・PM未受入であること、routingのIMPLEMENTER=codex、AGENTS/DEVELOPMENT_OS/IMPLEMENTERの権限境界と現在差分を確認した。

### 修正したファイルと理由

| ファイル | 今回の差分 |
|---|---|
| routes.mjs | `validateApprovalAmount`と`validateRequestProgress`を追加し、旧移行の戻り値にも適用。承認額の有効範囲、状態・工程、実績フラグ、提出時ルートの識別と版を検証する |
| storage.mjs | v2読込み・保存で上記の共通検証を呼ぶ。状態と工程の検証を遷移側と共通化し、読込みだけ通って操作時に再承認を飛ばす差をなくす |
| workflow.mjs | ルート付き遷移の前後で共通検証を実行。routeなしの旧入力も移行と同じ正規化による検証だけを行い、元入力は変更しない。承認値が不明なままactual/completeへ進めない |
| routes.test.mjs | F-01の7件の回帰テストを追加。各ケース内で欠損・型・範囲・工程矛盾を複数検証する |
| 本報告 | 前回内容を保持して修正・検証・最新hashを追記 |

UI・README・server・package・旧`workflow.test.mjs`・レビュー文書・規則・PM正本は今回変更していない。ブラウザーの実保存には触れず、他worker起動・外部書込み・commit/push・公開等は行っていない。

### 検証する状態と互換性

- 承認額は円の整数1〜99,999,999。値が存在する場合は常に検証し、承認済み工程を通過済み、購入実績登録済み、承認時内容版が存在する場合は欠損も拒否する。購入実績工程・経理処理・完了には有効な承認額が必要となる。精算に進んだまま申請額が承認額を超える不整合も拒否する。
- v2ではactualRegisteredのboolean、ルートpatternId・nameの非空文字列、正の整数version、非負revision、正のcontentVersion、requestedAmountを検証。工程位置と通常状態、差戻し／却下／購入中止の発生可能工程、購入実績フラグと現在工程の整合を確認する。
- 承認前の新規申請や初回承認からの差戻しはapprovedAmount欠損が正常なので許可する。旧形式になかったルート識別・版・工程・申請版は従来どおり移行で付加する。過去の承認値は履歴や現在額から推測で補完しない。
- approvedVersionは存在する場合に1〜contentVersionを検証し、現在版との一致は要求しない。正常な承認額以下の実績登録でもcontentVersionが増えるためである。旧形式はapprovedVersion自体を必須にしない。
- 購入後の増額・内容変更で確認／承認工程へ戻っている間は、前回承認額を超えた最新額を許可する。購入済みの事実を保持し、新たな承認を通ってから精算へ進む。承認額以下・同額・増額の3例を保存・再読込みまで試験した。

### 今回実行した確認と結果

| コマンド・確認 | 結果 |
|---|---|
| 変更前のNodeメモリ再現スクリプト（レビューのA/B相当） | A=`true accounting undefined`、B=`accounting`。ブラウザーや実ファイル保存を変更せず、指摘を実際に再現 |
| `npm test` | 共通検証追加後も既存26件成功、回帰追加後は33件成功。旧8件はコード無変更で維持 |
| `node --test --test-name-pattern F-01 routes.test.mjs` | 7件成功、失敗・skip 0。旧購入許可／経理／完了の不正承認額、v2購入・通常精算・仮払いの不正承認額、遷移防御、重要フィールド欠損、状態矛盾、save不変性、正常互換を確認 |
| 修正後のNodeメモリ再現A/B（assert付き） | Aは読込み拒否、v1原文一致・v2なし・write=0。Bは読込みと9万9999円の実績登録を両方拒否し、v2原文と元レコードが不変・write=0を確認 |
| `node --check routes.mjs` / `workflow.mjs` / `storage.mjs` | 構文エラーなし |
| `git diff --check` | exit 0、CRLF予告のみ |
| `git diff --exit-code HEAD -- workflow.test.mjs` | exit 0、旧8件のテストは変更なし |
| Node cryptoで前回報告のhashと今回非対象ファイルを照合 | 非対象9ファイルのhash一致。変更した製品・テスト4件だけが前回の表から変化 |

回帰にはundefined/null/NaN/±Infinity/数値文字列/0/負数/小数/上限超過を含める。JSONではNaNやInfinityがnullになるため、読込みだけでなく遷移の直接入力でも非数を試験し、元オブジェクトのdeepEqualで未変更を確認している。不正なsave候補についても保存原文とstore.stateの不変性を確認した。

### 最新hash（初回表の該当4行をこの版へ置き換えて照合する）

| ファイル | SHA-256 |
|---|---|
| routes.mjs | 15E4804A2F08A66395FA29DA9A5A81FA859777BF0C33ABC8A65AB601FAC8F9C2 |
| storage.mjs | E07FBC9B35293E6CD10CFEA70213BFC98AB114FCE3CE654F33F116EAB013F2D5 |
| workflow.mjs | AA812EBDDE9F9A9BC073ED6343DF87E9AE362F88BF73BD6E7CF3D7FB057FF24E |
| routes.test.mjs | BEF9FBA7DC15714E20FEC0EA49F18441B79D9AD8CEA85420BCBD1CA5CD357BCE |

製品対象10ファイル（README.md、app.mjs、workflow.mjs、routes.mjs、storage.mjs、index.html、style.css、server.mjs、package.json、routes.test.mjs）の内容manifest SHA-256:

`d0ebb476576538dc7f2890d618b5b39dc78762c75cdcc4b4f662851b0ad32d96`

計算法は上記10パスを辞書順にsortし、`path<TAB>生バイトSHA-256小文字hex<LF>`を末尾LF込み・UTF-8で連結してさらにSHA-256化。本報告自身・PM/レビュー文書を含めない。上表以外の初回hashは現在も一致している。

### 未確認と返却

保存・遷移の局所修正でUI・配信設定に変更がなく、正常操作と読込みをメモリストレージ経由で検証したため、今回は全ブラウザー操作を反復していない。既存ブラウザーの破損JSON投入・データ削除はしておらず、新規サーバーも起動していない。初回報告と独立レビューのブラウザー実績を今回再実行したものとは扱わない。本番認証・共有・社内Wi-Fi・実機・実データ等は引き続き未確認・対象外。

F-01について、欠損値を推測補正せず停止すること、承認額以下の実績追加をapprovedVersion差で誤拒否しないこと、購入済み再申請と旧互換を維持することを、上記対象版と回帰結果で独立再レビューへ返す。自己PASS・PM受入は記載しない。
