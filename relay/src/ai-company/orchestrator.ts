import { AGENTS, AGENT_MAP } from "./agents.js";
import { runClaudeCode } from "./claude.js";
import type { ClaudeOptions } from "./claude.js";
import { messageStore } from "./messageStore.js";
import { generateProjectContext, getProjectRoot } from "./projectContext.js";
import { createUserTasks } from "./supabasePersist.js";
import { autonomousQueue } from "./autonomousQueue.js";
import type { AgentDef, AgentGroup, OrchestrateEvent } from "./types.js";

// ---------- Per-agent tool sets ----------

// Google Workspace MCP tools (gws-workspace MCP server)
const GWS_MCP_TOOLS = [
  // Gmail
  "mcp__gws-workspace__gmail_users_messages_list",
  "mcp__gws-workspace__gmail_users_messages_get",
  "mcp__gws-workspace__gmail_users_messages_send",
  "mcp__gws-workspace__gmail_users_drafts_create",
  "mcp__gws-workspace__gmail_users_drafts_send",
  "mcp__gws-workspace__gmail_users_labels_list",
  // Calendar
  "mcp__gws-workspace__calendar_events_list",
  "mcp__gws-workspace__calendar_events_get",
  "mcp__gws-workspace__calendar_events_insert",
  "mcp__gws-workspace__calendar_events_update",
  "mcp__gws-workspace__calendar_events_delete",
  "mcp__gws-workspace__calendar_calendarList_list",
  // Drive
  "mcp__gws-workspace__drive_files_list",
  "mcp__gws-workspace__drive_files_get",
  "mcp__gws-workspace__drive_files_create",
  // Docs
  "mcp__gws-workspace__docs_documents_get",
  "mcp__gws-workspace__docs_documents_create",
  "mcp__gws-workspace__docs_documents_batchUpdate",
  // Sheets
  "mcp__gws-workspace__sheets_spreadsheets_get",
  "mcp__gws-workspace__sheets_spreadsheets_create",
  "mcp__gws-workspace__sheets_spreadsheets_values_get",
  "mcp__gws-workspace__sheets_spreadsheets_values_update",
  "mcp__gws-workspace__sheets_spreadsheets_values_append",
];

const DEV_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(pnpm build)",
  "Bash(pnpm lint)",
  "Bash(ls *)",
  ...GWS_MCP_TOOLS,
];

const CONTENT_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(ls *)",
  ...GWS_MCP_TOOLS,
];
const READONLY_TOOLS = ["Read", "Glob", "Grep", "Bash(ls *)", ...GWS_MCP_TOOLS];

const AGENT_TOOLS: Record<string, string[]> = {
  // Executive
  ceo: READONLY_TOOLS,
  coo: READONLY_TOOLS,
  cto: DEV_TOOLS,
  // Product
  "product-mgr": CONTENT_TOOLS,
  "ux-researcher": CONTENT_TOOLS,
  "biz-analyst": CONTENT_TOOLS,
  // Tech
  pm: DEV_TOOLS,
  "lead-eng": DEV_TOOLS,
  frontend: DEV_TOOLS,
  backend: DEV_TOOLS,
  infra: DEV_TOOLS,
  qa: DEV_TOOLS,
  "data-eng": DEV_TOOLS,
  mobile: DEV_TOOLS,
  // Design
  "ui-designer": CONTENT_TOOLS,
  "graphic-designer": CONTENT_TOOLS,
  // Sales
  "sales-mgr": CONTENT_TOOLS,
  "inside-sales": CONTENT_TOOLS,
  "customer-success": CONTENT_TOOLS,
  // Marketing
  "pr-manager": CONTENT_TOOLS,
  writer: CONTENT_TOOLS,
  sns: CONTENT_TOOLS,
  seo: CONTENT_TOOLS,
  // HR
  "hr-mgr": CONTENT_TOOLS,
  recruiter: CONTENT_TOOLS,
  // Legal
  "legal-counsel": READONLY_TOOLS,
  compliance: READONLY_TOOLS,
  // Operations
  accountant: READONLY_TOOLS,
  general: CONTENT_TOOLS,
  "it-admin": DEV_TOOLS,
  // Support
  "cs-leader": CONTENT_TOOLS,
  "tech-support": DEV_TOOLS,
};

export function getAgentTools(agentId: string): string[] {
  return AGENT_TOOLS[agentId] ?? READONLY_TOOLS;
}

// ---------- Role instructions ----------

