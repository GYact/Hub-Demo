import { useState, useEffect, useCallback } from "react";
import { Newspaper, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import type { StockNews } from "../../types";

interface NewsTabProps {
  symbols: string[];
  fetchNews: (symbols: string[]) => Promise<StockNews[]>;
}

export const NewsTab = ({ symbols, fetchNews }: NewsTabProps) => {
  const [news, setNews] = useState<StockNews[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadNews = useCallback(async () => {
    if (symbols.length === 0) return;
    setIsLoading(true);
    try {
      const data = await fetchNews(symbols);
      setNews(data);
    } finally {
      setIsLoading(false);
    }
  }, [symbols, fetchNews]);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium neu-text-primary flex items-center gap-2">
          <Newspaper size={16} /> 関連ニュース
        </h3>
        <button
          onClick={() => void loadNews()}
          disabled={isLoading}
          className="p-2 neu-btn rounded-lg neu-text-muted hover:neu-text-secondary disabled:opacity-40"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>

      {symbols.length === 0 && (
        <div className="neu-card p-8 text-center text-sm neu-text-muted">
          保有銘柄・ウォッチリストに銘柄を追加するとニュースが表示されます
        </div>
      )}

      {isLoading && news.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin neu-text-muted" />
        </div>
      )}

      <div className="space-y-2">
        {news.map((item, idx) => (
          <a
            key={`${item.link}-${idx}`}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="neu-card p-3 flex gap-3 hover:shadow-md transition-shadow group"
          >
            {item.thumbnail && (
              <img
                src={item.thumbnail}
                alt=""
                className="w-16 h-16 rounded-lg object-cover shrink-0"
                loading="lazy"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium neu-text-primary group-hover:text-blue-600 line-clamp-2">
                {item.title}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs neu-text-muted">
                <span>{item.publisher}</span>
                {item.publishedAt && (
                  <>
                    <span>·</span>
                    <span>
                      {new Date(item.publishedAt).toLocaleDateString("ja-JP")}
                    </span>
                  </>
                )}
              </div>
              {item.relatedSymbols.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {item.relatedSymbols.slice(0, 3).map((sym) => (
                    <span
                      key={sym}
                      className="text-[10px] px-1 py-0.5 rounded bg-slate-200 font-mono neu-text-muted"
                    >
                      {sym}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ExternalLink
              size={14}
              className="shrink-0 neu-text-muted group-hover:text-blue-600 mt-1"
            />
          </a>
        ))}
      </div>
    </div>
  );
};
