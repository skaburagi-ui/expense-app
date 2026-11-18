# TSS-002 独立レビュー

判定: **FIX_REQUIRED**。通常フローは成立するが、承認額の欠損した保存申請を受け入れ、購入増額の再承認を飛ばせる。F-01を修正して独立再レビューへ返すこと。これはローカル架空データ試作の評価であり、本番認証・共有・公開の受入ではない。

## 実行主体と対象版

- アプリ・役割: Codex / Orcaの独立REVIEWER。routingのreviewer=codexと一致。製品実装者とは別セッションで、このレビューでは製品・テストを変更していない。
- 起動: PMからOrca Orchestrationで再dispatch。workerの起動コマンド全体・モデル指定・effortは直接取得していない。他workerは起動していない。
- coordinator: `orca_session_id:codex_7de79080_07c6_4315_815d_ae79af010c68`
- reviewer: `orca_session_id:63677fed-5368-49b3-9163-8381c779ef19`
- Task: `task_2168b8f47e94` / Dispatch: `ctx_63a8d2d7a852`（dispatch本文から取得）。
- 開始時計: 2026-11-18T18:50:04.9934607+09:00。実検証・サーバー停止終了時計: 2026-11-18T18:55:25.0361559+09:00。文書作成・最終照合はその後。
- 文書作成後の最終照合時計: 2026-11-18T18:57:20.526+09:00。既存41ファイルのmanifestを再計算し、以下の値と一致。本レビュー文書以外の内容を維持した。
- HEAD: `9b57b348d1a61e23b5ec4a50e6e094e018e519c8` と未コミット差分。
- `git diff --binary HEAD` stdout生バイトのSHA-256: `bf157ca15bdc6f559494b53fc5aa4822ad8fab7395c5ebe1f81483c9e88e5e9d`。
- 未追跡を含む既存41ファイルの内容manifest SHA-256: `e67de6d4e2ddde6116d31a1eec36a87edf6a9a9a948a43c74d4d98f93b017969`。計算方法は `git ls-files --cached --others --exclude-standard` のパスをsortし、本レビューを除き、`path<TAB>各ファイル生バイトSHA-256小文字hex<LF>` を末尾LF込みで連結してSHA-256化（UTF-8）。

報告の13ファイルは自分でSHA-256を再計算し、全件一致した。

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
| workflow.test.mjs | D304552AC18D9E1575414147B8EF3DA142DC31E484C0E9DDB0DBA9292EF74FBD |
| AGENTS.md | 26F5410A7536B660014D7B3770BD414A2FF79DCB6E392C6518888BF0B83B32F5 |
| DESIGN.md | D93B45B91FAA27AA262ED397BB0B81FC7125813E1BA96E670B524B7B657080C2 |

AGENTS/DESIGNはTSS-001レビュー時のhashとも一致。routing、Dev-OSの役割・規則10文書、templates5文書の計16ファイルもTSS-001取得値と一致。`git diff --exit-code HEAD -- workflow.test.mjs`はexit 0。PMによるTASKS/STATUS/ARCHITECTURE等の更新と、製品差分を区別した。

## 元要望から定めた確認軸

実装報告の主張に依存せず、次の順で要求・コード・テストを照合した。

1. 種類への割当だけで、仮払いの直接承認と購入の経理事前確認ありを選べるか。公開前確認と公開版管理が業務に反映するか。
2. 2回の経理、購入実績、社長承認を工程IDで分離し、担当・現在位置・revisionで操作を限定するか。
3. 提出済みルートを固定し、差戻し・購入内容変更・増額を正しい順序で再確認するか。購入済み実績を失わないか。
4. 支給済み仮払いを実費精算と区別し、紐付け、追加・返金・差額ゼロ、二重処理を管理するか。
5. 旧保存・履歴・添付を保全し、欠損・破損・保存失敗で安全に止まるか。旧互換関数がUIの工程制御を迂回しないか。

根拠の区分: 元要望はユーザー経由の代理情報、DESIGNの承認記録は設計承認、今回のテスト・描画はAIによる検証。顧客の実操作や中継負担削減の行動データはない。

## 必須指摘 F-01: 承認額の欠損を受け入れ、増額再承認を飛ばす

重大度: **高（P1、受入前に修正）**。通常入力で欠損することを示したものではない。明示された「欠損・破損時は停止」の条件を満たさず、欠損した保存データを開いた後は通常の実績登録操作で再承認を回避できる。

根拠:

