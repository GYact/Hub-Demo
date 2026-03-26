-- invest_transactions テーブル
CREATE TABLE IF NOT EXISTS invest_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  portfolio_id UUID REFERENCES invest_portfolios(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL DEFAULT 'JP' CHECK (market IN ('JP', 'US')),
  type TEXT NOT NULL DEFAULT 'buy' CHECK (type IN ('buy', 'sell', 'dividend')),
  quantity NUMERIC(18, 6) NOT NULL DEFAULT 0,
  price NUMERIC(18, 6) NOT NULL DEFAULT 0,
  fee NUMERIC(18, 6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JPY',
  notes TEXT NOT NULL DEFAULT '',
  transacted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invest_transactions_user ON invest_transactions(user_id);
CREATE INDEX idx_invest_transactions_portfolio ON invest_transactions(portfolio_id);
CREATE INDEX idx_invest_transactions_symbol ON invest_transactions(user_id, symbol);
CREATE INDEX idx_invest_transactions_date ON invest_transactions(user_id, transacted_at DESC);

ALTER TABLE invest_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_transactions"
  ON invest_transactions FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- invest_alerts テーブル
CREATE TABLE IF NOT EXISTS invest_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL DEFAULT 'JP' CHECK (market IN ('JP', 'US')),
  target_price NUMERIC(18, 6) NOT NULL,
  condition TEXT NOT NULL DEFAULT 'above' CHECK (condition IN ('above', 'below')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invest_alerts_user ON invest_alerts(user_id);
CREATE INDEX idx_invest_alerts_active ON invest_alerts(user_id, enabled) WHERE enabled = true;

ALTER TABLE invest_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_alerts"
  ON invest_alerts FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
