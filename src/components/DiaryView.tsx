import React, { useMemo, useState } from 'react';
import {
  Clock,
  Edit3,
  Eye,
  FileText,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { getErrorMessage } from '../api/client';
import type { DiaryDraft, DiaryEntry, Mood } from '../types';
import { getNowTimeStr, getTodayDateStr } from '../utils/date';
import { DAILY_REPORT_TEMPLATE, renderMarkdown } from '../utils/markdown';

interface DiaryViewProps {
  diaries: DiaryEntry[];
  searchQuery: string;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onClearFilters: () => void;
  /** 提交到 POST/PUT /api/admin/diaries；id 为 null 表示新建 */
  onSaveDiary: (draft: DiaryDraft) => Promise<void>;
  onDeleteDiary: (id: string) => Promise<void>;
}

const MOOD_OPTIONS: Array<{ value: Mood; label: string; emoji: string }> = [
  { value: 'focused', label: '专注', emoji: '🎯' },
  { value: 'calm', label: '平静', emoji: '☕' },
  { value: 'inspired', label: '灵感', emoji: '💡' },
  { value: 'happy', label: '开心', emoji: '✨' },
  { value: 'tired', label: '疲惫', emoji: '🌙' },
];

export const DiaryView: React.FC<DiaryViewProps> = ({
  diaries,
  searchQuery,
  selectedTag,
  onSelectTag,
  onClearFilters,
  onSaveDiary,
  onDeleteDiary,
}) => {
  const [isComposing, setIsComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(getTodayDateStr());
  const [time, setTime] = useState(getNowTimeStr());
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState<Mood>('focused');
  const [tagsText, setTagsText] = useState('日报');
  const [content, setContent] = useState(DAILY_REPORT_TEMPLATE);

  const openNewComposer = () => {
    setEditingId(null);
    setDate(getTodayDateStr());
    setTime(getNowTimeStr());
    setTitle('');
    setMood('focused');
    setTagsText('日报');
    setContent(DAILY_REPORT_TEMPLATE);
    setPreviewMode(false);
    setError(null);
    setIsComposing(true);
  };

  const openEditComposer = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setTime(entry.time);
    setTitle(entry.title);
    setMood(entry.mood);
    setTagsText(entry.tags.join(', '));
    setContent(entry.content);
    setPreviewMode(false);
    setError(null);
    setIsComposing(true);
  };

  const handleApplyTemplate = () => {
    setContent((prev) => (prev.trim() ? `${prev.trim()}\n\n${DAILY_REPORT_TEMPLATE}` : DAILY_REPORT_TEMPLATE));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || saving) return;
    const parsedTags = tagsText
      .split(/[,，\s]+/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    const draft: DiaryDraft = {
      id: editingId,
      date: date || getTodayDateStr(),
      time: time || getNowTimeStr(),
      title: title.trim() || `${date || getTodayDateStr()} 每日日报`,
      content: content.trim(),
      mood,
      tags: parsedTags,
    };

    setSaving(true);
    setError(null);
    try {
      await onSaveDiary(draft);
      setIsComposing(false);
      setEditingId(null);
    } catch (err) {
      setError(getErrorMessage(err, '日记保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await onDeleteDiary(id);
      if (editingId === id) {
        setIsComposing(false);
        setEditingId(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, '日记删除失败'));
    } finally {
      setDeletingId(null);
    }
  };

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...diaries]
      .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
      .filter((d) => {
        if (selectedTag && !d.tags.includes(selectedTag)) return false;
        if (q) {
          const hay = `${d.title} ${d.content} ${d.tags.join(' ')} ${d.date}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [diaries, searchQuery, selectedTag]);

  const hasFilters = Boolean(searchQuery || selectedTag);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-5 bg-gradient-to-br from-amber-500/10 via-white/40 to-transparent dark:from-amber-500/15 dark:via-zinc-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-800 border border-amber-500/25 dark:text-amber-300">
                <Lock className="w-3 h-3" />
                仅管理员可见
              </span>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">每日日记与日报</h1>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              记录每日工作复盘、待办与随笔。新建时可自由修改日期以补写往期日报。
            </p>
          </div>

          <button
            type="button"
            onClick={openNewComposer}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-900/90 text-white hover:bg-zinc-900 dark:bg-white/90 dark:text-zinc-900 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>写今日日报</span>
          </button>
        </div>
      </div>

      {/* Operation Error */}
      {error && (
        <div className="glass-card rounded-2xl px-4 py-2.5 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-3">
          <span className="min-w-0 break-words">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Inline Quick Composer */}
      {isComposing && (
        <form onSubmit={handleSave} className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {editingId ? '编辑日记' : '新建日报 / 日记'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyTemplate}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-300 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span>套用日报模板</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode((p) => !p)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/70 text-zinc-700 hover:bg-white dark:bg-white/10 dark:text-zinc-200"
              >
                {previewMode ? <FileText className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{previewMode ? '返回编辑' : '预览'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1">日期（支持补写）</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-white/5 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1">记录时间</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-white/5 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1">状态 / 心情</label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value as Mood)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100"
              >
                {MOOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.emoji} {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                日报标题（留空则自动按日期命名）
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${date} 每日日报`}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-white/5 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                标签（逗号分隔）
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="日报, 复盘"
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-white/5 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {previewMode ? (
            <div className="min-h-[180px] rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/50 dark:bg-black/20 p-4">
              <div
                className="prose-blog"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            </div>
          ) : (
            <textarea
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下今天的完成事项、遇到的问题、明日计划或自由随笔（支持 Markdown）..."
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono leading-relaxed rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-white/5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
            />
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsComposing(false)}
              disabled={saving}
              className="px-3.5 py-1.5 rounded-xl text-xs text-zinc-600 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-white/10 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-xl text-xs font-medium bg-zinc-900/90 text-white hover:bg-zinc-900 dark:bg-white/90 dark:text-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? '保存中…' : editingId ? '保存修改' : '发布私密日记'}
            </button>
          </div>
        </form>
      )}

      {/* Active Filter Bar */}
      {hasFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>筛选条件：</span>
            {selectedTag && (
              <span className="px-2.5 py-0.5 rounded-full bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900">
                #{selectedTag}
              </span>
            )}
            {searchQuery && (
              <span className="px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-white/10 text-zinc-800 dark:text-zinc-200">
                {searchQuery}
              </span>
            )}
            <button
              type="button"
              onClick={onClearFilters}
              className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              清除
            </button>
          </div>
        </div>
      )}

      {/* Diary Timeline */}
      {sortedAndFiltered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">暂无符合条件的日记</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {sortedAndFiltered.map((entry) => {
            const moodMeta = MOOD_OPTIONS.find((m) => m.value === entry.mood) || MOOD_OPTIONS[0];
            return (
              <article key={entry.id} className="glass-card rounded-2xl p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-zinc-200/60 dark:border-white/10">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                        {entry.date}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="w-3 h-3" />
                        {entry.time}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white/70 dark:bg-white/10 text-[11px]">
                        {moodMeta.emoji} {moodMeta.label}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {entry.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditComposer(entry)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-white/70 dark:hover:text-zinc-100 dark:hover:bg-white/10"
                      title="编辑日记"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:text-rose-400 disabled:opacity-60"
                      title="删除日记"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div
                  className="prose-blog"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }}
                />

                {entry.tags.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-zinc-200/60 dark:border-white/10 flex flex-wrap gap-1.5">
                    {entry.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onSelectTag(selectedTag === t ? null : t)}
                        className="px-2 py-0.5 rounded-lg text-[11px] bg-white/60 text-zinc-700 border border-white/70 hover:bg-white dark:bg-white/5 dark:text-zinc-300 dark:border-white/10 dark:hover:bg-white/15"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