- `routes.mjs:84` の旧形式検証は、購入許可済みの `approvedAmount` を検証しない。
- `storage.mjs:5` 以降の新形式検証も、工程に必要な `approvedAmount` を検証しない。
- `workflow.mjs:123` は `r.amount > r.approvedAmount` を再承認条件に使う。欠損値undefinedとの比較はfalseになり、品目・用途が同じ増額実績は最終経理処理へ進む。

再現A（Nodeの一時メモリ内だけで実行、ファイル・実ブラウザーの既存保存は変更していない）:

```js
import { seed, applyAction } from './workflow.mjs';
import { currentStep } from './routes.mjs';
import { openStore, legacyKey, storageKey } from './storage.mjs';
const old = seed();
delete old[1].approvedAmount; // EX-1002: purchase_authorized
const raw = JSON.stringify(old);
const data = new Map([[legacyKey, raw]]);
const store = openStore({
  getItem: k => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, v)
});
const p = store.state.records[1];
const records = applyAction(store.state.records, p.id, 'actual', 'employee', {
  expectedRevision: p.revision, stepId: currentStep(p).id,
  amount: 99999,
  attachments: [{ name: 'fictional.pdf', kind: 'receipt', size: 1,
    data: 'data:application/pdf;base64,AA==' }]
});
console.log(data.has(storageKey), records[1].status, records[1].approvedAmount);
```

実際の結果: `true accounting undefined`。期待は旧rawを保全したまま移行を拒否しv2を書き込まないこと。

再現B: 新規購入2万円を通常のreview→approveで購入実績工程に進めた後、保存JSONのapprovedAmountだけを削除してv2メモリストレージに置いた。`openStore`は成功し、同じ9万9999円の実績を登録すると `accounting` へ進み、`store.save` まで成功した。期待はv2の読込み段階で停止すること。

同じ検証不足の補助例として、新規購入の `actualRegistered` と `route.version` / `route.patternId` を削除しても `validateState` は成功した（未実績・提出時版の識別に必要なフィールド）。これは別の実装要求を増やす指摘ではなく、状態ごとに必須データを検証する必要性の根拠。

最小修正方針:

- 旧移行とv2読込みの両方で、購入実績工程以降に必要な有効な承認額等を検証し、不明値を推測で埋めず停止する。旧履歴から推測して復元する必要はない。
- v2の必須フィールドと、購入実績フラグ・現在工程の整合も検証する。旧形式で存在しなかった新メタデータは移行で付与し、旧互換を壊さない。
- 遷移側でも承認額未確定のままactual/精算へ進ませない防御を加える。
- 再現A/B、欠損・非数・範囲外の承認額と重要フィールド欠損の回帰テストを追加し、v1保全・v2未書込み・メモリ未更新を確認する。正常な旧申請の再申請と購入済み実績保持も引き続き通す。

## 実行した検証と確認結果

AGENTS、routing、STATUS、DEVELOPMENT_OS、REVIEWER、TASKS TSS-002、DESIGN、PROJECT/ARCHITECTURE/DECISIONS、README、実装報告、製品3モジュール・UI・追加テストを読み取った。Core参照元は前回TSS-001で存在と読み取りを確認しており、今回変更していない。Orca過去セッション検索はindex-statusでenabled/currentを確認後、`search 'TSS-002' --path D:/Users/projects/expense-app --limit 5 --json`を実行したが、このレビュー依頼のhitだけで、過去の独立PASS証拠としては用いていない。

| 自分のコマンド・検証 | 結果 |
|---|---|
| `npm test` | 26件PASS、失敗/skip 0、約116ms。既存8件と追加18件を直接実行。F-01の組合せは検出していない |
| `git rev-parse HEAD` / `git diff --stat` / `git diff --check` | 対象HEAD一致、差分確認、check exit 0。CRLF変換予告のみ |
| 実装報告のhash表を読取り、Node cryptoで13ファイルを再計算 | 全MATCH。保護規則16ファイルも前回と全一致 |
| メモリ内F-01再現A/B | いずれも欠損受付と増額再承認回避を再現 |
| メモリ内の保存競合再現 | stale saveを拒否、先行保存とstore.stateを維持 |
| `PORT=4193; node server.mjs` | 自分の試験サーバーだけ起動。127.0.0.1:4193、PID 51768（起動18:50:34） |
| Node fetchで `/`、`/routes.mjs`、`/storage.mjs` | 全200。DESIGNとroutes.test.mjsは404 |
| 所有PIDのGet-CimInstance確認後Stop-Process、Get-NetTCPConnection | 停止済み、4193のリスナー0、実行session 48365終了回収（強制停止によるexit 1）。最初の動的PID照合は不一致で停止を拒否し、明示PID・実際のcommand lineを確認してから停止 |