const roleInstructions: Record<string, string> = {
  // Executive
  ceo: `あなたはCEOとして、会社全体の戦略的意思決定を行ってください。
- ビジョンと中長期戦略の策定
- 経営判断と優先順位の決定
- 各部門の成果確認と方針指示`,
  coo: `あなたはCOOとして、会社全体のオペレーションを統括し、品質監督を行ってください。
- 部門間の連携とプロセス最適化
- KPI管理と業務効率化の推進
- リソース配分と組織運営の改善
- **品質監督**: 各メンバーの成果物が指示に沿っているか厳しくレビューする
- 的外れな回答、手抜き、エラー放置は即座に指摘し、具体的な改善指示を出す
- 品質基準を満たさない成果物は容赦なくやり直しを命じる`,
  cto: `あなたはCTOとして、技術戦略と技術組織を統括してください。
- 技術ロードマップの策定
- アーキテクチャの最終判断
- 技術的負債の管理と技術選定`,
  // Product
  "product-mgr": `あなたはプロダクトマネージャーとして、プロダクト開発を推進してください。
- ロードマップの策定と優先順位付け
- ユーザー要件の整理とストーリー作成
- ステークホルダー間の調整`,
  "ux-researcher": `あなたはUXリサーチャーとして、ユーザー理解を深めてください。
- ユーザーインタビューとユーザビリティテストの設計
- データ分析に基づくインサイト抽出
- ペルソナ・カスタマージャーニーの作成`,
  "biz-analyst": `あなたはビジネスアナリストとして、ビジネス要件を分析してください。
- ビジネス要件の定義とドキュメント化
- KPI設計と効果測定
- 市場調査と競合分析`,
  // Tech
  pm: `あなたはPMとして、タスクを分析し実行計画を立ててください。
- タスクの内容を把握し、必要なアクションを具体的に示す
- 担当エージェントへの割り振りを明示
- 優先順位を決定
- 開発タスクの場合: どのファイルを変更/作成すべきか具体的に指示
- 非開発タスクの場合: 成果物と品質基準を明確化`,
  "lead-eng": `あなたはリードエンジニアとして、技術的な判断と品質管理を行ってください。
- 既存のパターンと一貫性を保つ
- 型安全性を確保
- lib/配下のビジネスロジックを担当
- 技術的な観点からの分析・アドバイスも提供`,
  frontend: `あなたはフロントエンドエンジニアとして、UI/UXに関する作業を担当してください。
- components/配下のファイルを作成・編集
- TailwindCSSでスタイリング
- レスポンシブ対応を意識
- デザイン・ビジュアル面からの提案も可能`,
  backend: `あなたはバックエンドエンジニアとして、APIとビジネスロジックを担当してください。
- app/api/配下のAPI routeを作成・編集
- lib/配下のロジックを作成・編集
- 型定義はlib/types.tsに追加
- データ分析・システム設計の観点からもサポート`,
  infra: `あなたはインフラエンジニアとして、設定やデプロイ関連を担当してください。
- package.json の依存関係管理
- middleware.ts の設定
- ビルド・デプロイの確認
- システム構成・運用面からのアドバイスも提供`,
  qa: `あなたはQAエンジニアとして、品質保証を担当してください。
- テスト計画の策定とテストケースの設計
- テスト自動化の推進
- バグ報告と再現手順の整理
- 品質メトリクスの管理`,
  "data-eng": `あなたはデータエンジニアとして、データ基盤を担当してください。
- データパイプラインの設計と構築
- ETL処理の最適化
- データベース設計とクエリ最適化
- データ品質の管理と監視`,
  mobile: `あなたはモバイルエンジニアとして、モバイルアプリ開発を担当してください。
- React Native/Flutterによるクロスプラットフォーム開発
- モバイルUXの最適化
- パフォーマンスチューニング
- アプリストア申請と配信管理`,
  // Design
  "ui-designer": `あなたはUI/UXデザイナーとして、ユーザーインターフェース設計を担当してください。
- ワイヤーフレーム・モックアップの作成
- デザインシステムの構築と管理
- ユーザビリティの最適化
- アクセシビリティ対応`,
  "graphic-designer": `あなたはグラフィックデザイナーとして、ビジュアル制作を担当してください。
- ブランドアイデンティティのデザイン
- マーケティング素材の制作
- イラスト・アイコンの作成
- 印刷物とデジタルコンテンツの制作`,
  // Sales
  "sales-mgr": `あなたは営業マネージャーとして、営業戦略を推進してください。
- 営業戦略の立案と実行管理
- パイプライン管理と売上予測
- 大型案件の交渉とクロージング
- チームの目標管理とコーチング`,
  "inside-sales": `あなたはインサイドセールスとして、見込み顧客の開拓を担当してください。
- リード獲得とナーチャリング
- 商談設定と初期提案
- CRMデータの管理と分析
- セールスプロセスの効率化`,
  "customer-success": `あなたはカスタマーサクセスとして、顧客の成功を支援してください。
- オンボーディングプログラムの設計と実施
- 顧客のヘルススコア管理
- アップセル・クロスセルの提案
- チャーンの予防と対策`,
  // Marketing
  "pr-manager": `あなたは広報マネージャーとして、対外コミュニケーション全般を担当してください。
- プレスリリースやお知らせ文の作成・編集
- ブランドガイドラインに沿ったコンテンツ確認
- 社外向けコミュニケーション戦略の立案
- 企画書・提案書の作成サポート`,
  writer: `あなたはコンテンツライターとして、あらゆる文章作成を担当してください。
- ブログ記事、技術記事のドラフト作成・編集
- SEOを意識したコンテンツ最適化
- docs/配下のドキュメント整備
- レポート・企画書・マニュアル等の文書作成`,
  sns: `あなたはSNS担当として、ソーシャルメディア・マーケティングを担当してください。
- SNS投稿コンテンツの企画・作成
- エンゲージメント向上のための戦略提案
- トレンド分析とコンテンツ提案
- マーケティング施策の企画・分析`,
  seo: `あなたはSEOスペシャリストとして、検索エンジン最適化を担当してください。
- キーワード調査と戦略策定
- コンテンツSEOの改善提案
- テクニカルSEOの分析と改善
- 検索パフォーマンスの分析とレポート`,
  // HR
  "hr-mgr": `あなたは人事マネージャーとして、人事戦略を推進してください。
- 人事制度の設計と運用
- 評価制度の運用と改善
- 組織開発と従業員エンゲージメント
- 労務管理とコンプライアンス`,
  recruiter: `あなたは採用担当として、人材獲得を推進してください。
- 採用戦略の立案と実行
- 求人票の作成と採用チャネルの管理
- 面接プロセスの設計と候補者対応
- 採用ブランディングの推進`,
  // Legal
  "legal-counsel": `あなたは法務担当として、法的リスク管理を行ってください。
- 契約書のレビューと作成
- 知的財産権の管理
- 法的リスクの評価と対策
- 規制対応とコンプライアンス支援`,
  compliance: `あなたはコンプライアンス担当として、法令遵守を推進してください。
- 社内規程の整備と運用
- コンプライアンス研修の企画
- 内部統制の構築と監査対応
- 個人情報保護・セキュリティ規格対応`,
  // Operations
  accountant: `あなたは経理担当として、数値分析・コスト管理を担当してください。
- プロジェクトのコスト分析
- リソース最適化の提案
- 予算関連のレポート作成
- データに基づいた意思決定のサポート`,
  general: `あなたは総務担当として、組織運営・プロセス改善を担当してください。
- 社内ワークフローの改善提案
- チーム間の連携促進
- 業務効率化のための仕組み作り
- タスク整理・議事録・社内文書の作成`,
  "it-admin": `あなたは情報システム担当として、社内IT環境を管理してください。
- 社内システムの構築と運用
- セキュリティポリシーの策定と運用
- SaaS/ツールの選定と管理
- 社内DXの推進と技術サポート`,
  // Support
  "cs-leader": `あなたはカスタマーサポートリーダーとして、顧客対応を統括してください。
- サポートチームの運営と品質管理
- 問い合わせ対応プロセスの最適化
- FAQ・ヘルプドキュメントの整備
- 顧客の声の収集とフィードバック`,
  "tech-support": `あなたはテクニカルサポートとして、技術的な顧客支援を行ってください。
- 技術的な問い合わせの調査と解決
- 障害対応とエスカレーション
- ログ解析とトラブルシューティング
- 技術ドキュメントの作成と更新`,
};

