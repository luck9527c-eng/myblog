/**
 * 前端类型定义 —— 与 docs/API_CONTRACT.md §0.4 逐字段对齐。
 * 注意：JSON 字段一律 camelCase；所有 id 为字符串；时间戳为
 * `YYYY-MM-DDTHH:mm:ss`（Asia/Shanghai，无时区后缀）。
 */

export type ArticleStatus = 'published' | 'draft';

export type Mood = 'focused' | 'calm' | 'inspired' | 'happy' | 'tired';

export interface Article {
  id: string;
  title: string;
  /** 后端在为空时自动截取正文纯文本前 90 字 */
  excerpt: string;
  /** Markdown 原文 */
  content: string;
  categoryId: string | null;
  tags: string[];
  /** YYYY-MM-DDTHH:mm:ss */
  publishedAt: string;
  status: ArticleStatus;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 详情接口附带的相邻文章简讯 */
export interface ArticleNeighbor {
  id: string;
  title: string;
}

export interface ArticleDetail extends Article {
  prev: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
}

/** POST/PUT /api/admin/articles 的请求体 */
export interface ArticleInput {
  title: string;
  excerpt?: string;
  content: string;
  categoryId?: string | null;
  tags?: string[];
  publishedAt?: string | null;
  status?: ArticleStatus;
  pinned?: boolean;
}

/** 后台编辑器提交的草稿：id 为 null 表示新建（POST），否则编辑（PUT） */
export interface ArticleDraft extends ArticleInput {
  id?: string | null;
}

export interface DiaryEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  title: string;
  mood: Mood;
  tags: string[];
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** POST/PUT /api/admin/diaries 的请求体 */
export interface DiaryInput {
  /** YYYY-MM-DD 必填 */
  date: string;
  /** HH:mm，为空则由后端取服务器当前时间 */
  time?: string | null;
  title?: string;
  mood?: Mood;
  tags?: string[];
  content: string;
}

/** 后台编辑器提交的日记草稿：id 为 null 表示新建（POST），否则编辑（PUT） */
export interface DiaryDraft extends DiaryInput {
  id?: string | null;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  dotColor: string;
  sortOrder: number;
  /** 仅 bootstrap 与后台分类列表中返回 */
  articleCount?: number;
}

export interface CategoryInput {
  name: string;
  description?: string;
  dotColor?: string;
  sortOrder?: number;
}

export interface TagStat {
  name: string;
  count: number;
}

export interface SiteSettings {
  /** 注意：不包含任何密码字段 */
  blogTitle: string;
  blogSubtitle: string;
  authorName: string;
  authorHandle: string;
  authorBio: string;
  authorLocation: string;
  authorEmail: string;
  aboutContent: string;
  updatedAt: string;
}

/** PUT /api/admin/settings 的请求体（字段全部可选，不含密码与 updatedAt） */
export type SiteSettingsInput = Partial<Omit<SiteSettings, 'updatedAt'>>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BootstrapMeta {
  articleCount: number;
  categoryCount: number;
}

/** GET /api/public/bootstrap */
export interface Bootstrap {
  settings: SiteSettings;
  categories: Category[];
  tags: TagStat[];
  meta: BootstrapMeta;
}

/** GET /api/articles/archive 的条目（精简字段） */
export interface ArchiveItem {
  id: string;
  title: string;
  categoryId: string | null;
  publishedAt: string;
  pinned: boolean;
}

export interface ArchiveResult {
  items: ArchiveItem[];
  total: number;
}

export interface OperationResult {
  ok: boolean;
}

export interface RenameTagResult extends OperationResult {
  name: string;
  merged: boolean;
  affected: number;
}

export interface DeleteTagResult extends OperationResult {
  affected: number;
}

/** 不带分页的列表包装（后台列表接口） */
export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface UploadedImage {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export type AppView = 'home' | 'article' | 'archive' | 'about' | 'diary' | 'admin';

export type AdminTab = 'articles' | 'diaries' | 'taxonomy' | 'settings';

export type ThemeMode = 'light' | 'dark';

/** 管理后台消费的数据聚合（articles 为后台全量，含草稿） */
export interface BlogDataState {
  articles: Article[];
  diaries: DiaryEntry[];
  categories: Category[];
  settings: SiteSettings;
}