通常系については以下の実装と既存テストを直接照合した。

- 公開検証は承認工程、最後の経理処理、購入の実績工程と担当を検証する。下書き編集と公開版を分け、割当は公開版に限定する。
- 提出時に工程列を複製し、設定の新版・停止を遡及適用しない。差戻し・購入前変更・購入後の用途品目変更/増額は保存ルートの先頭へ戻り、実績フラグとpurchaseActualを保持する。
- requireStepはkind/role/stepId、expectedRevisionを照合する。legacyTransitionへの分岐はroute無しに限られ、現行UIはopenStoreを通じたルート付き申請だけを扱う。正常なUIから旧分岐を使う抜け道は確認しなかった。F-01は旧互換関数を呼ばず、ルート付きの新遷移でも起きる。
- quoteだけの精算・実績は拒否し、現行履歴には添付本体を複製する。v1の原JSONは保存処理で変更・削除しない。既存テストで旧履歴・添付の一致、不正JSON・不正状態・容量失敗・更新競合を確認。ただし欠損検証の範囲にF-01の穴がある。
- 仮払い紐付けは対象の支給状態・本人・重複・精算済みを検証し、追加支給/返金/差額ゼロを記録する。親と精算申請を同一v2 JSONのsaveで保存し、save失敗時はUIのstate更新・成功toastへ進まない。

## 自分の実ブラウザー確認

現行orca-cliスキルと `orca skills get orca-cli --reference browser` を読み、環境指定の `C:/Users/user/AppData/Local/Programs/orca/resources/bin/orca.exe` を使用。ページ `be4fea5f-2869-490d-9c44-45a6882e3eae`、未使用の別origin `http://127.0.0.1:4193/` を新規作成。既存タブのデータ削除・reset・v1/v2の直接書換えはしなかった。

Orca snapshot/selectに加え、evalで実ページのDOMコントロールへ値設定・changeイベント・click・requestSubmitを行った。業務モジュールを直接呼んだものやDOM模擬ではない。添付はメモリ生成の架空4byte PDFを実際のfile inputへDataTransferで渡し、製品FileReaderと保存処理を通した。PDF閲覧品質を試したものではない。

- 保守担当で公開前プレビュー、既存パターン名の下書き編集→v2公開→仮払いv2割当。
- 社員で種類だけ選び仮払い1万円を提出。ルートを新規利用停止してから、社長承認→経理支給が既存のv2ルートで継続し、「支給済み（実費未精算）」となることを確認。
- 新規パターンを2工程で作成→下書き保存→プレビュー→公開→仮払いへ割当→停止。その後、元パターンも再公開して設定操作を継続した。
- 新規購入2万円→経理事前確認。空理由の差戻しは拒否→確認→社長承認→社員実績登録。領収書なしは拒否し、架空添付付き2.3万円の実績登録で経理事前確認へ戻ることを確認。
- 経理再確認→社長再承認→最後の経理処理。実績再登録を要求せず購入完了。precheckとpaymentが別IDで履歴に残り、実績と添付を保持した。
- 仮払い1万円へ実費1万円を紐付け、差額0円として承認→経理処理。kind=balanced、親のsettledBy、両レコードの状態を確認。リロード後もloadError空、購入/精算done・仮払いdisbursedと紐付けを保持。
- 390×844 mobile=trueで仮払い・購入・差額精算を操作し、スクリーンショットを目視確認。ページscrollWidth=390、詳細dialog clientWidth=scrollWidth=356。1366×900でも画像を目視確認。console entriesは空。

自分で保存・目視した画像（Orca一時出力、期限2026-11-19頃）:

- 390px仮払い詳細: `D:/Temp/orca-browser-screenshots/50018a0a-380b-4995-95f5-e7f7768f73a1-screenshot.png`
- PC差額ゼロ精算詳細: `D:/Temp/orca-browser-screenshots/b6b50b76-37ab-4f0f-9018-a63f95b5c267-screenshot.png`