// ---------- System prompt builders ----------

function buildSystemPrompt(agent: AgentDef): string {
  const recentMessages = messageStore
    .getAgentMessages(agent.id, 15)
    .map(
      (m) =>
        `[${AGENT_MAP.get(m.fromAgentId)?.name ?? m.fromAgentId}→${
          m.toAgentId === "all"
            ? "全員"
            : (AGENT_MAP.get(m.toAgentId)?.name ?? m.toAgentId)
        }] ${m.content}`,
    )
    .join("\n");

  const teamMembers = AGENTS.filter(
    (a) => a.group === agent.group && a.id !== agent.id,
  )
    .map((a) => `- ${a.name}（${a.role}）`)
    .join("\n");

  return buildTaskPrompt(agent, teamMembers, recentMessages);
}

function buildTaskPrompt(
  agent: AgentDef,
  teamMembers: string,
  recentMessages: string,
): string {
  const projectContext = generateProjectContext();
  const projectRoot = getProjectRoot();

  const role =
    roleInstructions[agent.id] ??
    "あなたの専門知識でタスクに貢献してください。";

  const toolDesc = `全ツール（Read, Edit, Write, Glob, Grep, Bash, Agent, WebSearch, WebFetch等）を使用可能です。
Bashで gh, vercel, git, pnpm 等のCLIコマンドも実行できます。
Google Workspace MCPツール（Gmail, Calendar, Drive, Docs, Sheets）も使用可能です。
新規プロジェクトは /tmp/ai-company-projects/ 配下に作成してください。`;

  const rules = `## 基本ルール
- タスクの内容を正確に理解してから行動すること
- 成果を簡潔に報告すること（何をしたか、なぜしたか）
- 不要なファイルは作らない
- 1つのタスクに集中し、成果物を小さく保つ
- 既存のコードパターンを読んでから変更すること
- TypeScript strict mode準拠
- 変更後はビルドで確認`;

  return `${agent.systemPrompt}

## タスクモード
あなたはAI仮想会社の社員として、チームと協力してタスクに取り組みます。
${toolDesc}

### あなたの役割
${role}

### プロジェクト情報
プロジェクトルート: ${projectRoot}
${projectContext}

## チームメンバー
${teamMembers}

## 最近のやり取り
${recentMessages || "（まだやり取りはありません）"}

${rules}`;
}

