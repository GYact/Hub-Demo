import { useState, useCallback, useRef } from "react";
import { Upload, FileText, X, AlertTriangle, Check } from "lucide-react";
import type { InvestMarket } from "../../types";

/** Parsed holding from CSV */
export interface CsvHolding {
  symbol: string;
  name: string;
  market: InvestMarket;
  quantity: number;
  avgCost: number;
}

// --- SBI CSV Parser ---

/** Detect column index by partial header match */
const findCol = (headers: string[], ...candidates: string[]): number =>
  headers.findIndex((h) => candidates.some((c) => h.includes(c)));

/**
 * Extract 4-digit stock code from a cell like "7203 トヨタ自動車" or "(7203)トヨタ自動車"
 * SBI CSV often combines code + name in one cell or has separate columns
 */
const extractCode = (text: string): { code: string; name: string } | null => {
  // Pattern: "7203 トヨタ自動車" or "7203　トヨタ自動車" (full-width space)
  const m1 = text.match(/^(\d{4})\s+(.+)/);
  if (m1) return { code: m1[1], name: m1[2].trim() };

  // Pattern: "(7203)トヨタ自動車" or "（7203）トヨタ自動車"
  const m2 = text.match(/[（(](\d{4})[）)]\s*(.+)/);
  if (m2) return { code: m2[1], name: m2[2].trim() };

  // Pattern: just a 4-digit code
  const m3 = text.match(/^(\d{4})$/);
  if (m3) return { code: m3[1], name: "" };

  return null;
};

/** Parse number, removing commas and full-width chars */
const parseNum = (s: string): number => {
  const cleaned = s
    .replace(/[，,]/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

/** Decode a File as Shift-JIS text */
const readAsShiftJIS = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "Shift_JIS");
  });

/** Also try UTF-8 as fallback */
const readAsUTF8 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "UTF-8");
  });

/** Simple CSV line parser (handles quoted fields) */
const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
};

/**
 * Parse SBI証券 CSV into holdings.
 * SBI CSV structure:
 *   - Multiple sections separated by blank lines or section headers
 *   - Section headers like "株式（現物/特定預り）" etc.
 *   - Column headers in the row after section header
 *   - Typical columns: 銘柄(or 銘柄コード+銘柄名), 数量(or 保有株数), 取得単価(or 取得価格), etc.
 */
export const parseSbiCsv = (text: string): CsvHolding[] => {
  const lines = text.split(/\r?\n/);
  const holdings: CsvHolding[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Detect section header for stock holdings
    const isStockSection =
      line.includes("株式") &&
      (line.includes("現物") || line.includes("信用") || line.includes("NISA"));

    // Check if this line looks like a column header
    const cells = parseCsvLine(line);
    const hasCodeCol = cells.some(
      (c) => c.includes("銘柄コード") || c.includes("コード"),
    );
    const hasNameCol = cells.some((c) => c === "銘柄" || c.includes("銘柄名"));
    const hasMergedCol = cells.some(
      (c) => c.includes("銘柄") && !c.includes("コード") && !c.includes("名"),
    );
    const hasQtyCol = cells.some(
      (c) =>
        c.includes("数量") || c.includes("保有株数") || c.includes("保有数"),
    );
    const hasCostCol = cells.some(
      (c) =>
        c.includes("取得単価") ||
        c.includes("取得価格") ||
        c.includes("平均取得"),
    );

    // If this is a section header line but not column headers, advance
    if (isStockSection && !hasQtyCol) {
      i++;
      continue;
    }

    // If we found column headers (need qty column + some identifier column)
    if (
      (hasQtyCol || hasCostCol) &&
      (hasCodeCol || hasNameCol || hasMergedCol)
    ) {
      const headers = cells;
      const codeIdx = findCol(headers, "銘柄コード", "コード");
      const nameIdx = findCol(headers, "銘柄名");
      const mergedIdx = hasMergedCol
        ? headers.findIndex(
            (h) =>
              h.includes("銘柄") &&
              !h.includes("コード") &&
              !h.includes("名") &&
              !h.includes("数"),
          )
        : -1;
      const qtyIdx = findCol(headers, "数量", "保有株数", "保有数");
      const costIdx = findCol(headers, "取得単価", "取得価格", "平均取得");

      // Parse data rows until we hit an empty line, section header, or "合計" row
      i++;
      while (i < lines.length) {
        const dataLine = lines[i].trim();
        if (
          !dataLine ||
          dataLine.startsWith("合計") ||
          dataLine.startsWith("---")
        )
          break;

        const dataCells = parseCsvLine(dataLine);

        // Check if this is another section header
        if (
          dataCells[0]?.includes("株式") ||
          dataCells[0]?.includes("投資信託") ||
          dataCells[0]?.includes("債券")
        )
          break;

        let code = "";
        let name = "";

        // Try separate code + name columns
        if (codeIdx >= 0) {
          const raw = dataCells[codeIdx] || "";
          const m = raw.match(/\d{4}/);
          if (m) code = m[0];
          name = nameIdx >= 0 ? dataCells[nameIdx] || "" : "";
        }

        // Try merged "銘柄" column
        if (!code && mergedIdx >= 0) {
          const extracted = extractCode(dataCells[mergedIdx] || "");
          if (extracted) {
            code = extracted.code;
            name =
              extracted.name || (nameIdx >= 0 ? dataCells[nameIdx] || "" : "");
          }
        }

        // Fallback: try extracting code from first cell
        if (!code) {
          const extracted = extractCode(dataCells[0] || "");
          if (extracted) {
            code = extracted.code;
            name = extracted.name || dataCells[1] || "";
          }
        }

        if (code) {
          const qty = qtyIdx >= 0 ? parseNum(dataCells[qtyIdx] || "0") : 0;
          const cost = costIdx >= 0 ? parseNum(dataCells[costIdx] || "0") : 0;

          holdings.push({
            symbol: `${code}.T`,
            name,
            market: "JP",
            quantity: qty,
            avgCost: cost,
          });
        }

        i++;
      }
      continue;
    }

    // For generic CSV (non-SBI format): try auto-detect any CSV with stock codes
    // Look for rows that start with a 4-digit number
    if (!isStockSection && !hasQtyCol) {
      const extracted = extractCode(cells[0] || "");
      if (extracted && cells.length >= 3) {
        const name = extracted.name || cells[1] || "";
        // Try to find numeric columns for quantity and cost
        const numericCols = cells.slice(1).map((c) => parseNum(c));
        const qty = numericCols.find((n) => n > 0 && n === Math.floor(n)) || 0;
        const cost =
          numericCols.find((n) => n > 0 && n !== qty && n !== Math.floor(n)) ||
          numericCols.find((n) => n > qty) ||
          0;

        if (qty > 0) {
          holdings.push({
            symbol: `${extracted.code}.T`,
            name,
            market: "JP",
            quantity: qty,
            avgCost: cost,
          });
        }
      }
    }

    i++;
  }

  return holdings;
};

