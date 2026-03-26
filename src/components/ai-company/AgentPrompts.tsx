import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AGENTS, GROUP_LABELS } from "../../lib/ai-company/agents";
import type { AgentDef, AgentGroup } from "../../lib/ai-company/types";

// ---------- Per-agent tool sets (relay/orchestrator.ts と同期) ----------

const DEV_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(pnpm build)",
  "Bash(pnpm lint)",
  "Bash(ls *)",
];

const CONTENT_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep", "Bash(ls *)"];
const READONLY_TOOLS = ["Read", "Glob", "Grep", "Bash(ls *)"];

const AGENT_TOOLS: Record<string, string[]> = {
  pm: DEV_TOOLS,
  "lead-eng": DEV_TOOLS,
  frontend: DEV_TOOLS,
  backend: DEV_TOOLS,
  infra: DEV_TOOLS,
  "pr-manager": CONTENT_TOOLS,
  writer: CONTENT_TOOLS,
  sns: CONTENT_TOOLS,
  accountant: READONLY_TOOLS,
  general: CONTENT_TOOLS,
};

// ---------- Role instructions (relay/orchestrator.ts と同期) ----------

const ROLE_INSTRUCTIONS: Record<string, string> = {
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
};

// ---------- Shared rules ----------

const BASE_RULES = `## 基本ルール
- タスクの内容を正確に理解してから行動すること
- 成果を簡潔に報告すること（何をしたか、なぜしたか）
- 不要なファイルは作らない
- 1つのタスクに集中し、成果物を小さく保つ`;

const DEV_RULES = `- 既存のコードパターンを読んでから変更すること
- TypeScript strict mode準拠
- TailwindCSSでスタイリング
- 変更後はビルドで確認`;

function getAgentTools(agentId: string): string[] {
  return AGENT_TOOLS[agentId] ?? READONLY_TOOLS;
}

function hasDevToolAccess(agentId: string): boolean {
  return getAgentTools(agentId).includes("Bash(pnpm build)");
}

function buildFullPrompt(agent: AgentDef): string {
  const role =
    ROLE_INSTRUCTIONS[agent.id] ??
    "あなたの専門知識でタスクに貢献してください。";

  const tools = getAgentTools(agent.id);
  const isDev = tools.includes("Bash(pnpm build)");
  const hasWrite = tools.includes("Edit") || tools.includes("Write");

  const toolDesc = isDev
    ? "ツール（Read, Edit, Write, Glob, Grep, Bash）を使って実際にコードを編集できます。"
    : hasWrite
      ? "ツール（Read, Edit, Write, Glob, Grep）を使ってファイルの参照・作成・編集ができます。"
      : "ツール（Read, Glob, Grep）を使ってプロジェクト情報を参照できます。";

  const teamMembers = AGENTS.filter(
    (a) => a.group === agent.group && a.id !== agent.id,
  )
    .map((a) => `- ${a.name}（${a.role}）`)
    .join("\n");

  let rules = BASE_RULES;
  if (isDev) {
    rules += "\n" + DEV_RULES;
  }

  return `${agent.systemPrompt}

## タスクモード
あなたはAI仮想会社の社員として、チームと協力してタスクに取り組みます。
${toolDesc}

### あなたの役割
${role}

### プロジェクト情報
プロジェクトルート: [Hub ディレクトリ]
[プロジェクト構造が動的に挿入]

## チームメンバー
${teamMembers}

## 最近のやり取り
[直近15件のメッセージが動的に挿入]

${rules}`;
}

function PromptBlock({
  label,
  content,
  color,
}: {
  label: string;
  content: string;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <span
        className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
        style={{ backgroundColor: color + "15", color }}
      >
        {label}
      </span>
      <pre className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed font-mono overflow-x-auto max-h-48 overflow-y-auto">
        {content}
      </pre>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentDef }) {
  const [expanded, setExpanded] = useState(false);
  const roleInstruction =
    ROLE_INSTRUCTIONS[agent.id] ??
    "あなたの専門知識でタスクに貢献してください。";
  const tools = getAgentTools(agent.id);
  const isDev = hasDevToolAccess(agent.id);
  const fullPrompt = buildFullPrompt(agent);

  return (
    <div className="neu-card overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <span className="neu-text-muted flex-shrink-0">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: agent.appearance.accentColor }}
        >
          {agent.name.charAt(0)}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium neu-text-primary">
            {agent.name}
          </span>
          <span className="text-[10px] neu-text-muted ml-2">{agent.role}</span>
        </div>
        <span
          className={`text-[8px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
            isDev
              ? "bg-emerald-50 text-emerald-600"
              : tools.includes("Edit")
                ? "bg-sky-50 text-sky-600"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {isDev ? "DEV" : tools.includes("Edit") ? "CONTENT" : "READ"}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono flex-shrink-0">
          {agent.id}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-3 space-y-3">
          {/* 人格プロンプト */}
          <PromptBlock
            label="System Prompt（人格設定）"
            content={agent.systemPrompt}
            color={agent.appearance.accentColor}
          />

          {/* 役割指示 */}
          <PromptBlock
            label="Role Instructions（役割指示）"
            content={roleInstruction}
            color="#059669"
          />

          {/* 許可ツール */}
          <div className="space-y-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
              Allowed Tools
            </span>
            <div className="flex flex-wrap gap-1">
              {tools.map((tool) => (
                <span
                  key={tool}
                  className="text-[10px] px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-full font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>

          {/* フルプロンプト */}
          <details className="group">
            <summary className="text-[10px] font-medium neu-text-muted cursor-pointer hover:neu-text-secondary transition-colors select-none">
              Full Prompt を表示
            </summary>
            <pre className="mt-2 text-[10px] text-slate-600 bg-slate-900 text-slate-300 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed font-mono max-h-96 overflow-y-auto">
              {fullPrompt}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export function AgentPrompts() {
  const [activeGroup, setActiveGroup] = useState<AgentGroup | "all">("all");

  const filtered =
    activeGroup === "all"
      ? AGENTS
      : AGENTS.filter((a) => a.group === activeGroup);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold neu-text-primary">
          Agent Prompts
        </h3>
        <p className="text-[11px] neu-text-muted leading-relaxed">
          各AIエージェントに渡されるシステムプロンプトと役割指示の確認
        </p>
      </div>

      {/* Shared rules */}
      <div className="neu-card p-3 space-y-3">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold neu-text-secondary uppercase tracking-wider">
            Base Rules（全員共通）
          </p>
          <pre className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed font-mono max-h-40 overflow-y-auto">
            {BASE_RULES}
          </pre>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
            Dev Rules（Tech グループ追加）
          </p>
          <pre className="text-[11px] text-slate-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed font-mono max-h-40 overflow-y-auto">
            {DEV_RULES}
          </pre>
        </div>
      </div>

      {/* Group filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {(
          [
            "all",
            "executive",
            "product",
            "tech",
            "design",
            "sales",
            "marketing",
            "hr",
            "legal",
            "operations",
            "support",
          ] as const
        ).map((g) => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`flex-shrink-0 px-3 py-1 rounded-lg text-[11px] transition-all ${
              activeGroup === g
                ? "neu-pressed neu-text-primary font-medium"
                : "neu-text-muted hover:neu-text-secondary"
            }`}
          >
            {g === "all"
              ? `全員 (${AGENTS.length})`
              : `${GROUP_LABELS[g]} (${AGENTS.filter((a) => a.group === g).length})`}
          </button>
        ))}
      </div>

      {/* Agent list */}
      <div className="space-y-2">
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
