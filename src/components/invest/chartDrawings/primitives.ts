/**
 * Chart drawing primitives for lightweight-charts v5.
 * Each primitive implements ISeriesPrimitive and draws on the chart canvas.
 */
import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  SeriesType,
  IChartApiBase,
  ISeriesApi,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { InvestChartDrawing, DrawingPoint } from "./types";

// --- Helpers ---
const setLineDash = (
  ctx: CanvasRenderingContext2D,
  style: string,
  scale: number,
) => {
  if (style === "dashed") ctx.setLineDash([6 * scale, 4 * scale]);
  else if (style === "dotted") ctx.setLineDash([2 * scale, 3 * scale]);
  else ctx.setLineDash([]);
};

// Fibonacci levels
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

// --- Base Primitive Class ---
abstract class DrawingPrimitive implements ISeriesPrimitive<Time> {
  protected _chart: IChartApiBase<Time> | null = null;
  protected _series: ISeriesApi<SeriesType, Time> | null = null;
  protected _requestUpdate: (() => void) | null = null;
  protected _paneViews: IPrimitivePaneView[] = [];

  constructor(protected _drawing: InvestChartDrawing) {}

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._updateViews();
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {
    this._updateViews();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  update(drawing: InvestChartDrawing): void {
    this._drawing = drawing;
    this._updateViews();
    this._requestUpdate?.();
  }

  protected abstract _updateViews(): void;

  protected _toX(time: number): number | null {
    if (!this._chart) return null;
    return this._chart.timeScale().timeToCoordinate(time as unknown as Time);
  }

  protected _toY(price: number): number | null {
    if (!this._series) return null;
    return this._series.priceToCoordinate(price);
  }
}

// --- Generic PaneView / Renderer ---
class DrawingPaneView implements IPrimitivePaneView {
  constructor(private _renderer: IPrimitivePaneRenderer) {}
  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

// --- Trend Line ---
class TrendLineRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _getCoords: () => {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    } | null,
    private _color: string,
    private _lineWidth: number,
    private _lineStyle: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const coords = this._getCoords();
    if (!coords) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const scale = scope.horizontalPixelRatio;
      ctx.beginPath();
      ctx.strokeStyle = this._color;
      ctx.lineWidth = this._lineWidth * scale;
      setLineDash(ctx, this._lineStyle, scale);
      ctx.moveTo(coords.x1 * scale, coords.y1 * scope.verticalPixelRatio);
      ctx.lineTo(coords.x2 * scale, coords.y2 * scope.verticalPixelRatio);
      ctx.stroke();
    });
  }
}

export class TrendLinePrimitive extends DrawingPrimitive {
  private _x1 = 0;
  private _y1 = 0;
  private _x2 = 0;
  private _y2 = 0;

  protected _updateViews(): void {
    const [p1, p2] = this._drawing.points;
    if (!p1 || !p2) return;
    const x1 = this._toX(p1.time);
    const y1 = this._toY(p1.price);
    const x2 = this._toX(p2.time);
    const y2 = this._toY(p2.price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return;
    this._x1 = x1;
    this._y1 = y1;
    this._x2 = x2;
    this._y2 = y2;
    this._paneViews = [
      new DrawingPaneView(
        new TrendLineRenderer(
          () => ({
            x1: this._x1,
            y1: this._y1,
            x2: this._x2,
            y2: this._y2,
          }),
          this._drawing.color,
          this._drawing.lineWidth,
          this._drawing.lineStyle,
        ),
      ),
    ];
  }
}

// --- Horizontal Line ---
class HorizontalLineRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _getY: () => number | null,
    private _color: string,
    private _lineWidth: number,
    private _lineStyle: string,
    private _label: string,
    private _price: number,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const y = this._getY();
    if (y == null) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const scale = scope.horizontalPixelRatio;
      const vScale = scope.verticalPixelRatio;
      const w = scope.bitmapSize.width;
      const yScaled = y * vScale;

      ctx.beginPath();
      ctx.strokeStyle = this._color;
      ctx.lineWidth = this._lineWidth * scale;
      setLineDash(ctx, this._lineStyle, scale);
      ctx.moveTo(0, yScaled);
      ctx.lineTo(w, yScaled);
      ctx.stroke();

      // Price label
      const text =
        this._label ||
        this._price.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
      ctx.font = `${11 * scale}px sans-serif`;
      const metrics = ctx.measureText(text);
      const pad = 4 * scale;
      ctx.fillStyle = this._color;
      ctx.fillRect(
        w - metrics.width - pad * 3,
        yScaled - 8 * vScale,
        metrics.width + pad * 2,
        16 * vScale,
      );
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w - metrics.width - pad * 2, yScaled);
    });
  }
}