// --- UI Component ---

interface CsvImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (holdings: CsvHolding[], portfolioName: string) => Promise<void>;
}

export const CsvImportDialog = ({
  isOpen,
  onClose,
  onImport,
}: CsvImportDialogProps) => {
  const [parsed, setParsed] = useState<CsvHolding[]>([]);
  const [portfolioName, setPortfolioName] = useState("SBI証券");
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setParsed([]);
    setFileName(file.name);

    try {
      // Try Shift-JIS first (SBI default), then UTF-8
      let text: string;
      try {
        text = await readAsShiftJIS(file);
        // If it looks garbled, try UTF-8
        if (text.includes("�")) {
          text = await readAsUTF8(file);
        }
      } catch {
        text = await readAsUTF8(file);
      }

      const holdings = parseSbiCsv(text);
      if (holdings.length === 0) {
        setError(
          "銘柄データが見つかりませんでした。SBI証券の保有証券CSVをアップロードしてください。",
        );
        return;
      }
      setParsed(holdings);
    } catch (e) {
      setError(`ファイルの読み込みに失敗しました: ${e}`);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    if (parsed.length === 0) return;
    setIsImporting(true);
    try {
      await onImport(parsed, portfolioName);
      onClose();
    } catch (e) {
      setError(`インポートに失敗しました: ${e}`);
    } finally {
      setIsImporting(false);
    }
  }, [parsed, portfolioName, onImport, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="neu-card w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200/50">
          <h3 className="font-medium neu-text-primary flex items-center gap-2">
            <Upload size={18} /> CSVインポート
          </h3>
          <button
            onClick={onClose}
            className="p-1 neu-text-muted hover:neu-text-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-auto flex-1">
          {/* Portfolio name */}
          <div>
            <label className="text-xs neu-text-muted block mb-1">
              ポートフォリオ名
            </label>
            <input
              type="text"
              value={portfolioName}
              onChange={(e) => setPortfolioName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg neu-inset neu-text-primary outline-none"
              placeholder="SBI証券"
            />
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
          >
            <FileText size={32} className="mx-auto mb-2 neu-text-muted" />
            <p className="text-sm neu-text-secondary">
              {fileName ||
                "CSVファイルをドラッグ＆ドロップ、またはクリックして選択"}
            </p>
            <p className="text-xs neu-text-muted mt-1">
              SBI証券「保有証券」→「CSVダウンロード」で取得したファイル
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <div>
              <div className="text-xs font-medium neu-text-secondary mb-2">
                {parsed.length} 銘柄を検出
              </div>
              <div className="max-h-48 overflow-auto rounded-lg border border-slate-200/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100/50 sticky top-0">
                      <th className="text-left px-3 py-1.5 neu-text-muted">
                        コード
                      </th>
                      <th className="text-left px-3 py-1.5 neu-text-muted">
                        銘柄名
                      </th>
                      <th className="text-right px-3 py-1.5 neu-text-muted">
                        数量
                      </th>
                      <th className="text-right px-3 py-1.5 neu-text-muted">
                        取得単価
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((h, idx) => (
                      <tr
                        key={`${h.symbol}-${idx}`}
                        className="border-t border-slate-100/50"
                      >
                        <td className="px-3 py-1.5 font-mono neu-text-primary">
                          {h.symbol}
                        </td>
                        <td className="px-3 py-1.5 neu-text-secondary truncate max-w-[160px]">
                          {h.name}
                        </td>
                        <td className="px-3 py-1.5 text-right neu-text-primary">
                          {h.quantity.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right neu-text-primary">
                          {h.avgCost > 0
                            ? h.avgCost.toLocaleString("ja-JP", {
                                maximumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {parsed.length > 0 && (
          <div className="p-4 border-t border-slate-200/50 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl neu-chip neu-text-secondary"
            >
              キャンセル
            </button>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="px-4 py-2 text-sm rounded-xl neu-btn text-blue-600 font-medium flex items-center gap-2"
            >
              <Check size={14} />
              {isImporting
                ? "インポート中..."
                : `${parsed.length} 銘柄をインポート`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
