-- Chart drawing annotations for invest page
create table if not exists invest_chart_drawings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  tool        text not null default 'pin',
  points      jsonb not null default '[]'::jsonb,
  color       text not null default '#3b82f6',
  label       text not null default '',
  note        text not null default '',
  line_width  smallint not null default 1,
  line_style  text not null default 'solid',
  visible     boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Index for fast per-user, per-symbol lookup
create index if not exists idx_invest_chart_drawings_user_symbol
  on invest_chart_drawings(user_id, symbol);

-- RLS
alter table invest_chart_drawings enable row level security;

create policy "Users can manage own chart drawings"
  on invest_chart_drawings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable realtime
alter publication supabase_realtime add table invest_chart_drawings;
