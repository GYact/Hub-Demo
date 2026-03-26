<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# GYact Hub

**パーソナル・ライフマネジメント・プラットフォーム**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)

</div>

---

## 概要

GYact Hubは、個人の生産性とライフマネジメントを統合的に管理するためのWebアプリケーションです。ナレッジマネジメント、タスク管理、カレンダー連携、AI機能など、日々の生活と仕事を効率化する多彩な機能を備えています。

### 主な特徴

- 🔗 **オフラインファースト** - インターネット接続がなくても動作し、復帰時に自動同期
- 📱 **PWA対応** - インストール可能なプログレッシブWebアプリ
- 🎨 **ニューモーフィズムUI** - モダンで洗練されたデザイン
- 🤖 **AI統合** - Gemini、OpenAI、Perplexityを活用した自動化
- 🔄 **リアルタイム同期** - Supabaseによるリアルタイムデータ同期

---

## 機能一覧

| 機能 | 説明 |
|------|------|
| **Org Chart (Hub)** | ノードベースの視覚的な組織図・ナレッジマップ |
| **Tasks** | タスク管理（カテゴリ・ディバイダー対応） |
| **Memos** | タブ・カラー分類対応のメモ機能 |
| **Calendar** | Googleカレンダー連携 |
| **Clients** | クライアント・コンタクト管理 |
| **Money** | サブスクリプション・資産管理 |
| **Projects** | プロジェクト・予算トラッキング |
| **AI Hub** | AIアシスタント・自動化機能 |
| **Media** | RSSフィード・SNS連携 |
| **Journal** | 日記・ジャーナル機能 |

---

## 技術スタック

### フロントエンド
- **React 19** - 最新のReactフレームワーク
- **TypeScript 5.8** - 型安全な開発
- **Vite 6** - 高速ビルドツール
- **Tailwind CSS 3** - ユーティリティファーストCSS
- **React Router 7** - クライアントサイドルーティング

### バックエンド・データ
- **Supabase** - PostgreSQL + 認証 + リアルタイム
- **Dexie.js** - IndexedDBラッパー（オフライン対応）
- **Workbox** - サービスワーカー・キャッシング戦略

### AI連携
- **Google Gemini** - AI生成
- **OpenAI** - GPTモデル
- **Perplexity** - AI検索

### その他
- **@dnd-kit** - ドラッグ&ドロップ機能
- **Lucide React** - アイコンライブラリ

---

## セットアップ（フォークして使う場合）

### 必要条件
- Node.js 20+
- pnpm
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### 1. インストール

```bash
git clone https://github.com/YOUR_USER/Hub.git
cd Hub
pnpm install
```

### 2. Supabase プロジェクトの作成

1. [Supabase Dashboard](https://supabase.com/dashboard) で新規プロジェクトを作成
2. Project Settings > API から **Project URL**、**anon key**、**service_role key** を控える

```bash
# プロジェクトをリンク
supabase link --project-ref YOUR_PROJECT_REF

# マイグレーション適用（74件）
supabase db push

# pgvector 拡張を有効化（Dashboard > SQL Editor で実行）
# CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Google Cloud の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Gmail API / Calendar API / Drive API / Sheets API / Docs API を有効化
3. OAuth 2.0 クライアント ID を作成:
   - 承認済みリダイレクト URI: `https://your-domain.vercel.app/auth/google/callback`
4. Client ID と Client Secret を控える

### 4. VAPID キーの生成

```bash
npx web-push generate-vapid-keys
```

### 5. 環境変数

```bash
# フロントエンド
cp .env.example .env
# → .env を編集

# Supabase Edge Functions シークレット
supabase secrets set \
  GEMINI_API_KEY=your-key \
  OPENAI_API_KEY=your-key \
  ANTHROPIC_API_KEY=your-key \
  PERPLEXITY_API_KEY=your-key \
  GOOGLE_CLIENT_ID=your-id \
  GOOGLE_CLIENT_SECRET=your-secret \
  VAPID_PUBLIC_KEY=your-key \
  VAPID_PRIVATE_KEY=your-key \
  VAPID_SUBJECT=mailto:you@example.com
```

> AI プロバイダーのキーは最低1つあれば AI チャットが動作します。
> 各 `.env.example` ファイルに全変数の説明があります。

### 6. Edge Functions のデプロイ

```bash
supabase functions deploy
```

### 7. Vercel へデプロイ

1. [Vercel](https://vercel.com) でリポジトリをインポート（Framework: Vite）
2. `.env` と同じ環境変数を設定
3. `vercel.json` の CSP `connect-src` を自分の環境に合わせて編集

### 開発サーバー

```bash
pnpm dev
```

### ビルド

```bash
pnpm build
```

### オプション機能

| 機能 | 追加設定 |
|------|----------|
| Slack 連携 | Slack App 作成 → `SLACK_SIGNING_SECRET` を secrets に設定 |
| X/Twitter 取得 | `XAI_API_KEY` を secrets に設定 |
| SwitchBot | SwitchBot アプリでトークン取得 → Hub 設定画面から入力 |
| LINE 通知 | LINE Developers で Bot 作成 → DB に設定 |
| Relay (Claude Code) | `relay/.env.example` を参照 → ローカル PC で常駐 |

---

## プロジェクト構成

```
src/
├── pages/              # ページコンポーネント
│   ├── HubPage.tsx     # メイン組織図（Org Chart）
│   ├── TasksPage.tsx   # タスク管理
│   ├── MemosPage.tsx   # メモ機能
│   ├── CalendarPage.tsx # カレンダー
│   ├── ClientsPage.tsx # クライアント管理
│   ├── MoneyPage.tsx   # 財務トラッキング
│   ├── ProjectsPage.tsx # プロジェクト管理
│   ├── MediaPage.tsx   # メディア・フィード
│   └── ...
│
├── components/         # 再利用可能なUIコンポーネント
│   ├── Canvas.tsx      # インタラクティブキャンバス
│   ├── NodeCard.tsx    # ノードカード
│   ├── Layout.tsx      # メインレイアウト
│   ├── Sidebar.tsx     # ナビゲーションサイドバー
│   └── ...
│
├── hooks/              # カスタムReactフック
│   ├── useNodes.ts     # ノードCRUD
│   ├── useTasks.ts     # タスク管理
│   ├── useMemos.ts     # メモCRUD
│   └── ...
│
├── contexts/           # React Contextプロバイダー
│   ├── AuthContext.tsx # 認証状態
│   ├── UndoRedoContext.tsx # 元に戻す/やり直し
│   └── ...
│
├── lib/                # ユーティリティライブラリ
│   ├── supabase.ts     # Supabaseクライアント
│   ├── offlineDb.ts    # Dexieスキーマ
│   ├── offlineSync.ts  # 同期ロジック
│   └── ...
│
├── types/              # TypeScript型定義
│   └── index.ts
│
└── utils/              # ユーティリティ関数
```

---

## アーキテクチャ

### オフラインファースト設計
- **オンライン**: Supabase PostgreSQLバックエンド
- **オフライン**: Dexie IndexedDBローカルストレージ
- **同期**: 接続復旧時の自動バックグラウンド同期

### 元に戻す/やり直しシステム
- 最大50ステートの完全な状態履歴追跡
- キャンバス操作のリアルタイムプレビュー

### ビューモード
- **Canvas**: 視覚的なノードベースビュー
- **List**: テーブル形式のリストビュー

---

## ライセンス

このプロジェクトはプライベートリポジトリです。

---

<div align="center">

**GYact Hub** - あなたの生活をスマートに管理

</div>