export class HorizontalLinePrimitive extends DrawingPrimitive {
  private _y: number | null = null;

  protected _updateViews(): void {
    const p = this._drawing.points[0];
    if (!p) return;
    this._y = this._toY(p.price);
    this._paneViews = [
      new DrawingPaneView(
        new HorizontalLineRenderer(
          () => this._y,
          this._drawing.color,
          this._drawing.lineWidth,
          this._drawing.lineStyle,
          this._drawing.label,
          p.price,
        ),
      ),
    ];
  }
}

// --- Fibonacci Retracement ---
class FibonacciRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _getLevels: () =>
      | { y: number; level: number; price: number }[]
      | null,
    private _color: string,
    private _lineWidth: number,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const levels = this._getLevels();
    if (!levels) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const scale = scope.horizontalPixelRatio;
      const vScale = scope.verticalPixelRatio;
      const w = scope.bitmapSize.width;

      for (const { y, level, price } of levels) {
        const yScaled = y * vScale;
        // Fill between levels
        ctx.beginPath();
        ctx.strokeStyle = this._color;
        ctx.lineWidth = this._lineWidth * scale;
        ctx.globalAlpha = level === 0 || level === 1 ? 0.8 : 0.5;
        setLineDash(ctx, level === 0.5 ? "dashed" : "solid", scale);
        ctx.moveTo(0, yScaled);
        ctx.lineTo(w, yScaled);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Label
        const text = `${(level * 100).toFixed(1)}% (${price.toLocaleString("ja-JP", { maximumFractionDigits: 2 })})`;
        ctx.font = `${10 * scale}px sans-serif`;
        ctx.fillStyle = this._color;
        ctx.textBaseline = "bottom";
        ctx.fillText(text, 4 * scale, yScaled - 2 * vScale);
      }
    });
  }
}

export class FibonacciPrimitive extends DrawingPrimitive {
  private _levels: { y: number; level: number; price: number }[] = [];

  protected _updateViews(): void {
    const [p1, p2] = this._drawing.points;
    if (!p1 || !p2) return;
    const high = Math.max(p1.price, p2.price);
    const low = Math.min(p1.price, p2.price);
    const range = high - low;
    if (range === 0) return;

    this._levels = FIB_LEVELS.map((level) => {
      const price = high - range * level;
      const y = this._toY(price);
      return { y: y ?? 0, level, price };
    }).filter((l) => l.y !== 0);

    this._paneViews = [
      new DrawingPaneView(
        new FibonacciRenderer(
          () => (this._levels.length > 0 ? this._levels : null),
          this._drawing.color,
          this._drawing.lineWidth,
        ),
      ),
    ];
  }
}

// --- Range Highlight ---
class RangeRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _getRect: () => {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    } | null,
    private _color: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const rect = this._getRect();
    if (!rect) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hScale = scope.horizontalPixelRatio;
      const vScale = scope.verticalPixelRatio;
      const x = Math.min(rect.x1, rect.x2) * hScale;
      const y = Math.min(rect.y1, rect.y2) * vScale;
      const w = Math.abs(rect.x2 - rect.x1) * hScale;
      const h = Math.abs(rect.y2 - rect.y1) * vScale;

      ctx.fillStyle = this._color;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = this._color;
      ctx.lineWidth = 1 * hScale;
      ctx.strokeRect(x, y, w, h);
    });
  }
}

export class RangeHighlightPrimitive extends DrawingPrimitive {
  private _x1 = 0;
  private _y1 = 0;
  private _x2 = 0;
  private _y2 = 0;

  protected _updateViews(): void {
    const [p1, p2] = this._drawing.points;
    if (!p1 || !p2) return;
    const x1 = this._toX(p1.time);
    const y1 = this._toY(p1.price);
    const x2 = this._toX(p2.time);
    const y2 = this._toY(p2.price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return;
    this._x1 = x1;
    this._y1 = y1;
    this._x2 = x2;
    this._y2 = y2;
    this._paneViews = [
      new DrawingPaneView(
        new RangeRenderer(
          () => ({
            x1: this._x1,
            y1: this._y1,
            x2: this._x2,
            y2: this._y2,
          }),
          this._drawing.color,
        ),
      ),
    ];
  }
}

// --- Text Annotation ---
class TextRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _getPos: () => { x: number; y: number } | null,
    private _text: string,
    private _color: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const pos = this._getPos();
    if (!pos || !this._text) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hScale = scope.horizontalPixelRatio;
      const vScale = scope.verticalPixelRatio;
      const x = pos.x * hScale;
      const y = pos.y * vScale;

