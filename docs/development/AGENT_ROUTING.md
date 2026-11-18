# 開発アプリと役割の切替

役割の責任は固定し、実行する開発アプリだけを切り替える。現在の正本は `.tss-dev-os/routing.json` とする。

## 標準プロファイル

| プロファイル | PM | ORCHESTRATOR | IMPLEMENTER | REVIEWER | QUESTION |
|---|---|---|---|---|---|
| `codex` | Codex | Codex | Codex | Codex | Codex |
| `claude-code` | Claude Code | Claude Code | Claude Code | Claude Code | Claude Code |
| `hybrid` | Codex | Claude Code | Claude Code | Codex | Claude Code |
| `custom` | 役割ごとの指定に従う | 役割ごとの指定に従う | 役割ごとの指定に従う | 役割ごとの指定に従う | 役割ごとの指定に従う |

### 予備の担当アプリ（antigravity）

- 役割ごとの指定で、担当アプリとして`antigravity`（Antigravity CLI）を指定できる（例: `--pm antigravity`、`--orchestrator antigravity`）。
- 位置づけは、トークン切れ時の予備（サブ）である。標準プロファイルには含まれない。
- Antigravity CLIがルートの`AGENTS.md`を読み、読み順とPMの境界を正しく回答することを実測で確認した（2026-10-12）。

## 切替コマンド

```sh
# 全役をClaude Codeへ
tss-dev-os route . --profile claude-code

# 全役をCodexへ
tss-dev-os route . --profile codex

# 標準ハイブリッド
tss-dev-os route . --profile hybrid

# 役割ごとに指定
tss-dev-os route . --pm codex --implementer claude-code --reviewer codex --question claude-code

# 司令塔の担当を指定
tss-dev-os route . --orchestrator claude-code

# 予備としてAntigravity CLIを指定
tss-dev-os route . --orchestrator antigravity

# 現在の設定を表示
tss-dev-os route . --show
```

## 運用原則

- 開発アプリを変えても、PROJECT / ARCHITECTURE / DECISIONS / TASKSを引き継ぐ
- 会話履歴のコピーではなく、正本文書とGit差分で引き継ぐ
- 単純な作業では役割をすべて起動しない
- コード変更には独立REVIEWERを割り当てる
- 異なる開発アプリ間では、`HANDOFF_TEMPLATE.md`を使って目的、差分、検証結果を渡す
- 担当外の開発アプリは実装を代行せず、引継ぎを準備する

## アダプター

- Codexはルートの`AGENTS.md`を読む
- Claude Codeを1役でも選ぶと、`CLAUDE.md`と`.claude/agents/`が安全に追加される
- 既存のClaude Code設定がある場合は上書きせず、管理区画の追記または競合候補の保存を行う

## Orca管理下での引き継ぎ

Orcaが管理するセッション・worktreeで動作している場合、別の開発アプリ（例: CodexとClaude Code間）への引き継ぎ依頼を受けたら、担当アプリに関わらず次の手順で対応する。

- まずOrca CLIの最新ガイド（例: `orca skills get orca-cli`など、実際にそのセッションで使えるコマンド）を取得する。サブコマンドはバージョンにより変わるため、記憶や推測で決め打ちしない。
- 実行前に `.tss-dev-os/routing.json` を確認し、引き継ぎ依頼が指す役割・対象を取り違えない。
- ガイドで判明した経路（別worktreeの作成、別アプリへのタスク送信等）を実行し、成功・失敗と取得できた識別子を人間へ報告する。
- Orca CLIが使えない、または実行に失敗した場合は、別経路（上記の切替コマンド、`HANDOFF_TEMPLATE.md`を使った引継ぎ文の作成など）へ自分で切り替えず停止する。実際に発生したエラー内容と復旧に必要な対応をそのまま代表へ報告し、選択肢（Orca CLIの復旧を待つ、代表が別の経路を選ぶ等）を示す。「できません」だけで終わらせない。
- Orca管理下でない場合はこの手順を省略し、上記の切替コマンドと引継ぎ文書による経路のみを使う。

### 利用枠が不足した場合の標準手順（Orca管理下）

1. Orcaに使用量表示がある場合はそれで利用枠を確認する（有無は実際のガイドや実行結果で確認する）。
2. 必要なら別Agentへ引継ぐ。予備として`antigravity`を指定できる。
3. 必要なら`route`で担当を変更する。
4. 正本（`STATUS.md`等）と引継ぎ文に記録する。

自動切替の実装や、Orcaに無い機能の存在は前提にしない。機能の有無は実際のガイドや実行結果で確認する。

## 担当切替時の継承

- 切替前にPMが`STATUS.md`を更新してコミットする（未コミットは新しいworktreeに届かない）。
- 引継ぎ文には次を含める: (a)役割とrouting (b)進行中タスクと状態 (c)有効な承認条件 (d)正本に未記録の判断 (e)調査済み事項
- 受け手は`STATUS.md`・`TASKS.md`の該当節・Git差分と照合してから再開し、同じ調査を繰り返さない。
- 引継ぎ機能（Orcaに要約引継ぎがある場合のそれ等。有無は実際のガイドで確認する）は文脈の要約であり正本ではない。正本に残すべき事実は文書に書く。

## 拡張性・保守性の原則

実行環境（Orca等）やAI実行エンジンが変わっても、役割・判断・記録の規則を変えずに済むようにするための原則。

### 標準機能を先に使う

- 引継ぎ、worktree分離、利用量の確認、エージェントの起動・切替など、Orcaが標準機能として提供する操作は、独自の仕組みを作る前に、そのセッションで実際に使えるか確認して使う。
- 機能の有無はOrca CLIのガイドや実行結果で確認し、記憶や推測で「ある」「ない」を決めない。将来追加されるかもしれない機能を現在の事実として扱わない。
- 標準機能で足りない部分だけを独自に補う。依頼のない利用量監視・自動切替・自動引継ぎは、新規に実装しない。

### 実行環境固有の操作と開発OSの規則を分ける

| 区分 | 内容 | 変更の扱い |
|---|---|---|
| 開発OS固有の規則 | 役割（PM / ORCHESTRATOR / IMPLEMENTER / REVIEWER / QUESTION）の責任、現行の承認境界（`DEVELOPMENT_OS.md`の「権限の境界」）、PROJECT / ARCHITECTURE / DECISIONS / TASKSによる正本管理。導入先に専門家や承認Gateの定義がある場合は、それらも同様に扱う | 実行環境やAI実行エンジンの変更を理由に変えない。変更は人間の決裁と`DECISIONS.md`への記録を要する |
| 実行環境固有の操作 | Orca CLIによるworktree作成・別アプリへのタスク送信など、特定の製品の機能で実現する操作 | 標準機能が増えたり変わったりしたら、規則を変えずにこの部分だけを差し替える |

- 役割・専門家・承認基準そのものは、特定のCLIやAIプロバイダーに依存した定義にしない。routingの例や実行環境固有の操作（本書の「Orca管理下での引き継ぎ」など）で製品名を挙げることは妨げない。
- 担当アプリは `.tss-dev-os/routing.json` で切り替える。切り替えても、役割の責任と承認が必要な判断の基準は変わらない（導入先に専門家や承認Gateの定義があれば、それも変わらない）。
- 実行環境の機能で引継ぎや切替を行っても、正本文書への記録と独立レビューを省略しない。
