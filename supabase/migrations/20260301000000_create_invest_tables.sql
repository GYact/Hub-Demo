-- =============================================
-- invest_portfolios テーブル
-- =============================================
CREATE TABLE IF NOT EXISTS invest_portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'JPY',
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invest_portfolios_user ON invest_portfolios(user_id);

ALTER TABLE invest_portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_portfolios"
  ON invest_portfolios FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- invest_holdings テーブル
-- =============================================
CREATE TABLE IF NOT EXISTS invest_holdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  portfolio_id UUID REFERENCES invest_portfolios(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL DEFAULT 'JP'
    CHECK (market IN ('JP', 'US')),
  quantity NUMERIC(18, 6) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(18, 6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JPY',
  notes TEXT NOT NULL DEFAULT '',
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invest_holdings_user ON invest_holdings(user_id);
CREATE INDEX idx_invest_holdings_portfolio ON invest_holdings(portfolio_id);
CREATE INDEX idx_invest_holdings_symbol ON invest_holdings(user_id, symbol);

ALTER TABLE invest_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_holdings"
  ON invest_holdings FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================
-- invest_watchlist テーブル
-- =============================================
CREATE TABLE IF NOT EXISTS invest_watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL DEFAULT 'JP'
    CHECK (market IN ('JP', 'US')),
  notes TEXT NOT NULL DEFAULT '',
  order_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invest_watchlist_user ON invest_watchlist(user_id);

ALTER TABLE invest_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_watchlist"
  ON invest_watchlist FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
