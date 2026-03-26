-- ============================================================
-- GYact Hub Demo Seed Data
-- ============================================================
-- Run this SQL in the Supabase SQL Editor (Hub-Demo project).
-- Demo user: demo@hub-demo.com (must exist in auth.users)
-- ============================================================

DO $$
DECLARE
  uid UUID;
  -- Pre-generated UUIDs for FK references
  tl_personal UUID := 'a1000000-0000-0000-0000-000000000001'::uuid;
  tl_work     UUID := 'a1000000-0000-0000-0000-000000000002'::uuid;
  tl_study    UUID := 'a1000000-0000-0000-0000-000000000003'::uuid;
  sess1       UUID := 'b1000000-0000-0000-0000-000000000001'::uuid;
  sess2       UUID := 'b1000000-0000-0000-0000-000000000002'::uuid;
  pf_jp       UUID := 'c1000000-0000-0000-0000-000000000001'::uuid;
  pf_us       UUID := 'c1000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'demo@hub-demo.com';
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Demo user demo@hub-demo.com not found in auth.users';
  END IF;

  -- ============================================================
  -- CLEANUP
  -- ============================================================
  DELETE FROM ai_automation_runs WHERE user_id = uid;
  DELETE FROM ai_messages WHERE user_id = uid;
  DELETE FROM ai_notifications WHERE user_id = uid;
  DELETE FROM media_feed_items WHERE user_id = uid;
  DELETE FROM tasks WHERE user_id = uid;
  DELETE FROM task_dividers WHERE user_id = uid;
  DELETE FROM memos WHERE user_id = uid;
  DELETE FROM memo_trash WHERE user_id = uid;
  DELETE FROM invoices WHERE user_id = uid;
  DELETE FROM expenses WHERE user_id = uid;
  DELETE FROM money_documents WHERE user_id = uid;
  DELETE FROM invest_holdings WHERE user_id = uid;
  DELETE FROM invest_transactions WHERE user_id = uid;
  DELETE FROM invest_alerts WHERE user_id = uid;
  DELETE FROM invest_chart_drawings WHERE user_id = uid;
  DELETE FROM invest_watchlist WHERE user_id = uid;
  DELETE FROM invest_portfolios WHERE user_id = uid;
  DELETE FROM projects WHERE user_id = uid;
  DELETE FROM clients WHERE user_id = uid;
  DELETE FROM ai_sessions WHERE user_id = uid;
  DELETE FROM ai_automations WHERE user_id = uid;
  DELETE FROM ai_company_posts WHERE user_id = uid;
  DELETE FROM ai_company_messages WHERE user_id = uid;
  DELETE FROM ai_company_orchestrations WHERE user_id = uid;
  DELETE FROM switchbot_status_history WHERE user_id = uid;
  DELETE FROM health_meals WHERE user_id = uid;
  DELETE FROM health_supplements WHERE user_id = uid;
  DELETE FROM health_metrics WHERE user_id = uid;
  DELETE FROM location_logs WHERE user_id = uid;
  DELETE FROM google_calendar_events WHERE user_id = uid;
  DELETE FROM google_gmail_messages WHERE user_id = uid;
  DELETE FROM task_lists WHERE user_id = uid;
  DELETE FROM memo_tabs WHERE user_id = uid;
  DELETE FROM client_tabs WHERE user_id = uid;
  DELETE FROM project_tabs WHERE user_id = uid;
  DELETE FROM ai_notification_categories WHERE user_id = uid;
  DELETE FROM nodes WHERE user_id = uid;
  DELETE FROM frames WHERE user_id = uid;
  DELETE FROM tools WHERE user_id = uid;
  DELETE FROM menu_items WHERE user_id = uid;
  DELETE FROM devices WHERE user_id = uid;
  DELETE FROM data_catalog_items WHERE user_id = uid;
  DELETE FROM ai_shortcuts WHERE user_id = uid;
  DELETE FROM subscriptions WHERE user_id = uid;
  DELETE FROM assets WHERE user_id = uid;
  DELETE FROM journal_entries WHERE user_id = uid;
  DELETE FROM affiliations WHERE user_id = uid;
  DELETE FROM work_experiences WHERE user_id = uid;
  DELETE FROM educations WHERE user_id = uid;
  DELETE FROM skills WHERE user_id = uid;
  DELETE FROM certifications WHERE user_id = uid;
  DELETE FROM languages WHERE user_id = uid;
  DELETE FROM rss_feeds WHERE user_id = uid;
  DELETE FROM x_sources WHERE user_id = uid;
  DELETE FROM user_settings WHERE user_id = uid;
  DELETE FROM user_preferences WHERE user_id = uid;
  DELETE FROM profiles WHERE user_id = uid;

  -- ============================================================
  -- 1. PROFILE
  -- ============================================================
  INSERT INTO profiles (id, user_id, display_name, avatar_url, bio, first_message, head_message, company, job_title, social_links, health_info)
  VALUES (uid, uid, 'Taro Yamada', NULL,
    'AI×テクノロジーで社会課題を解決するスタートアップの創業者。フルスタックエンジニアとして、プロダクト開発からインフラ構築まで幅広く担当。',
    'こんにちは！GYact Hubのデモへようこそ。', '🚀 Building the future with AI',
    'TechVision株式会社', 'Founder & CEO',
    '[{"id":"sl-1","platform":"github","url":"https://github.com/demo-user"},{"id":"sl-2","platform":"x","url":"https://x.com/demo_user"},{"id":"sl-3","platform":"linkedin","url":"https://linkedin.com/in/demo-user"}]'::jsonb,
    '{"date_of_birth":"1995-06-15","height_cm":175,"weight_kg":68,"blood_type":"A","allergies":"特になし","medical_notes":""}'::jsonb
  );

  -- ============================================================
  -- 2. RESUME (affiliations, work_experiences, educations, skills, certifications, languages)
  -- ============================================================
  INSERT INTO affiliations (id, user_id, name, role, start_year, start_month, end_year, end_month, is_current, is_protected, description, order_index) VALUES
  ('aff-1', uid, 'TechVision株式会社', 'Founder & CEO', 2023, 4, NULL, NULL, true, false, 'AIプロダクト開発スタートアップを創業', 0),
  ('aff-2', uid, '一般社団法人AIイノベーション協会', '理事', 2024, 1, NULL, NULL, true, false, 'AI技術の社会実装推進に貢献', 1),
  ('aff-3', uid, 'Google Developer Group Tokyo', 'Organizer', 2022, 6, NULL, NULL, true, false, 'コミュニティイベントの企画運営', 2);

  INSERT INTO work_experiences (id, user_id, title, employment_type, company, location, start_year, start_month, end_year, end_month, is_current, description, skills, media_url, media_title, order_index) VALUES
  ('we-1', uid, 'Founder & CEO', 'self-employed', 'TechVision株式会社', '東京都渋谷区', 2023, 4, NULL, NULL, true, 'AIを活用したSaaSプロダクトの企画・開発・運営。チームマネジメントと事業戦略の策定。', '["TypeScript","React","Python","AI/ML","Product Management"]'::jsonb, '', '', 0),
  ('we-2', uid, 'シニアソフトウェアエンジニア', 'full-time', 'メガテック株式会社', '東京都港区', 2020, 4, 2023, 3, false, 'マイクロサービスアーキテクチャの設計・実装。技術チームのリード。', '["Go","Kubernetes","AWS","PostgreSQL","gRPC"]'::jsonb, '', '', 1),
  ('we-3', uid, 'フロントエンドエンジニア', 'full-time', 'ウェブクリエイト株式会社', '東京都新宿区', 2018, 4, 2020, 3, false, 'React/TypeScriptでのSPA開発。デザインシステムの構築。', '["React","TypeScript","GraphQL","Figma"]'::jsonb, '', '', 2);

  INSERT INTO educations (id, user_id, school, degree, field_of_study, start_year, start_month, end_year, end_month, is_current, grade, activities, description, order_index) VALUES
  ('edu-1', uid, '東京大学', '修士', '情報理工学', 2016, 4, 2018, 3, false, '', 'AI研究会、ハッカソン運営', '自然言語処理と機械学習の研究に従事', 0),
  ('edu-2', uid, '東京工業大学', '学士', '情報工学', 2012, 4, 2016, 3, false, '', 'プログラミングサークル部長', 'ソフトウェア工学とアルゴリズムを専攻', 1);

  INSERT INTO skills (id, user_id, name, proficiency, order_index) VALUES
  ('sk-1', uid, 'TypeScript / JavaScript', 'expert', 0),
  ('sk-2', uid, 'React / Next.js', 'expert', 1),
  ('sk-3', uid, 'Python', 'advanced', 2),
  ('sk-4', uid, 'Go', 'advanced', 3),
  ('sk-5', uid, 'AWS / GCP', 'advanced', 4),
  ('sk-6', uid, 'Docker / Kubernetes', 'advanced', 5),
  ('sk-7', uid, 'PostgreSQL', 'advanced', 6),
  ('sk-8', uid, 'AI / Machine Learning', 'intermediate', 7);

  INSERT INTO certifications (id, user_id, name, issuing_organization, issue_year, issue_month, expiry_year, expiry_month, has_no_expiry, credential_id, credential_url, photo_storage_path, order_index) VALUES
  ('cert-1', uid, 'AWS Solutions Architect Professional', 'Amazon Web Services', 2024, 3, 2027, 3, false, 'AWS-SAP-12345', '', '', 0),
  ('cert-2', uid, 'Google Cloud Professional Cloud Architect', 'Google Cloud', 2023, 11, 2025, 11, false, 'GCP-PCA-67890', '', '', 1),
  ('cert-3', uid, '応用情報技術者', 'IPA 情報処理推進機構', 2019, 10, NULL, NULL, true, 'AP-2019-XXXXX', '', '', 2),
  ('cert-4', uid, 'TOEIC 905点', 'IIBC', 2022, 6, NULL, NULL, true, '', '', '', 3);

  INSERT INTO languages (id, user_id, name, proficiency, order_index) VALUES
  ('lang-1', uid, '日本語', 'native', 0),
  ('lang-2', uid, 'English', 'professional', 1),
  ('lang-3', uid, '中文', 'elementary', 2);

  -- ============================================================
  -- 3. HUB CANVAS (nodes, frames)
  -- ============================================================
  INSERT INTO nodes (id, user_id, title, subtitle, type, shape, description, system_instruction, linked_to, position_x, position_y, group_color, icon) VALUES
  ('ceo',            uid, 'Taro Yamada',         'Human CEO / Commander',    'human', 'circle', '意思決定・最終承認',                             NULL, '{ai-ops}',                   631, -421, NULL, NULL),
  ('ai-ops',         uid, 'AI Operations Mgr',   'AI組織管理',               'ai',    'card',   'AI組織全体のオーケストレーション',                NULL, '{corp-strategy,product-eng,growth,innovation,private}', 593, -60, NULL, NULL),
  ('corp-strategy',  uid, '経営・管理本部',       'Corp. Strategy & Admin',   'ai',    'group',  '経営戦略立案、秘書業務、法務・財務を担当',       NULL, '{cso-ai,secretary-ai,legal-ai,finance-ai}', -71, 134, 'blue', NULL),
  ('cso-ai',         uid, 'CSO AI',              'Chief Strategy Officer',    'ai',    'card',   '市場動向・競合分析のリサーチ、戦略立案',         NULL, '{}', -253, 355, NULL, NULL),
  ('secretary-ai',   uid, '秘書AI',              'Executive Assistant',       'ai',    'card',   'スケジュール調整、会議設定、リマインダー管理',   NULL, '{}', -255, 251, NULL, NULL),
  ('legal-ai',       uid, '法務AI',              '契約審査・リスク管理',      'ai',    'card',   '契約書レビュー、NDA作成、コンプライアンス',      NULL, '{}', 125, 452, NULL, NULL),
  ('finance-ai',     uid, '経理・財務AI',         '請求・CF管理',             'ai',    'card',   '請求書処理、経費精算、キャッシュフロー予測',     NULL, '{}', 122, 359, NULL, NULL),
  ('product-eng',    uid, 'プロダクト・開発本部',  'Product & Engineering',    'ai',    'group',  'プロダクト企画からエンジニアリングまで担当',     NULL, '{ai-pdm}', 593, 144, 'blue', NULL),
  ('ai-pdm',         uid, 'AI PdM',              'Product Manager',           'ai',    'card',   'プロダクト要件定義、ユーザーストーリー作成',     NULL, '{techlead-ai}', 593, 284, NULL, NULL),
  ('techlead-ai',    uid, 'Tech Lead AI',        'Technical Leadership',      'ai',    'card',   'アーキテクチャ設計、技術選定、コードレビュー',   NULL, '{dev-guild}', 592, 410, NULL, NULL),
  ('dev-guild',      uid, 'Developer Guild',     'Development Team',          'ai',    'group',  'Web/モバイル/アルゴリズムの専門開発チーム',      NULL, '{web-ai,mobile-ai,devops-ai,uiux-ai}', 592, 540, 'green', NULL),
  ('web-ai',         uid, 'Web/AI Dev',          'Web Developer',             'ai',    'card',   'React/TypeScriptによるWebアプリ開発',            NULL, '{}', 449, 670, NULL, NULL),
  ('mobile-ai',      uid, 'Mobile App',          'Mobile Developer',          'ai',    'card',   'React Native/Swiftによるモバイルアプリ開発',     NULL, '{}', 708, 762, NULL, NULL),
  ('uiux-ai',        uid, 'UI/UX Designer AI',   'デザイン・プロトタイプ',    'ai',    'card',   'UIコンポーネント生成、プロトタイプ作成',         NULL, '{}', 448, 762, NULL, NULL),
  ('devops-ai',      uid, 'DevOps AI',           'CI/CD・インフラ',           'ai',    'card',   'CI/CDパイプライン構築、Dockerによるインフラ自動化', NULL, '{}', 709, 856, NULL, NULL),
  ('growth',         uid, 'セールス・広報本部',    'Growth',                   'ai',    'group',  '営業・広報・事業開発を担当',                     NULL, '{sales-ai,pr-ai,growth-ai}', 1168, 136, 'blue', NULL),
  ('sales-ai',       uid, 'セールスAI',           'Sales',                    'ai',    'card',   '営業メール・提案書作成、リード獲得支援',         NULL, '{}', 999, 267, NULL, NULL),
  ('pr-ai',          uid, '広報AI',               'Public Relations',         'ai',    'card',   'プレスリリース作成、SNS投稿生成',                NULL, '{}', 1410, 232, NULL, NULL),
  ('growth-ai',      uid, '事業開発AI',           'Business Development',     'ai',    'card',   '市場機会の発掘、パートナーシップ候補調査',       NULL, '{}', 1156, 353, NULL, NULL),
  ('innovation',     uid, 'R&D・ナレッジ',        'Innovation',               'ai',    'group',  '技術リサーチとナレッジ蓄積を担当',              NULL, '{knowledge-ai,rd-ai}', 1146, -176, 'green', NULL),
  ('knowledge-ai',   uid, 'ナレッジAI',           'Knowledge Management',     'ai',    'card',   '社内ドキュメントの整理・検索、FAQ生成',          NULL, '{}', 1424, -52, NULL, NULL),
  ('rd-ai',          uid, 'R&D AI',              'Research & Development',    'ai',    'card',   '最新技術論文のサーベイ、新技術の実現可能性評価', NULL, '{}', 1437, -173, NULL, NULL),
  ('private',        uid, 'Private',             '個人的な営み',              'ai',    'group',  '',                                               NULL, '{}', 260, -321, 'pink', NULL),
  ('invest-ai',      uid, '投資AI',              'Investment Research',       'ai',    'card',   'AI特化日本株リサーチ、ポートフォリオ分析',       NULL, '{}', 259, -112, NULL, NULL),
  ('item-note',      uid, 'note',                NULL,                        'item',  'card',   '', NULL, '{}', 1705, 338, NULL, NULL),
  ('item-qiita',     uid, 'Qiita',              NULL,                        'item',  'card',   '', NULL, '{}', 1701, 191, NULL, NULL),
  ('item-zenn',      uid, 'Zenn',               NULL,                        'item',  'card',   '', NULL, '{}', 1700, 123, NULL, NULL),
  ('item-x',         uid, 'X',                  NULL,                        'item',  'card',   '', NULL, '{}', 1946, 189, NULL, NULL),
  ('item-linkedin',  uid, 'LinkedIn',           NULL,                        'item',  'card',   '', NULL, '{}', 1704, 261, NULL, NULL);

  INSERT INTO frames (id, user_id, label, color, position_x, position_y, width, height, linked_to) VALUES
  ('frame-tech',    uid, 'Tech',  'blue',   317,  55, 522, 955, '{}'),
  ('frame-rd',      uid, 'R&D',   'green', 1006, -255, 714, 276, '{}'),
  ('frame-private', uid, NULL,     'pink',  -236, -431, 624, 380, '{}'),
  ('frame-hq',      uid, '本部',   'blue',  -398,  55, 677, 622, '{}'),
  ('frame-media',   uid, 'media', 'yellow', 1572,  54, 516, 341, '{}'),
  ('frame-sales',   uid, 'sales', 'blue',   862,  55, 681, 413, '{}');

  -- ============================================================
  -- 4. MENU ITEMS
  -- ============================================================
  INSERT INTO menu_items (id, user_id, path, icon, label, color_class, hover_class, order_index, is_visible) VALUES
  ('mi-home',     uid, '/home',      'Home',              'Home',       'text-sky-600',    'hover:bg-sky-100 hover:text-sky-800',     0,  true),
  ('mi-hub',      uid, '/hub',       'Network',           'Hub',        'text-purple-600', 'hover:bg-purple-100 hover:text-purple-800', 1, true),
  ('mi-tasks',    uid, '/tasks',     'ListTodo',          'Tasks',      'text-sky-600',    'hover:bg-sky-100 hover:text-sky-800',     2,  true),
  ('mi-memos',    uid, '/memos',     'StickyNote',        'Memos',      'text-indigo-600', 'hover:bg-indigo-100 hover:text-indigo-800', 3, true),
  ('mi-calendar', uid, '/calendar',  'Calendar',          'Calendar',   'text-amber-600',  'hover:bg-amber-100 hover:text-amber-800', 4, true),
  ('mi-clients',  uid, '/community', 'Users',             'Clients',    'text-teal-600',   'hover:bg-teal-100 hover:text-teal-800',   5, true),
  ('mi-money',    uid, '/finance',   'Wallet',            'Money',      'text-emerald-600','hover:bg-emerald-100 hover:text-emerald-800', 6, true),
  ('mi-journal',  uid, '/journal',   'BookOpen',          'Journal',    'text-cyan-600',   'hover:bg-cyan-100 hover:text-cyan-800',   7, true),
  ('mi-projects', uid, '/projects',  'FolderKanban',      'Projects',   'text-orange-600', 'hover:bg-orange-100 hover:text-orange-800', 8, true),
  ('mi-ai',       uid, '/ai',        'Bot',               'AI Hub',     'text-purple-600', 'hover:bg-purple-100 hover:text-purple-800', 9, true),
  ('mi-media',    uid, '/media',     'Database',          'Media',      'text-blue-600',   'hover:bg-blue-100 hover:text-blue-800',   10, true),
  ('mi-invest',   uid, '/invest',    'CandlestickChart',  'Invest',     'text-blue-600',   'hover:bg-blue-100 hover:text-blue-800',   11, true),
  ('mi-drive',    uid, '/drive',     'Database',          'Drive',      'text-violet-600', 'hover:bg-violet-100 hover:text-violet-800', 12, true),
  ('mi-profile',  uid, '/profile',   'User',              'Profile',    'text-rose-600',   'hover:bg-rose-100 hover:text-rose-800',   13, true),
  ('mi-settings', uid, '/settings',  'Settings',          'Settings',   'text-slate-600',  'hover:bg-slate-100 hover:text-slate-800', 14, true);

  -- ============================================================
  -- 5. TOOLS, DEVICES, DATA CATALOG, AI SHORTCUTS
  -- ============================================================
  INSERT INTO tools (id, user_id, name, description, url, category, order_index) VALUES
  ('tool-cursor',    uid, 'Cursor',        'AI-powered code editor',      'https://cursor.com',      'Development', 0),
  ('tool-claude',    uid, 'Claude',        'Anthropic AI Assistant',      'https://claude.ai',       'AI',          1),
  ('tool-chatgpt',   uid, 'ChatGPT',       'OpenAI Chat Interface',       'https://chat.openai.com', 'AI',          2),
  ('tool-figma',     uid, 'Figma',         'Design & Prototyping',        'https://figma.com',       'Design',      3),
  ('tool-notion',    uid, 'Notion',        'Documentation & Wiki',        'https://notion.so',       'Productivity',4),
  ('tool-slack',     uid, 'Slack',         'Team Communication',          'https://slack.com',       'Communication',5),
  ('tool-vercel',    uid, 'Vercel',        'Deployment Platform',         'https://vercel.com',      'Infrastructure',6),
  ('tool-supabase',  uid, 'Supabase',      'Backend-as-a-Service',        'https://supabase.com',    'Infrastructure',7);

  INSERT INTO devices (id, user_id, name, description) VALUES
  ('dev-mbp',    uid, 'MacBook Pro 16" M4 Max',  '開発メインマシン'),
  ('dev-iphone', uid, 'iPhone 16 Pro',            '日常利用・動作確認'),
  ('dev-ipad',   uid, 'iPad Pro 13" M4',          'デザインレビュー・ノート'),
  ('dev-display',uid, 'Studio Display',            '外部ディスプレイ'),
  ('dev-airtag', uid, 'AirTag',                    '鍵・財布のトラッキング');

  INSERT INTO data_catalog_items (id, user_id, label, description, link, order_index) VALUES
  ('dc-1', uid, 'プロダクトロードマップ',   '2026年Q2-Q4のプロダクト計画',       'https://notion.so/roadmap', 0),
  ('dc-2', uid, 'テックブログ原稿',         'Zenn/Qiita向け技術記事の下書き',    'https://notion.so/blog',    1),
  ('dc-3', uid, '投資リサーチノート',        'AI関連銘柄の分析メモ',              '',                          2),
  ('dc-4', uid, 'ミーティング議事録',        '過去の打ち合わせ議事録一覧',        'https://notion.so/mtg',     3),
  ('dc-5', uid, '経費レシートフォルダ',      'Google Driveの経費書類',            '',                          4);

  INSERT INTO ai_shortcuts (id, user_id, label, order_index) VALUES
  ('as-1', uid, '今日のタスクを整理して', 0),
  ('as-2', uid, 'メールの要約をお願い', 1),
  ('as-3', uid, '今週のスケジュールを確認', 2),
  ('as-4', uid, 'コードレビューをして', 3),
  ('as-5', uid, '投資ポートフォリオの分析', 4),
  ('as-6', uid, '日報を作成して', 5);

  -- ============================================================
  -- 6. TASK LISTS & TASKS
  -- ============================================================
  INSERT INTO task_lists (id, user_id, title, position) VALUES
  (tl_personal, uid, '個人タスク',   0),
  (tl_work,     uid, '開発タスク',   1),
  (tl_study,    uid, '学習・リサーチ', 2);

  INSERT INTO tasks (id, user_id, list_id, title, notes, status, due_date, due_time, position, is_starred) VALUES
  (gen_random_uuid(), uid, tl_personal, '確定申告書類の準備',           '2025年度の経費レシートを整理', 'needsAction', NOW() + INTERVAL '5 days',  '10:00', 0, true),
  (gen_random_uuid(), uid, tl_personal, '歯科検診の予約',              '半年ぶりの定期検診',           'needsAction', NOW() + INTERVAL '7 days',  NULL,    1, false),
  (gen_random_uuid(), uid, tl_personal, 'ジムの月会費支払い',           '',                             'completed',   NOW() - INTERVAL '2 days',  NULL,    2, false),
  (gen_random_uuid(), uid, tl_personal, '読書: 「AIの未来」',           '第5章まで読了',                'needsAction', NOW() + INTERVAL '14 days', NULL,    3, false),
  (gen_random_uuid(), uid, tl_work,     'ダッシュボードUI改修',         'グラフコンポーネントの最適化', 'needsAction', NOW() + INTERVAL '3 days',  '14:00', 0, true),
  (gen_random_uuid(), uid, tl_work,     'API認証ミドルウェア実装',      'JWT検証ロジックの追加',        'needsAction', NOW() + INTERVAL '4 days',  NULL,    1, true),
  (gen_random_uuid(), uid, tl_work,     'CI/CDパイプライン修正',        'ビルドキャッシュの改善',       'completed',   NOW() - INTERVAL '1 day',   NULL,    2, false),
  (gen_random_uuid(), uid, tl_work,     'E2Eテストの追加',              'ログインフローのテスト',       'needsAction', NOW() + INTERVAL '6 days',  NULL,    3, false),
  (gen_random_uuid(), uid, tl_work,     'Supabase RLSポリシー見直し',   'セキュリティ監査対応',         'needsAction', NOW() + INTERVAL '5 days',  NULL,    4, false),
  (gen_random_uuid(), uid, tl_study,    'LLMファインチューニング論文',   'LoRA/QLoRAの最新手法',         'needsAction', NOW() + INTERVAL '10 days', NULL,    0, false),
  (gen_random_uuid(), uid, tl_study,    'Rust入門（Chapter 8まで）',     'The Rust Programming Language', 'needsAction', NOW() + INTERVAL '21 days', NULL,    1, false),
  (gen_random_uuid(), uid, tl_study,    'Kubernetes CKA勉強',           'Udemy講座セクション4完了',     'completed',   NOW() - INTERVAL '3 days',  NULL,    2, false);

  INSERT INTO task_dividers (id, user_id, list_id, position, color) VALUES
  ('td-1', uid, tl_personal, 2, 'emerald'),
  ('td-2', uid, tl_work,     2, 'sky'),
  ('td-3', uid, tl_study,    2, 'purple');

  -- ============================================================
  -- 7. MEMOS
  -- ============================================================
  INSERT INTO memo_tabs (id, user_id, name, color, order_index) VALUES
  ('mt-ideas',   uid, 'Feature Ideas', 'purple', 0),
  ('mt-work',    uid, '作業メモ',       'blue',   1),
  ('mt-private', uid, 'プライベート',   'pink',   2),
  ('mt-reading', uid, '読書ノート',     'yellow', 3);

  INSERT INTO memos (id, user_id, tab_id, title, content, order_index) VALUES
  ('memo-1',  uid, 'mt-ideas', 'RAGパイプライン改善案', '## 現状の課題\n- チャンク分割が粗い\n- リランキングが未実装\n\n## 改善案\n1. セマンティックチャンキング導入\n2. Cohere Rerankの統合\n3. ハイブリッド検索（BM25+ベクトル）', 0),
  ('memo-2',  uid, 'mt-ideas', 'モバイルアプリ構想',     '### MVP機能\n- プッシュ通知\n- タスク管理\n- カレンダー表示\n\n### 技術選定\n- React Native + Expo\n- Supabase SDK', 1),
  ('memo-3',  uid, 'mt-ideas', 'AI Agent連携フロー',    'エージェント間のメッセージングプロトコルを設計する\n\n```\nUser → Orchestrator → Specialist Agent → Tool\n```', 2),
  ('memo-4',  uid, 'mt-work',  'デプロイチェックリスト', '- [ ] 環境変数の確認\n- [ ] マイグレーション実行\n- [ ] E2Eテスト\n- [ ] ステージング確認\n- [ ] 本番デプロイ\n- [ ] Slack通知', 0),
  ('memo-5',  uid, 'mt-work',  'Supabase Edge Function メモ', 'Deno Deployベース\n\n```typescript\nDeno.serve(async (req) => {\n  const { data } = await supabase.from("table").select("*");\n  return new Response(JSON.stringify(data));\n});\n```', 1),
  ('memo-6',  uid, 'mt-work',  'パフォーマンス改善TODO', '1. React.memoの適用箇所洗い出し\n2. バンドルサイズ分析\n3. 画像の遅延読み込み\n4. API応答キャッシュ戦略', 2),
  ('memo-7',  uid, 'mt-private', '旅行プラン（GW）',     '### 候補\n1. 京都（2泊3日）\n2. 沖縄（3泊4日）\n3. 台湾（4泊5日）\n\n### 予算\n- 国内: 8-12万円\n- 海外: 15-20万円', 0),
  ('memo-8',  uid, 'mt-private', '買い物リスト',          '- プロテイン（チョコ味）\n- ランニングシューズ\n- USB-C ハブ\n- 観葉植物', 1),
  ('memo-9',  uid, 'mt-reading', '「ZERO to ONE」メモ',   '## Key Takeaways\n- 競争は敗者のゲーム\n- 独占を目指す\n- 小さな市場から始める\n- ラストムーバーアドバンテージ', 0),
  ('memo-10', uid, 'mt-reading', '「Designing Data-Intensive Applications」', '### Chapter 5: Replication\n- Single-leader, Multi-leader, Leaderless\n- Eventual consistency の課題\n- Conflict resolution strategies', 1);

  -- ============================================================
  -- 8. CLIENTS
  -- ============================================================
  INSERT INTO client_tabs (id, user_id, name, color, order_index) VALUES
  ('ct-corp',   uid, '法人クライアント', 'blue',   0),
  ('ct-ind',    uid, '個人クライアント', 'green',  1),
  ('ct-partner',uid, 'パートナー',       'orange', 2);

  INSERT INTO clients (id, user_id, tab_id, name, contact_name, email, phone, address, notes, status, order_index) VALUES
  ('cl-1', uid, 'ct-corp', '株式会社フューチャーテック', '佐藤一郎',     'sato@futuretech.co.jp',    '03-1234-5678', '東京都千代田区丸の内1-1-1', 'AI導入コンサルティング案件', 'active', 0),
  ('cl-2', uid, 'ct-corp', 'グローバルメディア株式会社', '鈴木花子',     'suzuki@globalmedia.jp',    '03-2345-6789', '東京都港区六本木3-2-1',     'Webリニューアルプロジェクト', 'active', 1),
  ('cl-3', uid, 'ct-corp', 'ヘルスケアAI株式会社',       '田中太郎',     'tanaka@healthai.co.jp',    '06-3456-7890', '大阪府大阪市北区梅田2-3-4', 'ヘルスケアアプリ共同開発',   'active', 2),
  ('cl-4', uid, 'ct-corp', 'ネクストバンク株式会社',     '高橋優子',     'takahashi@nextbank.jp',    '03-4567-8901', '東京都中央区日本橋1-5-3',   'FinTech API連携',           'prospect', 3),
  ('cl-5', uid, 'ct-ind',  '山本健二',                   NULL,           'yamamoto@example.com',     '090-1111-2222', '',                         'フリーランスデザイナー',     'active', 0),
  ('cl-6', uid, 'ct-ind',  '伊藤美咲',                   NULL,           'ito.misaki@example.com',   '080-3333-4444', '',                         'Webコンサル個人契約',       'active', 1),
  ('cl-7', uid, 'ct-partner', 'AWS Japan',                '渡辺直人',    'watanabe@aws.example.com', '',              '東京都品川区',              'クラウドパートナー',         'active', 0),
  ('cl-8', uid, 'ct-partner', 'Google Cloud Japan',       '小林誠',      'kobayashi@gcp.example.com','',              '東京都渋谷区',              'GCPパートナーシップ',       'active', 1);

  -- ============================================================
  -- 9. PROJECTS
  -- ============================================================
  INSERT INTO project_tabs (id, user_id, name, color, order_index) VALUES
  ('pt-active',    uid, '進行中', 'blue',   0),
  ('pt-plan',      uid, '計画中', 'yellow', 1),
  ('pt-completed', uid, '完了',   'green',  2);

  INSERT INTO projects (id, user_id, tab_id, name, description, status, client_id, start_date, end_date, budget, currency, order_index) VALUES
  ('proj-1', uid, 'pt-active', 'AI Chat Platform v2.0',        'LLMを活用した社内チャットプラットフォーム', 'in_progress', 'cl-1', '2026-01-15', '2026-06-30', 5000000, 'JPY', 0),
  ('proj-2', uid, 'pt-active', 'コーポレートサイトリニューアル', 'Next.js 16 + Vercelでのフルリニューアル',   'in_progress', 'cl-2', '2026-02-01', '2026-04-30', 3000000, 'JPY', 1),
  ('proj-3', uid, 'pt-active', 'ヘルスケアダッシュボード',       'リアルタイム健康データの可視化',            'in_progress', 'cl-3', '2026-03-01', '2026-08-31', 8000000, 'JPY', 2),
  ('proj-4', uid, 'pt-plan',   'FinTech API Gateway',           'オープンバンキングAPI基盤の設計',           'planning',    'cl-4', '2026-05-01', '2026-12-31', 12000000,'JPY', 0),
  ('proj-5', uid, 'pt-plan',   'モバイルアプリMVP',              'React Native + Expoでの初期開発',           'planning',    NULL,   '2026-06-01', '2026-09-30', 2000000, 'JPY', 1),
  ('proj-6', uid, 'pt-completed','社内ナレッジベース構築',        'RAG + Supabase pgvectorでの実装',           'completed',   NULL,   '2025-10-01', '2026-01-31', 1500000, 'JPY', 0);

  -- ============================================================
  -- 10. FINANCE (subscriptions, assets, invoices, expenses)
  -- ============================================================
  INSERT INTO subscriptions (id, user_id, name, amount, currency, billing_cycle, next_billing_date, category, status, notes, order_index) VALUES
  ('sub-1',  uid, 'Cursor Pro',        3000,  'JPY', 'monthly', (NOW() + INTERVAL '15 days')::date, 'productivity', 'active', 'AI搭載コードエディタ', 0),
  ('sub-2',  uid, 'Claude Max',        16900, 'JPY', 'monthly', (NOW() + INTERVAL '8 days')::date,  'productivity', 'active', 'Anthropic AIアシスタント', 1),
  ('sub-3',  uid, 'ChatGPT Plus',      3500,  'JPY', 'monthly', (NOW() + INTERVAL '20 days')::date, 'productivity', 'active', 'OpenAI', 2),
  ('sub-4',  uid, 'GitHub Copilot',    1500,  'JPY', 'monthly', (NOW() + INTERVAL '12 days')::date, 'productivity', 'active', '', 3),
  ('sub-5',  uid, 'AWS',               25000, 'JPY', 'monthly', (NOW() + INTERVAL '1 day')::date,   'utilities',    'active', '本番インフラ', 4),
  ('sub-6',  uid, 'Vercel Pro',        2800,  'JPY', 'monthly', (NOW() + INTERVAL '5 days')::date,  'utilities',    'active', 'ホスティング', 5),
  ('sub-7',  uid, 'Figma Professional',1800,  'JPY', 'monthly', (NOW() + INTERVAL '18 days')::date, 'productivity', 'active', 'デザインツール', 6),
  ('sub-8',  uid, 'Netflix',           1490,  'JPY', 'monthly', (NOW() + INTERVAL '22 days')::date, 'entertainment','active', '', 7),
  ('sub-9',  uid, 'Spotify Premium',    980,  'JPY', 'monthly', (NOW() + INTERVAL '10 days')::date, 'entertainment','active', '', 8),
  ('sub-10', uid, 'Amazon Prime',      4900,  'JPY', 'yearly',  (NOW() + INTERVAL '120 days')::date,'entertainment','active', '', 9),
  ('sub-11', uid, 'iCloud+ 200GB',     400,   'JPY', 'monthly', (NOW() + INTERVAL '3 days')::date,  'utilities',    'active', '', 10);

  INSERT INTO assets (id, user_id, name, asset_type, institution, amount, currency, notes, order_index) VALUES
  ('asset-1', uid, '普通預金',           'bank',       '三菱UFJ銀行',     3500000,  'JPY', 'メイン口座',           0),
  ('asset-2', uid, '事業用口座',         'bank',       '住信SBIネット銀行', 2200000, 'JPY', '法人口座',             1),
  ('asset-3', uid, 'NISA口座',           'investment', 'SBI証券',          1800000,  'JPY', '積立NISA',             2),
  ('asset-4', uid, '特定口座（日本株）', 'stock',      'SBI証券',          4500000,  'JPY', '個別株ポートフォリオ', 3),
  ('asset-5', uid, 'US Stock Account',   'stock',      'Firstrade',        15000,    'USD', '米国個別株',           4),
  ('asset-6', uid, 'Bitcoin',            'crypto',     'bitFlyer',         350000,   'JPY', 'BTC長期保有',          5),
  ('asset-7', uid, '個人年金',           'pension',    '日本生命',         800000,   'JPY', 'iDeCo',               6);

  INSERT INTO invoices (id, user_id, invoice_number, document_type, client_id, project_id, issue_date, due_date, paid_date, amount, currency, status, category, tax_included, notes, order_index) VALUES
  (gen_random_uuid(), uid, 'INV-2026-001', 'invoice', 'cl-1', 'proj-1', '2026-01-31', '2026-02-28', '2026-02-25', 1500000, 'JPY', 'paid',    'freelance', true, '1月分開発費', 0),
  (gen_random_uuid(), uid, 'INV-2026-002', 'invoice', 'cl-2', 'proj-2', '2026-02-28', '2026-03-31', NULL,         800000,  'JPY', 'issued',  'freelance', true, '2月分デザイン・開発費', 1),
  (gen_random_uuid(), uid, 'INV-2026-003', 'invoice', 'cl-3', 'proj-3', '2026-03-15', '2026-04-15', NULL,         1200000, 'JPY', 'issued',  'freelance', true, '3月分ダッシュボード開発', 2),
  (gen_random_uuid(), uid, 'EST-2026-001', 'estimate','cl-4', 'proj-4', '2026-03-10', '2026-04-10', NULL,         12000000,'JPY', 'issued',  NULL,        true, 'API Gateway構築見積', 3),
  (gen_random_uuid(), uid, 'EST-2026-002', 'estimate','cl-1', NULL,     '2026-03-20', '2026-04-20', NULL,         3000000, 'JPY', 'draft',   NULL,        true, 'AI機能拡張見積', 4);

  INSERT INTO expenses (id, user_id, title, amount, currency, expense_date, category, notes, order_index) VALUES
  (gen_random_uuid(), uid, 'AWS利用料（2月分）',        25430, 'JPY', '2026-02-28', 'software',      'EC2 + RDS + S3', 0),
  (gen_random_uuid(), uid, 'Vercel Pro（2月分）',        2800, 'JPY', '2026-02-15', 'software',      '', 1),
  (gen_random_uuid(), uid, 'タクシー（クライアント訪問）',3200, 'JPY', '2026-03-10', 'transport',     '渋谷→丸の内', 2),
  (gen_random_uuid(), uid, 'ビジネスランチ',             4500, 'JPY', '2026-03-12', 'food',          'cl-1 佐藤様と打合せ', 3),
  (gen_random_uuid(), uid, '技術書籍「System Design」',  5280, 'JPY', '2026-03-05', 'education',     'Amazon購入', 4),
  (gen_random_uuid(), uid, 'コワーキングスペース利用料', 15000, 'JPY', '2026-03-01', 'other',         'WeWork月額', 5),
  (gen_random_uuid(), uid, 'ドメイン更新（techvision.jp）', 2500, 'JPY', '2026-02-20', 'communication','年次更新', 6),
  (gen_random_uuid(), uid, 'USBハブ購入',                4980, 'JPY', '2026-03-08', 'hardware',      'Anker USB-C Hub', 7);

  INSERT INTO money_documents (id, user_id, title, document_type, tags, notes, order_index) VALUES
  (gen_random_uuid(), uid, '業務委託契約書（フューチャーテック）', 'contract', '{"法人","開発"}', '2026年1月〜6月', 0),
  (gen_random_uuid(), uid, 'NDA（グローバルメディア）',           'contract', '{"法人","NDA"}',  '締結済み',       1),
  (gen_random_uuid(), uid, '2025年度確定申告書類',                 'report',   '{"税務"}',        '提出済み',       2);

  -- ============================================================
  -- 11. INVESTMENTS
  -- ============================================================
  INSERT INTO invest_portfolios (id, user_id, name, description, currency, order_index) VALUES
  (pf_jp, uid, '日本株ポートフォリオ', 'AI・テック関連の日本株', 'JPY', 0),
  (pf_us, uid, '米国株ポートフォリオ', 'GAFAM + AI関連',        'USD', 1);

  INSERT INTO invest_holdings (id, user_id, portfolio_id, symbol, name, market, quantity, avg_cost, currency, notes, order_index) VALUES
  (gen_random_uuid(), uid, pf_jp, '4755',  ' 楽天グループ',       'JP', 300, 850,    'JPY', 'モバイル事業期待', 0),
  (gen_random_uuid(), uid, pf_jp, '6758',  'ソニーグループ',     'JP', 50,  13200,  'JPY', 'エンタメ＋半導体',  1),
  (gen_random_uuid(), uid, pf_jp, '9984',  'ソフトバンクグループ','JP', 100, 8500,   'JPY', 'AI投資ポートフォリオ', 2),
  (gen_random_uuid(), uid, pf_jp, '4194',  'ビジョナル',         'JP', 30,  7800,   'JPY', 'HR Tech',           3),
  (gen_random_uuid(), uid, pf_jp, '3993',  'PKSHA Technology',   'JP', 100, 3200,   'JPY', 'AI特化',            4),
  (gen_random_uuid(), uid, pf_us, 'NVDA',  'NVIDIA',             'US', 20,  135.50, 'USD', 'GPU・AI基盤',       0),
  (gen_random_uuid(), uid, pf_us, 'MSFT',  'Microsoft',          'US', 15,  420.00, 'USD', 'Azure + OpenAI',    1),
  (gen_random_uuid(), uid, pf_us, 'GOOGL', 'Alphabet',           'US', 25,  175.00, 'USD', 'Gemini + Cloud',    2),
  (gen_random_uuid(), uid, pf_us, 'AMZN',  'Amazon',             'US', 18,  195.00, 'USD', 'AWS + Bedrock',     3);

  INSERT INTO invest_watchlist (id, user_id, symbol, name, market, notes, order_index) VALUES
  (gen_random_uuid(), uid, '2587',  'サントリー食品',    'JP', '安定配当', 0),
  (gen_random_uuid(), uid, '7203',  'トヨタ自動車',      'JP', 'EV転換',   1),
  (gen_random_uuid(), uid, 'PLTR',  'Palantir',          'US', 'AI政府契約', 2),
  (gen_random_uuid(), uid, 'SNOW',  'Snowflake',         'US', 'データ基盤', 3),
  (gen_random_uuid(), uid, 'CRWD',  'CrowdStrike',       'US', 'セキュリティ', 4);

  INSERT INTO invest_transactions (id, user_id, portfolio_id, symbol, name, market, type, quantity, price, fee, currency, notes, transacted_at) VALUES
  (gen_random_uuid(), uid, pf_jp, '4755',  '楽天グループ',        'JP', 'buy',      200, 820,    275, 'JPY', '初回購入',           NOW() - INTERVAL '90 days'),
  (gen_random_uuid(), uid, pf_jp, '4755',  '楽天グループ',        'JP', 'buy',      100, 910,    275, 'JPY', '追加購入',           NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), uid, pf_jp, '6758',  'ソニーグループ',      'JP', 'buy',       50, 13200, 1100, 'JPY', '',                   NOW() - INTERVAL '60 days'),
  (gen_random_uuid(), uid, pf_jp, '9984',  'ソフトバンクグループ','JP', 'buy',      100, 8500,   550, 'JPY', '',                   NOW() - INTERVAL '45 days'),
  (gen_random_uuid(), uid, pf_us, 'NVDA',  'NVIDIA',              'US', 'buy',       10, 125.00, 0,   'USD', '',                   NOW() - INTERVAL '120 days'),
  (gen_random_uuid(), uid, pf_us, 'NVDA',  'NVIDIA',              'US', 'buy',       10, 146.00, 0,   'USD', '追加購入',           NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), uid, pf_us, 'MSFT',  'Microsoft',           'US', 'buy',       15, 420.00, 0,   'USD', '',                   NOW() - INTERVAL '75 days'),
  (gen_random_uuid(), uid, pf_us, 'MSFT',  'Microsoft',           'US', 'dividend',   0, 0.75,   0,   'USD', '四半期配当',         NOW() - INTERVAL '10 days'),
  (gen_random_uuid(), uid, pf_us, 'GOOGL', 'Alphabet',            'US', 'buy',       25, 175.00, 0,   'USD', '',                   NOW() - INTERVAL '50 days'),
  (gen_random_uuid(), uid, pf_us, 'AMZN',  'Amazon',              'US', 'buy',       18, 195.00, 0,   'USD', '',                   NOW() - INTERVAL '40 days');

  INSERT INTO invest_alerts (id, user_id, symbol, name, market, target_price, condition, enabled) VALUES
  (gen_random_uuid(), uid, 'NVDA',  'NVIDIA',              'US', 200.00, 'above', true),
  (gen_random_uuid(), uid, '9984',  'ソフトバンクグループ', 'JP', 7000,   'below', true),
  (gen_random_uuid(), uid, '4755',  '楽天グループ',        'JP', 1200,   'above', true);

  -- ============================================================
  -- 12. JOURNAL
  -- ============================================================
  INSERT INTO journal_entries (id, user_id, entry_date, title, content, mood, tags, auto_generated) VALUES
  ('je-1', uid, (NOW() - INTERVAL '0 days')::date,  '新機能のリリース日',
    '今日はダッシュボードの新機能をリリースした。ユーザーからの初期フィードバックは好評。パフォーマンスの改善が特に喜ばれた。夜はジムでトレーニング。',
    'happy', '{"仕事","リリース","運動"}', false),
  ('je-2', uid, (NOW() - INTERVAL '1 day')::date,   'クライアントミーティング',
    'フューチャーテックの佐藤さんとAI Chat Platformの進捗ミーティング。要件が一部変更になったが、スコープは管理可能。ランチは新しい蕎麦屋で。',
    'good', '{"仕事","ミーティング","ランチ"}', false),
  ('je-3', uid, (NOW() - INTERVAL '2 days')::date,  'リモートワークデー',
    'カフェで集中作業。API認証ミドルウェアの設計を完了。午後はRust入門の続きを読んだ。所有権システムが面白い。',
    'good', '{"仕事","学習","カフェ"}', false),
  ('je-4', uid, (NOW() - INTERVAL '3 days')::date,  '投資ポートフォリオ見直し',
    'NVIDIAが好決算で上昇。日本株は全体的に軟調。ソフトバンクGのAI投資戦略に注目。夕方は散歩。',
    'neutral', '{"投資","マーケット"}', false),
  ('je-5', uid, (NOW() - INTERVAL '4 days')::date,  'チームビルディング',
    '新しいフリーランスデザイナーとのオンラインMTG。スキルセットが高く、コラボが楽しみ。夜は友人と渋谷で食事。',
    'happy', '{"仕事","採用","友人"}', false),
  ('je-6', uid, (NOW() - INTERVAL '5 days')::date,  'バグ対応で忙しい日',
    '本番環境でRLSポリシーの不具合が発覚。緊急対応で3時間かかった。根本原因を特定し修正完了。ストレスフル。',
    'stressed', '{"仕事","バグ","障害対応"}', false),
  ('je-7', uid, (NOW() - INTERVAL '6 days')::date,  '週末の過ごし方',
    '午前中にジム。午後は技術書の読書。夕方から自宅でコーディング。新しいサイドプロジェクトのアイデアが浮かんだ。',
    'good', '{"運動","読書","サイドプロジェクト"}', false);

  -- ============================================================
  -- 13. GOOGLE CALENDAR EVENTS (demo data)
  -- ============================================================
  INSERT INTO google_calendar_events (user_id, google_email, event_id, calendar_id, calendar_name, summary, start_time, end_time, location, description, status, attendees) VALUES
  (uid, 'demo@hub-demo.com', 'evt-1', 'primary', 'メイン', 'チーム定例ミーティング',       NOW() + INTERVAL '1 day' + INTERVAL '10 hours',  NOW() + INTERVAL '1 day' + INTERVAL '11 hours',  'Google Meet',       'スプリント進捗確認',       'confirmed', '[{"email":"sato@futuretech.co.jp","displayName":"佐藤一郎","responseStatus":"accepted"}]'::jsonb),
  (uid, 'demo@hub-demo.com', 'evt-2', 'primary', 'メイン', 'クライアント打合せ（フューチャーテック）', NOW() + INTERVAL '2 days' + INTERVAL '14 hours', NOW() + INTERVAL '2 days' + INTERVAL '15 hours', '丸の内オフィス',    'AI Chat Platform仕様確認', 'confirmed', '[{"email":"sato@futuretech.co.jp","displayName":"佐藤一郎","responseStatus":"accepted"}]'::jsonb),
  (uid, 'demo@hub-demo.com', 'evt-3', 'primary', 'メイン', 'ランチMTG: デザインレビュー',   NOW() + INTERVAL '3 days' + INTERVAL '12 hours', NOW() + INTERVAL '3 days' + INTERVAL '13 hours', '渋谷カフェ',         'UIコンポーネント確認',     'confirmed', '[]'::jsonb),
  (uid, 'demo@hub-demo.com', 'evt-4', 'primary', 'メイン', '歯科検診',                     NOW() + INTERVAL '5 days' + INTERVAL '15 hours', NOW() + INTERVAL '5 days' + INTERVAL '16 hours', '恵比寿デンタルクリニック', '定期検診',          'confirmed', '[]'::jsonb),
  (uid, 'demo@hub-demo.com', 'evt-5', 'primary', 'メイン', 'AI Meetup Tokyo #42',          NOW() + INTERVAL '7 days' + INTERVAL '19 hours', NOW() + INTERVAL '7 days' + INTERVAL '21 hours', '六本木ヒルズ',       'LT発表: RAGの実践',        'confirmed', '[]'::jsonb),
  (uid, 'demo@hub-demo.com', 'evt-6', 'primary', 'メイン', '確定申告相談',                  NOW() + INTERVAL '4 days' + INTERVAL '10 hours', NOW() + INTERVAL '4 days' + INTERVAL '11 hours', '税理士事務所',       '2025年度分',               'confirmed', '[]'::jsonb),
  (uid, 'demo@hub-demo.com', 'evt-7', 'primary', 'メイン', '投資戦略ウェビナー',            NOW() + INTERVAL '6 days' + INTERVAL '20 hours', NOW() + INTERVAL '6 days' + INTERVAL '21 hours30minutes', 'Zoom',  'AI銘柄分析',               'tentative', '[]'::jsonb),
  (uid, 'demo@hub-demo.com', 'evt-8', 'primary', 'メイン', 'ジムトレーニング',              NOW() + INTERVAL '1 day'  + INTERVAL '18 hours', NOW() + INTERVAL '1 day'  + INTERVAL '19 hours30minutes', 'エニタイムフィットネス', '', 'confirmed', '[]'::jsonb);

  -- ============================================================
  -- 14. GMAIL MESSAGES (demo data)
  -- ============================================================
  INSERT INTO google_gmail_messages (user_id, google_email, message_id, thread_id, subject, snippet, sender, recipient, date, labels, is_unread, is_starred, is_read) VALUES
  (uid, 'demo@hub-demo.com', 'gm-1', 'th-1', 'AI Chat Platform 3月分請求書送付',    '3月分の開発費用の請求書を添付いたします...', 'demo@hub-demo.com', 'sato@futuretech.co.jp',  NOW() - INTERVAL '2 days', '{"SENT"}', false, false, true),
  (uid, 'demo@hub-demo.com', 'gm-2', 'th-2', 'Re: デザインレビューの件',            'コンポーネントの修正案を確認しました。フィードバック...',  'suzuki@globalmedia.jp', 'demo@hub-demo.com', NOW() - INTERVAL '1 day', '{"INBOX","UNREAD"}', true, false, false),
  (uid, 'demo@hub-demo.com', 'gm-3', 'th-3', '【AWS】ご利用料金のお知らせ',         'AWS利用料金 ¥25,430 のお支払いについて...',  'billing@aws.amazon.com', 'demo@hub-demo.com', NOW() - INTERVAL '3 days', '{"INBOX"}', false, false, true),
  (uid, 'demo@hub-demo.com', 'gm-4', 'th-4', 'AI Meetup Tokyo #42 登壇のお願い',    'LT枠での登壇をお願いできますでしょうか...',  'organizer@ai-meetup.tokyo', 'demo@hub-demo.com', NOW() - INTERVAL '5 days', '{"INBOX","STARRED"}', false, true, true),
  (uid, 'demo@hub-demo.com', 'gm-5', 'th-5', 'FinTech API Gateway 見積依頼',        '添付の要件定義書に基づき、見積もりをお願い...', 'takahashi@nextbank.jp', 'demo@hub-demo.com', NOW() - INTERVAL '4 days', '{"INBOX","IMPORTANT"}', false, true, true),
  (uid, 'demo@hub-demo.com', 'gm-6', 'th-6', 'GitHub: Security alert for repo',     'We found a potential security vulnerability in...', 'noreply@github.com', 'demo@hub-demo.com', NOW() - INTERVAL '1 day', '{"INBOX","UNREAD"}', true, false, false),
  (uid, 'demo@hub-demo.com', 'gm-7', 'th-7', 'Vercel: Deployment successful',       'Your project hub-demo has been deployed to...',  'notifications@vercel.com', 'demo@hub-demo.com', NOW() - INTERVAL '6 hours', '{"INBOX"}', false, false, true),
  (uid, 'demo@hub-demo.com', 'gm-8', 'th-8', 'SBI証券: 約定通知',                   'NVIDIA 10株の買付が約定しました...',  'info@sbisec.co.jp', 'demo@hub-demo.com', NOW() - INTERVAL '7 days', '{"INBOX"}', false, false, true),
  (uid, 'demo@hub-demo.com', 'gm-9', 'th-9', 'Re: NDA締結について',                 '署名済みのNDAを返送いたします...',  'demo@hub-demo.com', 'suzuki@globalmedia.jp', NOW() - INTERVAL '10 days', '{"SENT"}', false, false, true),
  (uid, 'demo@hub-demo.com', 'gm-10','th-10','週次レポート: AI Hub利用状況',          '今週のAI API利用状況レポートです...',  'system@techvision.jp', 'demo@hub-demo.com', NOW() - INTERVAL '2 days', '{"INBOX"}', false, false, true);

  -- ============================================================
  -- 15. AI HUB (sessions, messages)
  -- ============================================================
  INSERT INTO ai_sessions (id, user_id, title) VALUES
  (sess1, uid, 'TypeScript型パズルの相談'),
  (sess2, uid, 'マーケティング戦略のブレスト');

  INSERT INTO ai_messages (id, session_id, user_id, role, content) VALUES
  (gen_random_uuid(), sess1, uid, 'user',      'TypeScriptでconditional typesを使ってAPIレスポンスの型を動的に推論する方法を教えて'),
  (gen_random_uuid(), sess1, uid, 'assistant', '## Conditional Types でAPIレスポンスを型安全に\n\n```typescript\ntype ApiResponse<T extends string> = T extends "user"\n  ? { id: string; name: string; }\n  : T extends "post"\n  ? { id: string; title: string; body: string; }\n  : never;\n\nasync function fetchApi<T extends string>(endpoint: T): Promise<ApiResponse<T>> {\n  const res = await fetch(`/api/${endpoint}`);\n  return res.json();\n}\n```\n\nこれにより、`fetchApi("user")` の戻り値は自動的に `{ id: string; name: string }` と推論されます。'),
  (gen_random_uuid(), sess1, uid, 'user',      'なるほど！inferキーワードと組み合わせる方法もある？'),
  (gen_random_uuid(), sess1, uid, 'assistant', 'もちろんです！`infer` を使うとさらに柔軟な型推論が可能です。\n\n```typescript\ntype ExtractData<T> = T extends { data: infer D } ? D : never;\n\ntype Response = { data: { users: string[] }; error: null };\ntype Data = ExtractData<Response>; // { users: string[] }\n```'),
  (gen_random_uuid(), sess2, uid, 'user',      'AI SaaSプロダクトのPMF前のマーケティング戦略について相談したい'),
  (gen_random_uuid(), sess2, uid, 'assistant', '## PMF前のAI SaaSマーケティング戦略\n\n### 1. コンテンツマーケティング\n- 技術ブログでAI活用事例を発信\n- Zenn/Qiitaで開発者コミュニティにリーチ\n\n### 2. コミュニティ駆動\n- Discord/Slackでアーリーアダプターを集める\n- ベータ版のフィードバックループを構築\n\n### 3. プロダクトレッドグロース\n- フリーミアムモデルで利用体験を提供\n- 使用量ベースの課金で導入障壁を下げる'),
  (gen_random_uuid(), sess2, uid, 'user',      '開発者向けのコンテンツ戦略をもう少し具体的に'),
  (gen_random_uuid(), sess2, uid, 'assistant', '### 開発者向けコンテンツ戦略の詳細\n\n1. **テックブログ（週1）**: 実装の裏側、アーキテクチャ決定の理由\n2. **ハンズオン動画（月2）**: YouTube/Xでデモとチュートリアル\n3. **OSS貢献**: ツールのコア部分をOSS化してGitHubスターを獲得\n4. **登壇**: AI Meetup, JSConf等での技術LT\n5. **Xスレッド**: 開発日記を連載形式で投稿');

  -- ============================================================
  -- 16. AI AUTOMATIONS
  -- ============================================================
  INSERT INTO ai_automations (id, user_id, name, description, automation_type, config, schedule, scheduled_time, ai_model, enabled, last_run_at, last_run_status, linked_node_id) VALUES
  ('auto-1', uid, 'AI論文サーチ',       '最新のAI関連論文をarXivからスキャン',         'paper_search',    '{"prompt":"LLM, RAG, Agent"}'::jsonb,                                         'daily',   '08:00', 'gemini',     true,  NOW() - INTERVAL '1 day', 'success', 'rd-ai'),
  ('auto-2', uid, 'テックニュース収集', 'AI・テック業界の最新ニュースを収集',           'news_collection', '{"prompt":"AI, LLM, startup, funding"}'::jsonb,                               'daily',   '07:00', 'perplexity', true,  NOW() - INTERVAL '12 hours', 'success', 'knowledge-ai'),
  ('auto-3', uid, 'HP記事生成',         'ブログ記事のドラフトを自動生成',               'hp_post',         '{"prompt":"AI活用事例","category":"tech"}'::jsonb,                             'weekly',  '09:00', 'anthropic',  true,  NOW() - INTERVAL '3 days', 'success', 'pr-ai'),
  ('auto-4', uid, 'イベント探索',       'AI関連イベント・カンファレンスを検索',         'event_discovery', '{"keywords":["AI","LLM","機械学習"],"location":"東京","platforms":["peatix","luma"]}'::jsonb, 'weekly', '10:00', 'gemini', true, NOW() - INTERVAL '5 days', 'success', NULL),
  ('auto-5', uid, '株式分析レポート',   'ポートフォリオ銘柄の分析レポートを生成',       'stock_analysis',  '{"analysisType":"portfolio"}'::jsonb,                                          'weekly',  '18:00', 'gemini',     true,  NOW() - INTERVAL '2 days', 'success', 'invest-ai');

  INSERT INTO ai_automation_runs (id, automation_id, user_id, status, result, started_at, completed_at) VALUES
  ('run-1', 'auto-1', uid, 'success', '{"papers_found":12,"top_papers":["Attention is All You Need v2","Scaling Laws for LLM Agents"]}'::jsonb, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '30 seconds'),
  ('run-2', 'auto-2', uid, 'success', '{"articles_collected":8,"sources":["TechCrunch","The Verge","日経"]}'::jsonb, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours' + INTERVAL '15 seconds'),
  ('run-3', 'auto-3', uid, 'success', '{"title":"RAGパイプラインの実践的設計パターン","word_count":2500}'::jsonb, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '45 seconds'),
  ('run-4', 'auto-4', uid, 'success', '{"events_found":5,"upcoming":["AI Tokyo Summit","LLM Meetup #15"]}'::jsonb, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '20 seconds'),
  ('run-5', 'auto-5', uid, 'success', '{"analysis":"ポートフォリオは+3.2%。NVIDIAが牽引。"}'::jsonb, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '60 seconds');

  -- ============================================================
  -- 17. AI NOTIFICATIONS
  -- ============================================================
  INSERT INTO ai_notification_categories (id, user_id, name, color, icon, order_index) VALUES
  ('nc-system',  uid, 'システム',   'blue',   'Bell',       0),
  ('nc-ai',      uid, 'AI分析',     'purple', 'Bot',        1),
  ('nc-finance', uid, 'ファイナンス','green',  'Wallet',     2),
  ('nc-health',  uid, 'ヘルス',     'red',    'Heart',      3);

  INSERT INTO ai_notifications (id, user_id, category_id, source, priority, title, body, is_read) VALUES
  ('notif-1',  uid, 'nc-system',  'system',     'medium', 'デプロイ完了',                   'hub-demo が正常にデプロイされました（Build: 32s）', true),
  ('notif-2',  uid, 'nc-ai',      'automation', 'high',   'AI論文サーチ: 注目論文を発見',   '「LLM Agent Orchestration Framework」がトレンド入り。RAGとの統合パターンに関する新しい知見。', false),
  ('notif-3',  uid, 'nc-ai',      'automation', 'medium', 'テックニュース: AI業界動向',     'OpenAIが新モデルを発表。Anthropicがエンタープライズ機能を拡充。Google DeepMindのGemini 3.1が話題。', true),
  ('notif-4',  uid, 'nc-finance', 'automation', 'high',   'NVIDIA +5.2% 好決算',           'Q4決算が市場予想を上回りました。データセンター部門の売上が前年比+120%。', false),
  ('notif-5',  uid, 'nc-finance', 'system',     'medium', '請求書の支払期限: 3日後',        'INV-2026-002（グローバルメディア）の支払期限が近づいています。', false),
  ('notif-6',  uid, 'nc-health',  'system',     'low',    '今日の歩数: 8,432歩',            '目標10,000歩まであと1,568歩です。夕方の散歩をおすすめします。', true),
  ('notif-7',  uid, 'nc-ai',      'automation', 'medium', 'イベント発見: AI Tokyo Summit',  '4月15日開催。LLMのエンタープライズ活用がテーマ。早期割引あり。', false),
  ('notif-8',  uid, 'nc-system',  'system',     'low',    'バックアップ完了',               'データベースの定期バックアップが正常に完了しました。', true),
  ('notif-9',  uid, 'nc-finance', 'automation', 'medium', '週次ポートフォリオレポート',     '日本株: +1.8%, 米国株: +3.2%。NVIDIA, Microsoftが堅調。楽天が反発。', false),
  ('notif-10', uid, 'nc-health',  'system',     'medium', '睡眠スコア: 78/100',             '昨夜の睡眠時間: 6.5時間。深い睡眠が不足気味です。就寝時間を30分早めることを推奨。', true);

  -- ============================================================
  -- 18. AI COMPANY
  -- ============================================================
  INSERT INTO ai_company_orchestrations (id, user_id, task, target_group, result) VALUES
  (gen_random_uuid(), uid, '来週のスプリント計画を立てて', 'product-eng',
    '[{"agent":"AI PdM","action":"バックログ優先順位の整理","result":"5つのタスクを次スプリントに移動"},{"agent":"Tech Lead AI","action":"技術的リスクの評価","result":"認証系の改修に2日程度のリスクバッファを推奨"}]'::jsonb),
  (gen_random_uuid(), uid, 'Q2のマーケティング施策を提案して', 'growth',
    '[{"agent":"広報AI","action":"コンテンツカレンダー作成","result":"技術ブログ4本、SNS投稿20本の計画を策定"},{"agent":"セールスAI","action":"リード獲得チャネル分析","result":"開発者コミュニティ経由のリードが最もCVR高い"}]'::jsonb);

  INSERT INTO ai_company_messages (id, user_id, from_agent_id, to_agent_id, content, message_type) VALUES
  (gen_random_uuid(), uid, 'ai-pdm',      'techlead-ai',  'ダッシュボードUI改修の要件定義を添付しました。技術的な実現可能性を確認してください。', 'chat'),
  (gen_random_uuid(), uid, 'techlead-ai', 'ai-pdm',       'React Server Componentsを活用すれば初期ロード時間を40%削減できる見込みです。実装計画を作成します。', 'chat'),
  (gen_random_uuid(), uid, 'pr-ai',       'growth-ai',    '今月のブログ記事「RAGパイプラインの実践」が公開されました。SNS展開の計画をお願いします。', 'chat'),
  (gen_random_uuid(), uid, 'finance-ai',  'ceo',          '3月分の売上速報: ¥3,500,000（前月比+15%）。キャッシュフローは健全です。', 'chat'),
  (gen_random_uuid(), uid, 'cso-ai',      'ai-ops',       '競合分析: 国内AI SaaS市場で新規参入が3社確認されました。差別化ポイントの強化を提案します。', 'chat');

  INSERT INTO ai_company_posts (id, user_id, platform, content, agent_id, agent_name, topic, status) VALUES
  (gen_random_uuid(), uid, 'Zenn',     '# RAGパイプラインの実践的設計パターン\n\n本記事では、実プロダクトで運用中のRAGパイプラインの設計と実装について解説します...', 'pr-ai', '広報AI', 'RAG設計パターン',    'published'),
  (gen_random_uuid(), uid, 'X',        'AI SaaSプロダクトの開発で学んだ5つのこと:\n1. ユーザーフィードバックは最強のデータ\n2. LLMのコスト管理は初日から\n3. RAGは銀の弾丸ではない\n4. プロンプトエンジニアリングは職人技\n5. 信頼性 > 機能数', 'pr-ai', '広報AI', 'AI開発の学び', 'published'),
  (gen_random_uuid(), uid, 'note',     '## 個人開発のAIツール活用術\n\nCursor、Claude、ChatGPTを使い分けて生産性を最大化する方法をまとめました...', 'pr-ai', '広報AI', 'AIツール活用', 'generating');

  -- ============================================================
  -- 19. MEDIA (RSS feeds, X sources, media feed items)
  -- ============================================================
  INSERT INTO rss_feeds (id, user_id, name, url, category, is_active) VALUES
  ('rss-1', uid, 'TechCrunch',          'https://techcrunch.com/feed/',              'Tech',     true),
  ('rss-2', uid, 'The Verge',           'https://www.theverge.com/rss/index.xml',    'Tech',     true),
  ('rss-3', uid, 'Hacker News',         'https://hnrss.org/frontpage',               'Tech',     true),
  ('rss-4', uid, 'AI News',             'https://buttondown.email/ainews/rss',       'AI',       true),
  ('rss-5', uid, '日経テック',           'https://xtech.nikkei.com/rss/index.rdf',   'Business', true);

  INSERT INTO x_sources (id, user_id, name, source_type, query, category, is_active) VALUES
  ('xs-1', uid, 'OpenAI',       'account', '@OpenAI',          'AI',   true),
  ('xs-2', uid, 'Anthropic',    'account', '@AnthropicAI',     'AI',   true),
  ('xs-3', uid, 'AI Keyword',   'keyword', 'LLM OR "AI agent"','AI',   true),
  ('xs-4', uid, 'Tech Startup', 'keyword', 'スタートアップ 資金調達', 'Business', true);

  INSERT INTO media_feed_items (id, user_id, category_id, source, priority, title, body, metadata, is_read) VALUES
  ('mf-1',  uid, 'nc-ai', 'rss', 'medium', 'OpenAI unveils GPT-5 with reasoning capabilities',  'OpenAI has announced GPT-5, featuring significantly improved reasoning...', '{"source_name":"TechCrunch","url":"https://example.com/1"}'::jsonb, false),
  ('mf-2',  uid, 'nc-ai', 'rss', 'high',   'Anthropic raises $4B Series E at $60B valuation',   'Anthropic has raised a new round of funding, pushing its valuation...', '{"source_name":"The Verge","url":"https://example.com/2"}'::jsonb, false),
  ('mf-3',  uid, 'nc-ai', 'rss', 'medium', 'LLM Agents are the next big thing in enterprise AI', 'As enterprises adopt AI, agentic workflows are emerging as...', '{"source_name":"AI News","url":"https://example.com/3"}'::jsonb, true),
  ('mf-4',  uid, NULL,    'rss', 'low',    '日経: AI関連株が全面高、半導体需要堅調',              '東京株式市場でAI関連銘柄が軒並み上昇。NVIDIAの好決算を受けて...', '{"source_name":"日経テック","url":"https://example.com/4"}'::jsonb, true),
  ('mf-5',  uid, 'nc-ai', 'x',   'medium', '@AnthropicAI: Claude 4.5 is now available',          'We are excited to announce Claude 4.5 Opus and Sonnet...', '{"platform":"x","username":"@AnthropicAI"}'::jsonb, false),
  ('mf-6',  uid, 'nc-ai', 'x',   'low',    'Thread: LLM Agent Architecture Patterns',            '1/ Agent architectures are evolving rapidly. Here are the key patterns...', '{"platform":"x","username":"@ai_researcher"}'::jsonb, true),
  ('mf-7',  uid, NULL,    'rss', 'medium', 'Hacker News: Show HN - Open source RAG framework',   'I built an open source framework for production RAG pipelines...', '{"source_name":"Hacker News","url":"https://example.com/7"}'::jsonb, false),
  ('mf-8',  uid, NULL,    'rss', 'low',    'Vercel announces Fluid Compute GA',                   'Vercel has officially released Fluid Compute for general availability...', '{"source_name":"TechCrunch","url":"https://example.com/8"}'::jsonb, true);

  -- ============================================================
  -- 20. HEALTH (meals, supplements, metrics)
  -- ============================================================
  INSERT INTO health_meals (id, user_id, meal_type, eaten_at, calories, protein_g, carbs_g, fat_g, fiber_g, items, notes) VALUES
  ('hm-1', uid, 'breakfast', NOW() - INTERVAL '2 hours',   450, 25, 50, 15, 5,  '[{"name":"全粒粉トースト","calories":200},{"name":"スクランブルエッグ","calories":150},{"name":"バナナ","calories":100}]'::jsonb, '朝食'),
  ('hm-2', uid, 'lunch',     NOW() - INTERVAL '1 day' - INTERVAL '5 hours', 680, 35, 70, 22, 8,  '[{"name":"鶏胸肉のグリル","calories":300},{"name":"玄米","calories":250},{"name":"サラダ","calories":80},{"name":"味噌汁","calories":50}]'::jsonb, 'ヘルシーランチ'),
  ('hm-3', uid, 'dinner',    NOW() - INTERVAL '1 day' - INTERVAL '14 hours', 750, 40, 65, 30, 6, '[{"name":"サーモンの塩焼き","calories":350},{"name":"ご飯","calories":250},{"name":"ほうれん草のおひたし","calories":50},{"name":"豆腐の味噌汁","calories":100}]'::jsonb, '和食'),
  ('hm-4', uid, 'snack',     NOW() - INTERVAL '1 day' - INTERVAL '8 hours',  200, 20, 15, 8,  2,  '[{"name":"プロテインバー","calories":150},{"name":"アーモンド","calories":50}]'::jsonb, '午後のおやつ'),
  ('hm-5', uid, 'breakfast', NOW() - INTERVAL '1 day' - INTERVAL '2 hours',  380, 22, 45, 12, 4,  '[{"name":"オートミール","calories":180},{"name":"ヨーグルト","calories":100},{"name":"ブルーベリー","calories":50},{"name":"はちみつ","calories":50}]'::jsonb, '');

  INSERT INTO health_supplements (id, user_id, name, brand, dosage, frequency, active, notes) VALUES
  ('hs-1', uid, 'マルチビタミン',    'Nature Made',  '1錠/日',   'daily',    true,  '朝食後に服用'),
  ('hs-2', uid, 'ビタミンD3',        'NOW Foods',    '2000IU/日','daily',    true,  '冬季は増量'),
  ('hs-3', uid, 'フィッシュオイル',  'iHerb',        '1000mg/日','daily',    true,  'EPA/DHA'),
  ('hs-4', uid, 'プロテイン',        'MYPROTEIN',    '30g/回',   'daily',    true,  'トレーニング後');

  INSERT INTO health_metrics (id, user_id, metric_type, value, unit, recorded_at, source) VALUES
  (gen_random_uuid(), uid, 'steps',            8432,  'count',  NOW() - INTERVAL '1 hour',   'apple_watch'),
  (gen_random_uuid(), uid, 'heart_rate',       72,    'bpm',    NOW() - INTERVAL '30 minutes','apple_watch'),
  (gen_random_uuid(), uid, 'resting_heart_rate',58,   'bpm',    NOW() - INTERVAL '6 hours',   'apple_watch'),
  (gen_random_uuid(), uid, 'blood_oxygen',     98,    '%',      NOW() - INTERVAL '2 hours',   'apple_watch'),
  (gen_random_uuid(), uid, 'sleep_analysis',   6.5,   'hours',  NOW() - INTERVAL '8 hours',   'apple_watch'),
  (gen_random_uuid(), uid, 'active_energy',    420,   'kcal',   NOW() - INTERVAL '1 hour',    'apple_watch'),
  (gen_random_uuid(), uid, 'weight',           68.2,  'kg',     NOW() - INTERVAL '10 hours',  'shortcuts'),
  (gen_random_uuid(), uid, 'body_fat',         15.8,  '%',      NOW() - INTERVAL '10 hours',  'shortcuts'),
  (gen_random_uuid(), uid, 'steps',            10234, 'count',  NOW() - INTERVAL '1 day',     'apple_watch'),
  (gen_random_uuid(), uid, 'heart_rate',       68,    'bpm',    NOW() - INTERVAL '1 day',     'apple_watch'),
  (gen_random_uuid(), uid, 'sleep_analysis',   7.2,   'hours',  NOW() - INTERVAL '1 day' - INTERVAL '8 hours', 'apple_watch'),
  (gen_random_uuid(), uid, 'weight',           68.5,  'kg',     NOW() - INTERVAL '1 day' - INTERVAL '10 hours','shortcuts'),
  (gen_random_uuid(), uid, 'steps',            6890,  'count',  NOW() - INTERVAL '2 days',    'apple_watch'),
  (gen_random_uuid(), uid, 'sleep_analysis',   7.8,   'hours',  NOW() - INTERVAL '2 days' - INTERVAL '8 hours','apple_watch'),
  (gen_random_uuid(), uid, 'weight',           68.0,  'kg',     NOW() - INTERVAL '2 days' - INTERVAL '10 hours','shortcuts'),
  (gen_random_uuid(), uid, 'vo2_max',          45.2,  'mL/kg/min', NOW() - INTERVAL '3 days', 'apple_watch'),
  (gen_random_uuid(), uid, 'hrv',              42,    'ms',     NOW() - INTERVAL '6 hours',   'apple_watch'),
  (gen_random_uuid(), uid, 'respiratory_rate', 14,    'breaths/min', NOW() - INTERVAL '8 hours','apple_watch'),
  (gen_random_uuid(), uid, 'blood_pressure_systolic',  118, 'mmHg', NOW() - INTERVAL '1 day', 'manual'),
  (gen_random_uuid(), uid, 'blood_pressure_diastolic', 75,  'mmHg', NOW() - INTERVAL '1 day', 'manual');

  -- ============================================================
  -- 21. SWITCHBOT STATUS HISTORY
  -- ============================================================
  INSERT INTO switchbot_status_history (id, user_id, device_id, device_name, device_type, status, recorded_at) VALUES
  (gen_random_uuid(), uid, 'sb-hub2',    'リビング Hub 2',       'Hub 2',           '{"temperature":23.5,"humidity":45,"lightLevel":"bright"}'::jsonb,   NOW() - INTERVAL '30 minutes'),
  (gen_random_uuid(), uid, 'sb-hub2',    'リビング Hub 2',       'Hub 2',           '{"temperature":22.8,"humidity":47,"lightLevel":"dim"}'::jsonb,      NOW() - INTERVAL '6 hours'),
  (gen_random_uuid(), uid, 'sb-meter',   '書斎 温湿度計',        'Meter Plus',      '{"temperature":24.1,"humidity":42,"battery":85}'::jsonb,            NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), uid, 'sb-meter',   '書斎 温湿度計',        'Meter Plus',      '{"temperature":23.8,"humidity":44,"battery":85}'::jsonb,            NOW() - INTERVAL '7 hours'),
  (gen_random_uuid(), uid, 'sb-plug',    'デスクライト',          'Plug Mini (JP)',  '{"power":"on","voltage":101.2,"weight":0,"electricityOfDay":45}'::jsonb, NOW() - INTERVAL '2 hours'),
  (gen_random_uuid(), uid, 'sb-plug',    'デスクライト',          'Plug Mini (JP)',  '{"power":"off","voltage":0,"weight":0,"electricityOfDay":120}'::jsonb,   NOW() - INTERVAL '14 hours'),
  (gen_random_uuid(), uid, 'sb-lock',    '玄関ロック',            'Lock Pro',        '{"lockState":"locked","doorState":"close","battery":72}'::jsonb,    NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), uid, 'sb-lock',    '玄関ロック',            'Lock Pro',        '{"lockState":"unlocked","doorState":"open","battery":72}'::jsonb,   NOW() - INTERVAL '10 hours'),
  (gen_random_uuid(), uid, 'sb-curtain', 'リビングカーテン',      'Curtain3',        '{"slidePosition":100,"moving":false,"battery":65}'::jsonb,         NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), uid, 'sb-curtain', 'リビングカーテン',      'Curtain3',        '{"slidePosition":0,"moving":false,"battery":65}'::jsonb,           NOW() - INTERVAL '12 hours'),
  (gen_random_uuid(), uid, 'sb-bot',     'エアコンスイッチ',      'Bot',             '{"power":"on","battery":90}'::jsonb,                               NOW() - INTERVAL '4 hours'),
  (gen_random_uuid(), uid, 'sb-co2',     '書斎 CO2センサー',      'Meter Pro CO2',   '{"temperature":24.0,"humidity":43,"CO2":620,"battery":78}'::jsonb,  NOW() - INTERVAL '2 hours');

  -- ============================================================
  -- 22. LOCATION LOGS
  -- ============================================================
  INSERT INTO location_logs (id, user_id, lat, lng, accuracy, name, logged_at) VALUES
  (gen_random_uuid(), uid, 35.6594,  139.7005, 10, '渋谷区神宮前（自宅）',       NOW() - INTERVAL '2 hours'),
  (gen_random_uuid(), uid, 35.6812,  139.7671, 15, '千代田区丸の内（クライアント）', NOW() - INTERVAL '1 day' + INTERVAL '14 hours'),
  (gen_random_uuid(), uid, 35.6586,  139.7454, 12, '港区六本木（ミーティング）',  NOW() - INTERVAL '2 days' + INTERVAL '13 hours'),
  (gen_random_uuid(), uid, 35.6595,  139.7004, 8,  '渋谷区神宮前（自宅）',       NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), uid, 35.6614,  139.7041, 20, '渋谷区神宮前（カフェ）',     NOW() - INTERVAL '4 days' + INTERVAL '10 hours');

  -- ============================================================
  -- 23. USER SETTINGS & PREFERENCES
  -- ============================================================
  INSERT INTO user_settings (id, user_id, key, value) VALUES
  (gen_random_uuid(), uid, 'proactive_agent_settings', '{"enabled":true,"ai_model":"gemini","data_sources":{"tasks":true,"calendar":true,"gmail":true,"invoices":true,"switchbot":true,"projects":true,"memos":true,"media_feed":true,"automations":true,"journal":true,"subscriptions":true,"clients":true,"certifications":true,"assets":true},"push_high_only":true,"temperature":0.3,"max_insights":5,"max_tokens":2048,"category_cooldown_hours":6,"min_interval_minutes":30,"response_language":"ja","custom_instructions":"","team_mode":true,"agent_roles":{"taskmaster":{"enabled":true},"finance_ops":{"enabled":true},"wellness_coach":{"enabled":true},"tech_ops":{"enabled":true},"info_curator":{"enabled":true}}}'::jsonb),
  (gen_random_uuid(), uid, 'theme', '"system"'::jsonb),
  (gen_random_uuid(), uid, 'invoice_business_info', '{"companyName":"TechVision株式会社","name":"山田太郎","address":"東京都渋谷区神宮前1-2-3","phone":"03-xxxx-xxxx","email":"info@techvision.jp","bankName":"三菱UFJ銀行","bankBranch":"渋谷支店","accountType":"普通","accountNumber":"1234567","accountHolder":"テックビジョン（カ"}'::jsonb);

  INSERT INTO user_preferences (id, user_id, sidebar_order, mobile_nav_ids, mobile_more_ids) VALUES
  (gen_random_uuid(), uid,
    '["mi-home","mi-hub","mi-tasks","mi-memos","mi-calendar","mi-clients","mi-money","mi-journal","mi-projects","mi-ai","mi-media","mi-invest","mi-drive","mi-profile","mi-settings"]'::jsonb,
    '["mi-home","mi-tasks","mi-memos","mi-ai"]'::jsonb,
    '["mi-hub","mi-calendar","mi-clients","mi-money","mi-journal","mi-projects","mi-media","mi-invest","mi-drive","mi-profile","mi-settings"]'::jsonb
  );

  -- ============================================================
  -- 24. API COST TRACKING
  -- ============================================================
  INSERT INTO api_cost_limits (id, provider, daily_limit_usd, monthly_limit_usd, enabled) VALUES
  (gen_random_uuid(), 'gemini',     5.00, 100.00, true),
  (gen_random_uuid(), 'openai',     5.00, 80.00,  true),
  (gen_random_uuid(), 'anthropic',  5.00, 80.00,  true),
  (gen_random_uuid(), 'perplexity', 3.00, 50.00,  true);

  INSERT INTO api_usage_logs (id, provider, model, function_name, input_tokens, output_tokens, estimated_cost_usd, metadata, created_at) VALUES
  (gen_random_uuid(), 'gemini',     'gemini-3-pro-preview',   'ai_hub_chat',          1200, 800,  0.0032, '{"session":"chat"}'::jsonb,       NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), 'gemini',     'gemini-3-pro-preview',   'run_automation',       2500, 1500, 0.0064, '{"automation":"auto-1"}'::jsonb,  NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'anthropic',  'claude-sonnet-4-5',      'ai_hub_chat',          800,  600,  0.0042, '{"session":"chat"}'::jsonb,       NOW() - INTERVAL '2 hours'),
  (gen_random_uuid(), 'anthropic',  'claude-sonnet-4-5',      'run_automation',       3000, 2000, 0.0150, '{"automation":"auto-3"}'::jsonb,  NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'perplexity', 'sonar-reasoning-pro',    'run_automation',       1500, 1200, 0.0081, '{"automation":"auto-2"}'::jsonb,  NOW() - INTERVAL '12 hours'),
  (gen_random_uuid(), 'openai',     'gpt-5.2',               'ai_hub_chat',          1000, 700,  0.0051, '{"session":"chat"}'::jsonb,       NOW() - INTERVAL '4 hours'),
  (gen_random_uuid(), 'gemini',     'gemini-3-pro-preview',   'proactive_agent',     3500, 2500, 0.0096, '{"agent":"proactive"}'::jsonb,    NOW() - INTERVAL '6 hours'),
  (gen_random_uuid(), 'gemini',     'gemini-3-pro-preview',   'generate_journal',    2000, 1800, 0.0061, '{"type":"journal"}'::jsonb,       NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'gemini',     'gemini-3-pro-preview',   'health_ai',           1800, 1200, 0.0048, '{"type":"meal_analysis"}'::jsonb, NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), 'anthropic',  'claude-sonnet-4-5',      'run_automation',       2200, 1800, 0.0120, '{"automation":"auto-5"}'::jsonb,  NOW() - INTERVAL '2 days');

  RAISE NOTICE 'Demo seed data inserted successfully for user %', uid;
END $$;
