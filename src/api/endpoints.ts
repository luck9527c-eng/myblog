/**
 * 类型化的端点封装 —— 与 docs/API_CONTRACT.md §1–§3 逐条对应。
 * 查询参数使用 snake_case（`category_id` / `page_size` / `status` / `q` / `tag`），
 * 请求体与响应体字段使用 camelCase。
 */
import { request } from './client';
import type {
  ArchiveResult,
  Article,
  ArticleDetail,
  ArticleInput,
  ArticleStatus,
  Bootstrap,
  Category,
  CategoryInput,
  DeleteTagResult,
  DiaryEntry,
  DiaryInput,
  ListResult,
  Page,
  RenameTagResult,
  SiteSettings,
  SiteSettingsInput,
} from '../types';

type QueryValue = string | number | boolean | null | undefined;

function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function jsonBody(payload: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(payload) };
}

function putBody(payload: unknown): RequestInit {
  return { method: 'PUT', body: JSON.stringify(payload) };
}

/* ------------------------------- 认证 ------------------------------- */

export interface AuthState {
  isAdmin: boolean;
}

export function login(password: string): Promise<AuthState> {
  return request<AuthState>('/api/auth/login', jsonBody({ password }));
}

export function logout(): Promise<AuthState> {
  return request<AuthState>('/api/auth/logout', { method: 'POST' });
}

export function fetchMe(): Promise<AuthState> {
  return request<AuthState>('/api/auth/me');
}

/* ------------------------------- 公开 ------------------------------- */

export function fetchBootstrap(): Promise<Bootstrap> {
  return request<Bootstrap>('/api/public/bootstrap');
}

export interface ArticleQuery {
  q?: string;
  categoryId?: string | null;
  tag?: string | null;
  page?: number;
  pageSize?: number;
}

export function listArticles(query: ArticleQuery = {}): Promise<Page<Article>> {
  const qs = toQuery({
    q: query.q,
    category_id: query.categoryId,
    tag: query.tag,
    page: query.page,
    page_size: query.pageSize,
  });
  return request<Page<Article>>(`/api/articles${qs}`);
}

export function listArchive(query: Omit<ArticleQuery, 'page' | 'pageSize'> = {}): Promise<ArchiveResult> {
  const qs = toQuery({
    q: query.q,
    category_id: query.categoryId,
    tag: query.tag,
  });
  return request<ArchiveResult>(`/api/articles/archive${qs}`);
}

export function getArticle(id: string): Promise<ArticleDetail> {
  return request<ArticleDetail>(`/api/articles/${encodeURIComponent(id)}`);
}

/* ----------------------------- 后台文章 ----------------------------- */

export interface AdminArticleQuery {
  status?: ArticleStatus;
  q?: string;
}

export function adminListArticles(query: AdminArticleQuery = {}): Promise<ListResult<Article>> {
  const qs = toQuery({ status: query.status, q: query.q });
  return request<ListResult<Article>>(`/api/admin/articles${qs}`);
}

export function createArticle(input: ArticleInput): Promise<Article> {
  return request<Article>('/api/admin/articles', jsonBody(input));
}

export function updateArticle(id: string, input: ArticleInput): Promise<Article> {
  return request<Article>(`/api/admin/articles/${encodeURIComponent(id)}`, putBody(input));
}

/** 不传 pinned 时由后端取反 */
export function togglePin(id: string, pinned?: boolean): Promise<Article> {
  const init: RequestInit = {
    method: 'PATCH',
    body: JSON.stringify(pinned === undefined ? {} : { pinned }),
  };
  return request<Article>(`/api/admin/articles/${encodeURIComponent(id)}/pin`, init);
}

export function deleteArticle(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/articles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ----------------------------- 后台日记 ----------------------------- */

export interface AdminDiaryQuery {
  q?: string;
  tag?: string;
}

export function adminListDiaries(query: AdminDiaryQuery = {}): Promise<ListResult<DiaryEntry>> {
  const qs = toQuery({ q: query.q, tag: query.tag });
  return request<ListResult<DiaryEntry>>(`/api/admin/diaries${qs}`);
}

export function createDiary(input: DiaryInput): Promise<DiaryEntry> {
  return request<DiaryEntry>('/api/admin/diaries', jsonBody(input));
}

export function updateDiary(id: string, input: DiaryInput): Promise<DiaryEntry> {
  return request<DiaryEntry>(`/api/admin/diaries/${encodeURIComponent(id)}`, putBody(input));
}

export function deleteDiary(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/diaries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ------------------------------ 分类 ------------------------------- */

export function createCategory(input: CategoryInput): Promise<Category> {
  return request<Category>('/api/admin/categories', jsonBody(input));
}

export function updateCategory(id: string, input: Partial<CategoryInput>): Promise<Category> {
  return request<Category>(`/api/admin/categories/${encodeURIComponent(id)}`, putBody(input));
}

export function deleteCategory(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ------------------------------ 标签 ------------------------------- */

export function renameTag(tagName: string, newName: string): Promise<RenameTagResult> {
  return request<RenameTagResult>(`/api/admin/tags/${encodeURIComponent(tagName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ newName }),
  });
}

export function deleteTag(tagName: string): Promise<DeleteTagResult> {
  return request<DeleteTagResult>(`/api/admin/tags/${encodeURIComponent(tagName)}`, {
    method: 'DELETE',
  });
}

/* ----------------------------- 站点设置 ---------------------------- */

export function getAdminSettings(): Promise<SiteSettings> {
  return request<SiteSettings>('/api/admin/settings');
}

export function updateSettings(input: SiteSettingsInput): Promise<SiteSettings> {
  return request<SiteSettings>('/api/admin/settings', putBody(input));
}

export function changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/admin/password', putBody({ oldPassword, newPassword }));
}