// ---------- Agent runner ----------

async function runAgent(
  agent: AgentDef,
  task: string,
  onEvent: (event: OrchestrateEvent) => void,
): Promise<string> {
  const emit = (event: OrchestrateEvent) => {
    messageStore.addEvent(event);
    onEvent(event);
  };

  messageStore.setAgentStatus(agent.id, "thinking", task);
  emit({
    type: "agent-start",
    agentId: agent.id,
    content: `${agent.name}（${agent.role}）が作業中...`,
    timestamp: Date.now(),
  });

  messageStore.addTerminalLine(agent.id, `$ task: "${task}"`, "input");
  messageStore.addTerminalLine(
    agent.id,
    "[FULL MODE] 全ツール使用可能",
    "system",
  );

  const systemPrompt = buildSystemPrompt(agent);

  const hubDir =
    process.env.AI_COMPANY_CWD || process.env.ALLOWED_DIR || process.cwd();
  const projectsDir = "/tmp/ai-company-projects";

  const options: ClaudeOptions = {
    // No allowedTools — all tools available via --dangerously-skip-permissions
    cwd: hubDir,
    addDirs: [hubDir, projectsDir],
    timeout: 600_000,
  };

  try {
    const result = await runClaudeCode(systemPrompt, task, options);

    const chunks = result.match(/.{1,40}/g) ?? [result];
    for (const chunk of chunks) {
      emit({
        type: "agent-output",
        agentId: agent.id,
        content: chunk,
        timestamp: Date.now(),
      });
    }

    for (const line of result.split("\n")) {
      messageStore.addTerminalLine(agent.id, line, "output");
    }
    messageStore.setAgentStatus(agent.id, "idle");

    emit({
      type: "agent-done",
      agentId: agent.id,
      content: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    messageStore.addTerminalLine(agent.id, `ERROR: ${errMsg}`, "error");
    messageStore.setAgentStatus(agent.id, "idle");

    emit({
      type: "error",
      agentId: agent.id,
      content: errMsg,
      timestamp: Date.now(),
    });

    return `[ERROR] ${errMsg}`;
  }
}

// ---------- User task extraction ----------

/** Extract user_tasks JSON from agent output and create tasks in AI Tasks list */
async function extractAndCreateUserTasks(
  text: string,
  onEvent: (event: OrchestrateEvent) => void,
): Promise<void> {
  const hasKeyword = text.includes("user_tasks");
  const match = text.match(/```user_tasks\s*\n([\s\S]*?)\n\s*```/);

  if (hasKeyword && !match) {
    console.warn(
      "[user_tasks] Keyword found but regex failed. Text around keyword:",
      text.substring(
        Math.max(0, text.indexOf("user_tasks") - 20),
        text.indexOf("user_tasks") + 80,
      ),
    );
    return;
  }
  if (!match) return;

  try {
    const tasks = JSON.parse(match[1]) as {
      title: string;
      notes?: string;
      due_date?: string;
    }[];
    if (tasks.length > 0) {
      console.log(
        `[user_tasks] Extracted ${tasks.length} task(s):`,
        tasks.map((t) => t.title).join(", "),
      );
      const created = await createUserTasks(tasks);
      console.log(`[user_tasks] Created ${created}/${tasks.length} in DB`);
      if (created > 0) {
        onEvent({
          type: "message",
          agentId: "system",
          content: `${created}件のタスクをAI Tasksリストに追加しました。`,
          timestamp: Date.now(),
        });
      }
    }
  } catch (e) {
    console.error("[user_tasks] JSON parse failed:", (e as Error).message);
    console.error("[user_tasks] Raw match:", match[1]?.slice(0, 200));
  }
}

/** Extract agent_tasks JSON and enqueue as autonomous follow-up tasks */
async function extractAndEnqueueAgentTasks(
  text: string,
  depth: number,
  sourceAgentId: string,
  onEvent: (event: OrchestrateEvent) => void,
): Promise<void> {
  if (depth >= autonomousQueue.maxDepth) return;

  const match = text.match(/```agent_tasks\s*\n([\s\S]*?)\n\s*```/);
  if (!match) return;

  try {
    const tasks = JSON.parse(match[1]) as {
      title: string;
      description?: string;
      targetGroup?: AgentGroup;
      priority?: string;
      delay_minutes?: number;
    }[];

    for (const t of tasks) {
      const id = autonomousQueue.enqueue({
        title: t.title,
        description: t.description ?? t.title,
        targetGroup: t.targetGroup,
        priority: (t.priority as "high" | "medium" | "low") ?? "medium",
        depth: depth + 1,
        sourceAgentId,
        delayUntil: Date.now() + (t.delay_minutes ?? 0) * 60_000,
      });
      if (id) {
        onEvent({
          type: "autonomous-task-queued",
          agentId: "system",
          content: `自律タスクをキューに追加: ${t.title}`,
          timestamp: Date.now(),
          metadata: { autonomousTaskId: id, depth: depth + 1 },
        });
      }
    }
  } catch {
    // JSON parse failed — skip
  }
}

// ---------- Orchestration ----------

/** Check if PM plan contains high-risk operations requiring approval */
function requiresApproval(text: string): boolean {
  const HIGH_RISK_PATTERNS = [
    /git\s+(push|init|remote)/i,
    /gh\s+(repo\s+create|pr\s+create)/i,
    /vercel\s+(deploy|--prod)/i,
    /npm\s+publish/i,
    /リポジトリ.*作成|レポジトリ.*作成/,
    /デプロイ|公開|本番/,
    /新規プロジェクト.*作成/,
    /外部.*API.*キー/,
    /課金|billing/i,
    /delete.*repo|rm\s+-rf/i,
  ];
  return HIGH_RISK_PATTERNS.some((re) => re.test(text));
}

export async function orchestrate(
  task: string,
  targetGroup: AgentGroup | undefined,
  onEvent: (event: OrchestrateEvent) => void,
  requestApproval?: (plan: string) => Promise<boolean>,
  requestAnswer?: (question: string, agentId: string) => Promise<string>,
  depth = 0,
): Promise<void> {
  const pm = AGENT_MAP.get("pm");
  if (!pm) throw new Error("PM agent definition not found");

  // Step 1: PM analyzes the task — decides direct answer or delegation
  messageStore.addMessage({
    fromAgentId: "system",
    toAgentId: "pm",
    content: `[タスク] ${task}`,
    type: "task",
  });

  const pmPrompt = `以下のタスクを分析してください。

## 判断基準
- 質問・相談・情報確認など、あなた（PM）だけで回答できる場合 → 回答の冒頭に [DIRECT] と書いて、そのまま回答してください。他のメンバーは動かしません。
- 実作業（開発・文章作成・分析など）が必要で、他メンバーの専門性が必要な場合 → 回答の冒頭に [DELEGATE] と書いて、実行計画と担当者を示してください。
- タスクの意図・詳細が不明確で、正確に実行するためにユーザー（社長）への確認が必要な場合 → 回答の冒頭に [QUESTION] と書いて、ユーザーへの質問内容を簡潔に記述してください。ユーザーにpush通知が送信され、回答を待ちます。

## 能力
あなたのチームは以下の高度な操作も実行可能です（ユーザーの承認後に実行）：
- 新規ディレクトリ/プロジェクトの作成（/tmp/ai-company-projects/配下）
- GitHubリポジトリの作成・プッシュ（gh CLI）
- Vercelへのデプロイ（vercel CLI）
- 任意のBashコマンド実行
- MCP経由の外部サービス連携

## ユーザーへのタスク出力（重要）
作業の結果、ユーザー（社長）に対して以下のいずれかに該当する事項があれば、必ず回答の最後にJSON形式で出力してください。
- コード変更のレビュー・動作確認
- 環境変数やシークレットの設定
- 外部サービスでの手動操作
- デプロイ後の動作テスト
- 設計・方針についての意思決定
- 今後のスケジュールに関する確認

該当が1つもない場合のみ省略可。迷ったら出力してください。
\`\`\`user_tasks
[{"title": "タスクタイトル", "notes": "詳細説明", "due_date": "2026-03-22"}]
\`\`\`
${
  depth < autonomousQueue.maxDepth
    ? `
## エージェント自律タスク
この作業の結果、エージェントチームが後で自律的に実行すべきフォローアップタスクがある場合は、以下のJSON形式で出力してください。不要なら出力不要です。
\`\`\`agent_tasks
[{"title": "タスク名", "description": "詳細指示", "targetGroup": "tech", "priority": "medium", "delay_minutes": 0}]
\`\`\`
targetGroup: executive|product|tech|design|sales|marketing|hr|legal|operations|support
priority: high|medium|low
delay_minutes: 実行を遅延させる分数（0=即実行）
`
    : ""
}
## タスク
${task}`;

  const pmResponse = await runAgent(pm, pmPrompt, onEvent);

  const isDirect = pmResponse.trimStart().startsWith("[DIRECT]");
  const isQuestion = pmResponse.trimStart().startsWith("[QUESTION]");
  const pmPlan = pmResponse.replace(
    /^\[(?:DIRECT|DELEGATE|QUESTION)\]\s*/m,
    "",
  );

  messageStore.addMessage({
    fromAgentId: "pm",
    toAgentId: "all",
    content: pmPlan,
    type: isDirect ? "report" : isQuestion ? "chat" : "task",
  });

  // [QUESTION] flow: ask user for clarification, send push, wait for answer
  if (isQuestion && requestAnswer) {
    const answer = await requestAnswer(pmPlan, "pm");
    // Re-run orchestration with the answer as additional context
    const enrichedTask = `${task}\n\n【ユーザーからの追加情報】\n${answer}`;
    return orchestrate(
      enrichedTask,
      targetGroup,
      onEvent,
      requestApproval,
      requestAnswer,
      depth,
    );
  }

  if (isDirect) {
    // Extract user tasks and agent tasks from direct responses
    await extractAndCreateUserTasks(pmPlan, onEvent);
    await extractAndEnqueueAgentTasks(pmPlan, depth, "pm", onEvent);

    const completeEvent: OrchestrateEvent = {
      type: "task-complete",
      agentId: "pm",
      content: pmPlan,
      timestamp: Date.now(),
    };
    messageStore.addEvent(completeEvent);
    onEvent(completeEvent);
    return;
  }

  // Step 1.5: Approval gate for high-risk operations
  if (requestApproval && requiresApproval(pmPlan + " " + task)) {
    const approved = await requestApproval(pmPlan);
    if (!approved) {
      const cancelEvent: OrchestrateEvent = {
        type: "task-complete",
        agentId: "pm",
        content: "ユーザーにより実行がキャンセルされました。",
        timestamp: Date.now(),
      };
      messageStore.addEvent(cancelEvent);
      onEvent(cancelEvent);
      return;
    }
    onEvent({
      type: "message",
      agentId: "system",
      content: "承認されました。実行を開始します。",
      timestamp: Date.now(),
    });
  }

  // Step 2: Determine relevant agents
  const targetAgents = targetGroup
    ? AGENTS.filter((a) => a.group === targetGroup && a.id !== "pm")
    : selectAgents(task, pmPlan);

  // Step 3: Run agents in parallel
  const agentResults: Record<string, string> = {};
  await Promise.all(
    targetAgents.map(async (agent) => {
      const result = await runAgent(
        agent,
        `PMの計画:\n${pmPlan}\n\n元タスク: ${task}\n\nあなたの担当範囲を実行してください。`,
        onEvent,
      );
      agentResults[agent.id] = result;
      messageStore.addMessage({
        fromAgentId: agent.id,
        toAgentId: "pm",
        content: result,
        type: "report",
      });
    }),
  );

  // Step 3.5: COO quality review — flag bad outputs and retry once
  const coo = AGENT_MAP.get("coo");
  if (coo && targetAgents.length > 0) {
    const reviewSummary = targetAgents
      .map(
        (a) =>
          `### ${a.name}（${a.role}）\n${(agentResults[a.id] ?? "").slice(0, 600)}`,
      )
      .join("\n\n");

    const reviewPrompt = `あなたはCOOとして、以下のメンバーのタスク成果物を品質レビューしてください。

## 元タスク
${task}

## PMの計画
${pmPlan}

## メンバーの成果物
${reviewSummary}

## レビュー指示
各メンバーの成果物を確認し、以下の基準で判定してください：
- タスクの指示に沿った内容か
- 明らかに的外れ、不十分、またはエラーを含んでいないか
- 成果物として最低限の品質を満たしているか

問題があるメンバーがいる場合のみ、以下のJSON形式で回答してください：
\`\`\`json
{"retries":[{"agentId":"エージェントID","reason":"やり直しの理由と具体的な指示"}]}
\`\`\`

全員問題なければ：
\`\`\`json
{"retries":[]}
\`\`\``;

    const reviewResult = await runAgent(coo, reviewPrompt, onEvent);

    // Parse COO's review and retry flagged agents
    const jsonMatch = reviewResult.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const review = JSON.parse(jsonMatch[1].trim()) as {
          retries: { agentId: string; reason: string }[];
        };
        if (review.retries.length > 0) {
          messageStore.addMessage({
            fromAgentId: "coo",
            toAgentId: "all",
            content: `品質レビューで${review.retries.length}件の再実行を指示しました。`,
            type: "task",
          });

          // Retry flagged agents (max 1 retry each)
          await Promise.all(
            review.retries.map(async ({ agentId, reason }) => {
              const agent = AGENT_MAP.get(agentId);
              if (!agent) return;
              const retryPrompt = `COO（西田 恵美）からの品質レビューで、あなたの成果物にやり直し指示が出ました。

## やり直し理由
${reason}

## 元タスク
${task}

## PMの計画
${pmPlan}

前回の成果物の問題を修正し、改善した成果物を提出してください。`;
              const retryResult = await runAgent(agent, retryPrompt, onEvent);
              agentResults[agentId] = retryResult;
              messageStore.addMessage({
                fromAgentId: agentId,
                toAgentId: "coo",
                content: retryResult,
                type: "report",
              });
            }),
          );
        }
      } catch {
        // JSON parse failed — skip retry
      }
    }
  }

  // Step 4: PM summarizes
  const summaryPrompt = `各メンバーの作業報告をまとめ、成果と現在の状態を報告してください。開発タスクの場合はビルドが通るか確認してください。

## 重要：ユーザーへのタスク出力
作業の結果を踏まえて、ユーザー（社長）に必要なアクションを必ずリストアップしてください。
以下の観点で網羅的に確認し、該当するものを全て出力すること：
- 変更されたコードのレビュー・テスト
- 新機能のUI確認・動作テスト
- 環境変数やシークレットの設定・更新
- 外部サービス（Vercel、GitHub等）での操作
- デザインや方針についての意思決定
- 今後のスケジュール調整

完全に確認不要な場合のみ省略可。

\`\`\`user_tasks
[{"title": "タスクタイトル", "notes": "詳細説明", "due_date": "YYYY-MM-DD"}]
\`\`\`
${
  depth < autonomousQueue.maxDepth
    ? `
