/**
 * 按屏幕分辨率自动缩放整个界面。
 *
 * 背景：前端是按 ~1440px 视口设计的固定 px 尺寸（容器 max-width、栅格列宽、字号、图标），
 * 在 4K 屏幕上按浏览器 100% 缩放看，整体偏小，需要放大到 120% 才合适。
 *
 * 做法：判断依据取「物理像素宽度」= innerWidth × devicePixelRatio。这个值不随浏览器
 * 缩放变化，能稳定代表屏幕分辨率；再对 <html> 应用 CSS zoom，效果与浏览器自带缩放一致
 * ——布局断点不变（仍按 CSS 视口宽度判定），只是整体放大。
 *
 * 曲线：≤1920 不放大（手机 / 1080p / 1440p 保持原样）；
 *       1920 → 3840 线性放大到 1.20（4K 屏幕即 +20%）；
 *       > 3840（5K/8K/超宽）继续缓慢放大，封顶 1.35。
 *
 * 想手动固定比例（例如觉得 4K 上还不够大），在控制台执行：
 *   localStorage.setItem('blog_gemini_proto_ui_scale_v1', '1.25')
 * 值范围 0.8 ~ 2；执行 localStorage.removeItem('blog_gemini_proto_ui_scale_v1') 恢复自动。
 */

const STORAGE_KEY_UI_SCALE = 'blog_gemini_proto_ui_scale_v1';

/** 不超过该物理宽度视为普通屏幕，不做放大 */
const BASE_PHYSICAL_WIDTH = 1920;
/** 4K 的物理宽度 */
const FOUR_K_PHYSICAL_WIDTH = 3840;
/** 4K 上放大到 1.2（相对 100% 基准再 +20%，即在原有 110% 基础上再放大 10%） */
const SCALE_AT_4K = 1.2;
/** 超宽屏继续放大的斜率与上限 */
const ULTRA_WIDE_STEP_WIDTH = 1920;
const ULTRA_WIDE_STEP_SCALE = 0.05;
const MAX_SCALE = 1.35;

/** 纯函数：由物理像素宽度算出缩放比，便于单独理解和调整。 */
export function computeUiScale(physicalWidth: number): number {
  if (!Number.isFinite(physicalWidth) || physicalWidth <= BASE_PHYSICAL_WIDTH) {
    return 1;
  }
  if (physicalWidth <= FOUR_K_PHYSICAL_WIDTH) {
    const progress =
      (physicalWidth - BASE_PHYSICAL_WIDTH) / (FOUR_K_PHYSICAL_WIDTH - BASE_PHYSICAL_WIDTH);
    return 1 + progress * (SCALE_AT_4K - 1);
  }
  const extra = ((physicalWidth - FOUR_K_PHYSICAL_WIDTH) / ULTRA_WIDE_STEP_WIDTH) * ULTRA_WIDE_STEP_SCALE;
  return Math.min(MAX_SCALE, SCALE_AT_4K + extra);
}

/** 读取人工覆盖值；未设置或非法时返回 null，表示走自动。 */
function readScaleOverride(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_UI_SCALE);
    if (!raw) return null;
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value) && value >= 0.8 && value <= 2) return value;
  } catch {
    // 隐私模式等 localStorage 不可用时退回自动
  }
  return null;
}

/** 上次写入的值，避免每次 resize 都重复写样式触发无谓的重新布局 */
let appliedZoom = 'initial';

function applyZoom(scale: number): void {
  const rounded = Math.round(scale * 1000) / 1000;
  // 1 倍时移除属性，让页面保持在最"原生"的状态
  const next = rounded === 1 ? '' : String(rounded);
  if (next === appliedZoom) return;
  appliedZoom = next;

  const root = document.documentElement;
  if (next) {
    root.style.setProperty('zoom', next);
  } else {
    root.style.removeProperty('zoom');
  }
  // 供 CSS 换算"一屏高度"用（见 index.css 的 --app-vh）：zoom 会连 100vh 一起放大
  root.style.setProperty('--ui-zoom', String(rounded));
}

/** 立刻按当前屏幕条件同步一次缩放。 */
export function syncUiScale(): void {
  const override = readScaleOverride();
  if (override !== null) {
    applyZoom(override);
    return;
  }
  const physicalWidth = window.innerWidth * (window.devicePixelRatio || 1);
  applyZoom(computeUiScale(physicalWidth));
}

/**
 * 启动时调用一次；之后窗口尺寸 / 像素比变化（拖窗口、换显示器、调浏览器缩放）自动跟随。
 */
export function initUiScale(): void {
  syncUiScale();

  let frame = 0;
  const scheduleSync = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      syncUiScale();
    });
  };

  window.addEventListener('resize', scheduleSync, { passive: true });
  window.addEventListener('orientationchange', scheduleSync, { passive: true });

  // devicePixelRatio 变化（换到另一块屏、系统缩放调整）不会触发 resize，需单独监听；
  // matchMedia 的 resolution 查询只能匹配当前值，所以每次变化后重新挂载。
  const watchPixelRatio = () => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const handleChange = () => {
      query.removeEventListener('change', handleChange);
      syncUiScale();
      watchPixelRatio();
    };
    query.addEventListener('change', handleChange);
  };
  watchPixelRatio();
}