      ctx.font = `bold ${12 * hScale}px sans-serif`;
      const metrics = ctx.measureText(this._text);
      const pad = 4 * hScale;
      const vPad = 3 * vScale;

      // Background
      ctx.fillStyle = this._color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const rx = 3 * hScale;
      const bx = x - pad;
      const by = y - 14 * vScale;
      const bw = metrics.width + pad * 2;
      const bh = 18 * vScale;
      ctx.roundRect(bx, by, bw, bh, rx);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Text
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(this._text, x, y - (14 * vScale) / 2 + vPad);
    });
  }
}

export class TextAnnotationPrimitive extends DrawingPrimitive {
  private _x: number | null = null;
  private _y: number | null = null;

  protected _updateViews(): void {
    const p = this._drawing.points[0];
    if (!p) return;
    this._x = this._toX(p.time);
    this._y = this._toY(p.price);
    this._paneViews = [
      new DrawingPaneView(
        new TextRenderer(
          () =>
            this._x != null && this._y != null
              ? { x: this._x, y: this._y }
              : null,
          this._drawing.label,
          this._drawing.color,
        ),
      ),
    ];
  }
}

// --- Measure Tool ---
class MeasureRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _getCoords: () => {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    } | null,
    private _p1: DrawingPoint,
    private _p2: DrawingPoint,
    private _color: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const coords = this._getCoords();
    if (!coords) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hScale = scope.horizontalPixelRatio;
      const vScale = scope.verticalPixelRatio;
      const { x1, y1, x2, y2 } = coords;

      // Dashed line
      ctx.beginPath();
      ctx.strokeStyle = this._color;
      ctx.lineWidth = 1 * hScale;
      ctx.setLineDash([4 * hScale, 3 * hScale]);
      ctx.moveTo(x1 * hScale, y1 * vScale);
      ctx.lineTo(x2 * hScale, y2 * vScale);
      ctx.stroke();

      // Info box
      const priceDiff = this._p2.price - this._p1.price;
      const pctChange =
        this._p1.price !== 0
          ? ((priceDiff / this._p1.price) * 100).toFixed(2)
          : "0";
      const days = Math.round(Math.abs(this._p2.time - this._p1.time) / 86400);
      const text = `${priceDiff >= 0 ? "+" : ""}${priceDiff.toLocaleString("ja-JP", { maximumFractionDigits: 2 })} (${pctChange}%) / ${days}日`;

      ctx.font = `${11 * hScale}px sans-serif`;
      const metrics = ctx.measureText(text);
      const midX = ((x1 + x2) / 2) * hScale;
      const midY = ((y1 + y2) / 2) * vScale;
      const pad = 6 * hScale;

      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(
        midX - metrics.width / 2 - pad,
        midY - 10 * vScale,
        metrics.width + pad * 2,
        20 * vScale,
      );
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, midX, midY);
      ctx.textAlign = "start";
    });
  }
}

export class MeasurePrimitive extends DrawingPrimitive {
  private _x1 = 0;
  private _y1 = 0;
  private _x2 = 0;
  private _y2 = 0;

  protected _updateViews(): void {
    const [p1, p2] = this._drawing.points;
    if (!p1 || !p2) return;
    const x1 = this._toX(p1.time);
    const y1 = this._toY(p1.price);
    const x2 = this._toX(p2.time);
    const y2 = this._toY(p2.price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return;
    this._x1 = x1;
    this._y1 = y1;
    this._x2 = x2;
    this._y2 = y2;
    this._paneViews = [
      new DrawingPaneView(
        new MeasureRenderer(
          () => ({
            x1: this._x1,
            y1: this._y1,
            x2: this._x2,
            y2: this._y2,
          }),
          this._drawing.points[0],
          this._drawing.points[1],
          this._drawing.color,
        ),
      ),
    ];
  }
}

// --- Factory ---
export const createDrawingPrimitive = (
  drawing: InvestChartDrawing,
): DrawingPrimitive | null => {
  if (!drawing.visible) return null;
  switch (drawing.tool) {
    case "trendline":
      return new TrendLinePrimitive(drawing);
    case "horizontal":
      return new HorizontalLinePrimitive(drawing);
    case "fibonacci":
      return new FibonacciPrimitive(drawing);
    case "range":
      return new RangeHighlightPrimitive(drawing);
    case "text":
      return new TextAnnotationPrimitive(drawing);
    case "measure":
      return new MeasurePrimitive(drawing);
    default:
      return null; // pin is handled by markers
  }
};