実装担当のPC設定 `706e26c1-46fc-4f80-8d5b-6875befa2eb7-screenshot.png` と390px設定 `7e529b87-8a78-46ac-b757-262014f539a6-screenshot.png` も同じ一時画像ディレクトリから直接開き、操作欄と文字の描画を確認した。これだけで報告の全操作を独立確認したとは扱わない。

## 残る範囲・PMへの返却

F-01を実装担当へ返し、修正後の対象hashと回帰結果で再レビューする。PM受入、TASKS/STATUSの代筆・checkbox更新、製品修正は行っていない。

今回、実ブラウザーで全例外（購入前変更、理由あり差戻し、用途品目変更、追加支給/返金、破損保存と容量上限）を網羅したわけではない。それらの正常な既存単体ケースはnpm testとコードで照合し、破損の追加境界はメモリ内で直接再現した。スマホ実機、社内Wi-Fi、別端末共有、本人認証・本番認可、クラウド設定、実データ・顧客操作・省力化効果・公開は対象外で未確認。Linearは未導入の明示条件とWORKFLOW対象外を維持し、外部構成やチケットは作成していない。

## F-01 修正後の独立再レビュー（2026-11-18、最新判定）

**最新判定: PASS**。初回F-01は解消した。上のFIX_REQUIREDと再現記録は初回対象版の履歴として保持する。このPASSは修正後のローカル架空データ試作に対する独立判定であり、PMの受入・TASKS完了更新を代筆するものではない。

### 実行主体・対象版

- 実行主体: 引き続きCodex / Orcaの同じ独立REVIEWER。製品修正者とは別セッション。routing reviewer=codexを再確認。
- 起動方法: coordinatorからOrca Orchestrationで再dispatch。起動コマンド全体・モデル指定・effortは直接取得していない。
- coordinator: `orca_session_id:codex_7de79080_07c6_4315_815d_ae79af010c68`
- reviewer: `orca_session_id:63677fed-5368-49b3-9163-8381c779ef19`
- 再レビューTask: `task_f83f9c470027` / Dispatch: `ctx_d0c287cd9f0b`。
- 開始時計: 2026-11-18T19:06:28.4886628+09:00。検証終了時計: 2026-11-18T19:08:02.233+09:00（この追記の作成・保存はその後）。
- 対象HEAD: `9b57b348d1a61e23b5ec4a50e6e094e018e519c8`、修正後の未コミット作業ツリー。
- 製品10ファイルmanifest: `d0ebb476576538dc7f2890d618b5b39dc78762c75cdcc4b4f662851b0ad32d96`。
- 実装報告SHA-256: `DFB12000AC4798E0BAA440395B4C56C510D46AD741E903722DE98A333FD1E22E`。
- `git diff --binary HEAD` stdout生バイトSHA-256: `850b460af823d90502a5cef76c4665daf8df435cb896580b87e3ccc9c4dd7e20`。
- 本レビュー文書を除く既存41ファイルmanifest: `79a6015d9565822a055d0b56da9c85dfc63aa05af37bd4b21dbede23618c2678`（計算法は初回と同じ）。

すべて自分でNode cryptoとgit出力から再計算し、製品manifestと報告hashはdispatchの指定値と一致。製品manifestの対象・計算法は実装報告の10ファイル、パス辞書順、`path<TAB>小文字SHA-256<LF>`、末尾LF込みUTF-8。

修正後4ファイルのhash（初回表のこの4行を置き換えた対象版）:

| ファイル | SHA-256 |
|---|---|
| routes.mjs | 15E4804A2F08A66395FA29DA9A5A81FA859777BF0C33ABC8A65AB601FAC8F9C2 |
| storage.mjs | E07FBC9B35293E6CD10CFEA70213BFC98AB114FCE3CE654F33F116EAB013F2D5 |
| workflow.mjs | AA812EBDDE9F9A9BC073ED6343DF87E9AE362F88BF73BD6E7CF3D7FB057FF24E |
| routes.test.mjs | BEF9FBA7DC15714E20FEC0EA49F18441B79D9AD8CEA85420BCBD1CA5CD357BCE |

初回レビューの13行と実体を機械比較し、この4件だけが変化し、UI・README・server/package・旧テスト・AGENTS/DESIGNの他9件は一致することを自分で確認。`git diff --exit-code HEAD -- workflow.test.mjs`もexit 0。

### 独立に実行した検証

AGENTSの境界、routing、STATUS/TASKSの回収状態、DEVELOPMENT_OS/REVIEWER、実装報告の修正追記を確認し、新しい共通検証・呼出箇所・回帰テストを直接読んだ。実装担当の成功報告だけでは判定していない。

