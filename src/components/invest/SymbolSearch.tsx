import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import type { InvestMarket } from "../../types";

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  market: "JP" | "US";
}

interface SymbolSearchProps {
  onSelect: (symbol: string, name: string, market: InvestMarket) => void;
  searchFn: (query: string) => Promise<SearchResult[]>;
  placeholder?: string;
}

export const SymbolSearch = ({
  onSelect,
  searchFn,
  placeholder = "銘柄を検索...",
}: SymbolSearchProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await searchFn(q);
        setResults(res);
        setIsOpen(res.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [searchFn],
  );

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (item: SearchResult) => {
    onSelect(item.symbol, item.name, item.market);
    setQuery(item.symbol);
    setIsOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 neu-text-muted"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="neu-input w-full pl-9 pr-8 py-2 rounded-xl text-sm"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 neu-text-muted hover:neu-text-secondary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full neu-card rounded-xl max-h-64 overflow-y-auto">
          {isSearching ? (
            <div className="p-3 text-center text-sm neu-text-muted">
              検索中...
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.symbol}
                onClick={() => handleSelect(item)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
              >
                <span className="font-mono font-medium text-sm neu-text-primary">
                  {item.symbol}
                </span>
                <span className="flex-1 text-sm neu-text-secondary truncate">
                  {item.name}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    item.market === "JP"
                      ? "bg-red-50 text-red-600"
                      : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {item.market}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