## エージェント自律タスク
今回の作業を踏まえて、エージェントチームが今後自律的に実行すべきフォローアップタスクがあれば、以下のJSON形式で出力してください。
\`\`\`agent_tasks
[{"title": "タスク名", "description": "詳細指示", "targetGroup": "tech", "priority": "medium", "delay_minutes": 0}]
\`\`\``
    : ""
}`;

  const summary = await runAgent(pm, summaryPrompt, onEvent);

  await extractAndCreateUserTasks(summary, onEvent);
  await extractAndEnqueueAgentTasks(summary, depth, "pm", onEvent);

  // Clean task blocks from summary for display
  const cleanSummary = summary
    .replace(/```user_tasks\s*\n[\s\S]*?\n\s*```/g, "")
    .replace(/```agent_tasks\s*\n[\s\S]*?\n\s*```/g, "")
    .trim();

  messageStore.addMessage({
    fromAgentId: "pm",
    toAgentId: "all",
    content: cleanSummary,
    type: "report",
  });

  const completeEvent: OrchestrateEvent = {
    type: "task-complete",
    agentId: "pm",
    content: cleanSummary,
    timestamp: Date.now(),
  };
  messageStore.addEvent(completeEvent);
  onEvent(completeEvent);
}

// ---------- Agent selection ----------

function selectAgents(task: string, pmPlan: string): AgentDef[] {
  const combined = `${task} ${pmPlan}`.toLowerCase();
  const selected: AgentDef[] = [];

  const agentKeywords: Record<string, string[]> = {
    // Executive
    ceo: ["経営", "ビジョン", "戦略", "意思決定", "方針", "全社"],
    coo: ["オペレーション", "業務統括", "組織運営", "KPI"],
    cto: ["技術戦略", "R&D", "技術選定", "イノベーション"],
    // Product
    "product-mgr": [
      "ロードマップ",
      "プロダクト",
      "要件定義",
      "ユーザーストーリー",
      "優先順位",
    ],
    "ux-researcher": [
      "ユーザー調査",
      "インタビュー",
      "ユーザビリティ",
      "ペルソナ",
      "カスタマージャーニー",
    ],
    "biz-analyst": [
      "ビジネス分析",
      "KPI",
      "市場調査",
      "競合分析",
      "ビジネスモデル",
    ],
    // Tech
    "lead-eng": [
      "アーキテクチャ",
      "設計",
      "レビュー",
      "型定義",
      "types.ts",
      "リファクタ",
      "技術",
      "tech",
    ],
    frontend: [
      "UI",
      "コンポーネント",
      "ページ",
      "component",
      "デザイン",
      "表示",
      "画面",
      "フロント",
      "React",
      "UX",
    ],
    backend: [
      "API",
      "route",
      "ロジック",
      "lib/",
      "バックエンド",
      "データ",
      "ストア",
      "サーバー",
      "データベース",
    ],
    infra: [
      "デプロイ",
      "設定",
      "パッケージ",
      "ビルド",
      "middleware",
      "インフラ",
      "CI/CD",
      "Docker",
      "AWS",
    ],
    qa: ["テスト", "QA", "品質", "バグ", "自動テスト", "E2E", "ユニットテスト"],
    "data-eng": [
      "データパイプライン",
      "ETL",
      "データ基盤",
      "Spark",
      "BigQuery",
      "SQL最適化",
    ],
    mobile: [
      "モバイル",
      "アプリ",
      "iOS",
      "Android",
      "Flutter",
      "React Native",
      "ネイティブ",
    ],
    // Design
    "ui-designer": [
      "UIデザイン",
      "ワイヤーフレーム",
      "モックアップ",
      "Figma",
      "デザインシステム",
      "プロトタイプ",
    ],
    "graphic-designer": [
      "グラフィック",
      "ロゴ",
      "イラスト",
      "バナー",
      "ビジュアル",
      "ブランドデザイン",
    ],
    // Sales
    "sales-mgr": [
      "営業",
      "商談",
      "売上",
      "受注",
      "提案",
      "クロージング",
      "パイプライン",
    ],
    "inside-sales": [
      "リード",
      "ナーチャリング",
      "アポ",
      "商談設定",
      "CRM",
      "見込み客",
    ],
    "customer-success": [
      "カスタマーサクセス",
      "オンボーディング",
      "解約",
      "チャーン",
      "NPS",
      "定着",
    ],
    // Marketing
    "pr-manager": [
      "広報",
      "プレスリリース",
      "メディア",
      "ブランド",
      "PR",
      "お知らせ",
      "発表",
      "プロモーション",
      "認知",
      "リリース",
    ],
    writer: [
      "記事",
      "コンテンツ",
      "ブログ",
      "文章",
      "ライティング",
      "ドキュメント",
      "docs",
      "レポート",
      "マニュアル",
      "説明文",
    ],
    sns: [
      "SNS",
      "Twitter",
      "ソーシャル",
      "バズ",
      "投稿",
      "Instagram",
      "TikTok",
      "マーケティング",
      "拡散",
    ],
    seo: [
      "SEO",
      "検索",
      "キーワード",
      "オーガニック",
      "Google Analytics",
      "Search Console",
    ],
    // HR
    "hr-mgr": [
      "人事",
      "評価",
      "組織開発",
      "エンゲージメント",
      "労務",
      "制度設計",
    ],
    recruiter: [
      "採用",
      "求人",
      "面接",
      "候補者",
      "リクルーティング",
      "採用ブランド",
    ],
    // Legal
    "legal-counsel": [
      "法務",
      "契約",
      "知的財産",
      "特許",
      "法的リスク",
      "利用規約",
    ],
    compliance: [
      "コンプライアンス",
      "規程",
      "内部統制",
      "GDPR",
      "個人情報",
      "監査",
    ],
    // Operations
    accountant: [
      "経理",
      "予算",
      "コスト",
      "費用",
      "経費",
      "財務",
      "見積",
      "収支",
      "利益",
      "スプレッドシート",
      "シート",
    ],
    general: [
      "総務",
      "手続き",
      "福利厚生",
      "環境",
      "ワークフロー",
      "業務改善",
      "議事録",
      "整理",
      "メール",
      "gmail",
      "カレンダー",
      "予定",
      "スケジュール",
      "ドライブ",
      "google",
      "まとめ",
      "調整",
    ],
    "it-admin": [
      "情シス",
      "社内システム",
      "アカウント管理",
      "SaaS",
      "セキュリティポリシー",
      "DX",
    ],
    // Support
    "cs-leader": [
      "カスタマーサポート",
      "問い合わせ",
      "FAQ",
      "ヘルプ",
      "顧客対応",
      "サポート",
    ],
    "tech-support": [
      "テクニカルサポート",
      "障害対応",
      "トラブルシューティング",
      "ログ解析",
      "エスカレーション",
    ],
  };

  for (const [agentId, keywords] of Object.entries(agentKeywords)) {
    if (keywords.some((kw) => combined.includes(kw.toLowerCase()))) {
      const agent = AGENT_MAP.get(agentId);
      if (agent) selected.push(agent);
    }
  }

  // フォールバック: キーワードで判定できない場合
  if (selected.length === 0) {
    // リードエンジニアと総務で幅広く対応
    for (const id of ["lead-eng", "general"]) {
      const agent = AGENT_MAP.get(id);
      if (agent) selected.push(agent);
    }
  }

  return selected;
}