| 自分のコマンド・検証 | 結果 |
|---|---|
| `npm test` | 33件PASS、失敗/skip 0、約312ms。旧8件・初回18件・F-01回帰7件が成功 |
| `git rev-parse HEAD` / `git diff --check` | 指定HEAD一致、check exit 0、CRLF変換予告のみ |
| PowerShell here-stringを `node --input-type=module` へ渡す独立assertスクリプト | 以下のA/B各10例、メタデータ・状態11例、正常購入9経路、不正saveの保全が全成功。スクリプトを製品・テストファイルへ書き込んでいない |
| Node cryptoで対象・報告・非対象ファイルを再計算 | 指定manifest/報告hash一致、初回非対象9件一致 |

独立スクリプトでは実装テストのhelperをimportせず、製品関数とNode assertだけを使用した。出力は `{"result":"PASS","reproA":10,"reproB":10,"metadataAndState":11,"normalPurchaseSaveReloadAndRawLegacy":9,"invalidSavePreserved":true}`。

- **再現A**: 初回と同じseed購入許可状態の承認額を欠損等へ変えた旧JSONをメモリストレージに置き、openStoreが承認額エラーで拒否することを確認。v1原文一致、v2無し、setItem呼出0、元オブジェクトdeepEqualを検証した。route無しの旧transitionへ9万9999円の実績を直接渡しても拒否され、元オブジェクト不変。
- **再現B**: 新規購入2万円をreview→approveで実績工程へ進め、承認額を欠損等へ変えたv2 JSONを用意。openStoreが拒否し、v2原文一致、write=0を確認。読込みを迂回したapplyActionの9万9999円actualも拒否、元レコードdeepEqual。
- A/Bの各10値はundefined/null/NaN/±Infinity/数値文字列/0/負数/小数/上限超過。NaN等のJSON化によるnullと、直接遷移入力の非数を区別して検証した。
- **メタデータ・矛盾11例**: actualRegistered、route.version/patternId/name、contentVersion/requestedAmount欠損、負のrevision、実績工程で実績登録済み、工程に不一致のdone/accounting、範囲外stepIndexを独立に作り、読込みとactual遷移の双方で拒否・原文/元オブジェクト保全を確認した。
- **正常9経路**: 新ルートと旧移行ルートそれぞれで、承認2万円に対して1.9万/2万/2.5万円のactualを登録し、毎操作save→openStoreを実施。2.5万円は正しい再確認/再承認、他は直接精算工程へ進む。さらに経理差戻し→購入済み再申請→再承認→完了を確認し、actualRegistered/purchaseActualを維持。旧v1原文も一致。これにroute無し旧transitionの同じ3金額の正常完了を加え、計9経路を検証した。
- **不正save**: 正常に開いたstoreの保存候補だけから承認額を削除。saveが拒否し、保存原文、store.state、write回数0を確認した。

### 修正の評価と未確認範囲

`validateRequestProgress`に、工程に応じた有効な承認額、版・ルート識別、実績フラグと状態の整合が集約された。旧移行、v2の読込み/save、ルート付き遷移の前後、旧入力の事前検証へ適用され、初回のundefined比較へ到達する前に拒否する。承認前の欠損は正常として許し、承認額以下の実績登録でcontentVersionが増えてもapprovedVersionとの完全一致を強制しない。今回要求の正常互換を誤拒否しないことを上記操作で確かめた。

UI・配信・READMEの生バイトは初回レビュー対象と同一であり、共通検証後の正常操作・保存・再読込みを独立メモリ検証で確認できたため、今回はブラウザーを再起動せず、初回PC/390px描画・実操作の証拠を引き継ぐ。今回新しく実ブラウザー操作を行ったとは記載しない。初回の未確認範囲（実機・社内Wi-Fi・本番認証/共有・実データ・顧客操作等）は引き続き未確認・対象外。

新たな必須修正は確認しなかった。PMへ最新対象版とPASSを返し、受入と正本の更新はPMが行う。本レビュー文書への追記以外の編集、修正代行、他worker起動、外部書込み、commit/push/deployは行っていない。

追記後の最終照合（2026-11-18T19:09:13.845+09:00）でも、他41ファイルのmanifestは `79a6015d9565822a055d0b56da9c85dfc63aa05af37bd4b21dbede23618c2678` と一致し、初回FIX_REQUIREDと最新PASSの双方を保持したことを確認した。
