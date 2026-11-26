import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Edit3,
  Eye,
  FileText,
  FolderPlus,
  KeyRound,
  NotebookPen,
  Pin,
  Plus,
  Save,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { getErrorMessage } from '../api/client';
import type {
  AdminTab,
  Article,
  ArticleDraft,
  ArticleStatus,
  BlogDataState,
  CategoryInput,
  DiaryDraft,
  Mood,
  SiteSettings,
  SiteSettingsInput,
} from '../types';
import {
  formatDateTimeLabel,
  getNowDateTimeLocal,
  getNowTimeStr,
  getTodayDateStr,
  isFutureDateTime,
} from '../utils/date';
import { DAILY_REPORT_TEMPLATE, renderMarkdown } from '../utils/markdown';
import { useMarkdownImageUpload } from '../utils/useMarkdownImageUpload';
import { ConfirmModal } from './ConfirmModal';
import { MarkdownBody } from './MarkdownBody';

/** 后台日记编辑器在本地维护的完整表单（提交时按 id 决定 POST / PUT） */
interface DiaryFormState {
  id: string | null;
  date: string;
  time: string;
  title: string;
  mood: Mood;
  tags: string[];
  content: string;
}

interface AdminDashboardProps {
  data: BlogDataState;
  initialTab?: AdminTab | null;
  onClearInitialTab?: () => void;
  initialEditArticleId: string | null;
  onClearInitialEditArticle: () => void;
  /** id 为 null 表示新建（POST），否则编辑（PUT） */
  onSaveArticle: (draft: ArticleDraft) => Promise<void>;
  onDeleteArticle: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
  onSaveDiary: (draft: DiaryDraft) => Promise<void>;
  onDeleteDiary: (id: string) => Promise<void>;
  onCreateCategory: (input: CategoryInput) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onRenameTagGlobal: (oldTag: string, newTag: string) => Promise<void>;
  onDeleteTagGlobal: (tag: string) => Promise<void>;
  onSaveSettings: (settings: SiteSettingsInput) => Promise<void>;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onPreviewArticle: (id: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const DOT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  data,
  initialTab,
  onClearInitialTab,
  initialEditArticleId,
  onClearInitialEditArticle,
  onSaveArticle,
  onDeleteArticle,
  onTogglePin,
  onSaveDiary,
  onDeleteDiary,
  onCreateCategory,
  onDeleteCategory,
  onRenameTagGlobal,
  onDeleteTagGlobal,
  onSaveSettings,
  onChangePassword,
  onPreviewArticle,
  onDirtyChange,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('articles');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Article List & Editor State
  const [articleFilter, setArticleFilter] = useState<'all' | ArticleStatus>('all');
  const [articleSearch, setArticleSearch] = useState('');
  const [isEditingArticle, setIsEditingArticle] = useState(false);
  const [editorMobileTab, setEditorMobileTab] = useState<'write' | 'preview'>('write');

  const [artId, setArtId] = useState<string | null>(null);
  const [artTitle, setArtTitle] = useState('');
  const [artExcerpt, setArtExcerpt] = useState('');
  const [artCategoryId, setArtCategoryId] = useState(data.categories[0]?.id || '');
  const [artTagsText, setArtTagsText] = useState('');
  const [artPublishedAt, setArtPublishedAt] = useState(getNowDateTimeLocal());
  const [artStatus, setArtStatus] = useState<ArticleStatus>('published');
  const [artPinned, setArtPinned] = useState(false);
  const [artContent, setArtContent] = useState('');

  // Async request state
  const [savingArticle, setSavingArticle] = useState(false);
  const [savingDiary, setSavingDiary] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyArticleId, setBusyArticleId] = useState<string | null>(null);
  const [busyDiaryId, setBusyDiaryId] = useState<string | null>(null);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [busyTag, setBusyTag] = useState<string | null>(null);

  // Diary Editor Modal/Panel State inside Admin
  const [editingDiary, setEditingDiary] = useState<DiaryFormState | null>(null);
  const [isNewDiary, setIsNewDiary] = useState(false);

  // Category Form State
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState(DOT_COLORS[0]);
  const [renamingTag, setRenamingTag] = useState<{ old: string; next: string } | null>(null);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState<Omit<SiteSettings, 'updatedAt'>>(data.settings);

  // Unsaved-changes tracking & discard modal
  const articleSnapshotRef = useRef<string>('');
  const diarySnapshotRef = useRef<string>('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState('');

  // Change Password Form State
  const [pwdOld, setPwdOld] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    setSettingsForm(data.settings);
  }, [data.settings]);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    setToast(msg);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, 2600);
  }, []);

  const articleImageUpload = useMarkdownImageUpload({
    value: artContent,
    onChange: setArtContent,
    onError: showToast,
  });

  const diaryImageUpload = useMarkdownImageUpload({
    value: editingDiary?.content ?? '',
    onChange: (next) =>
      setEditingDiary((prev) => (prev ? { ...prev, content: next } : prev)),
    onError: showToast,
  });

  const aboutImageUpload = useMarkdownImageUpload({
    value: settingsForm.aboutContent,
    onChange: (next) => setSettingsForm((prev) => ({ ...prev, aboutContent: next })),
    onError: showToast,
  });

  useEffect(
    () => () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }
    },
    [],
  );

  const buildArticleSnapshot = useCallback(
    (
      title: string,
      excerpt: string,
      categoryId: string,
      tagsText: string,
      publishedAt: string,
      status: ArticleStatus,
      pinned: boolean,
      content: string,
    ) =>
      JSON.stringify({
        title,
        excerpt,
        categoryId,
        tagsText,
        publishedAt,
        status,
        pinned,
        content,
      }),
    [],
  );

  const isArticleDirty = useMemo(() => {
    if (!isEditingArticle) return false;
    return (
      buildArticleSnapshot(
        artTitle,
        artExcerpt,
        artCategoryId,
        artTagsText,
        artPublishedAt,
        artStatus,
        artPinned,
        artContent,
      ) !== articleSnapshotRef.current
    );
  }, [
    isEditingArticle,
    artTitle,
    artExcerpt,
    artCategoryId,
    artTagsText,
    artPublishedAt,
    artStatus,
    artPinned,
    artContent,
    buildArticleSnapshot,
  ]);

  const isDiaryDirty = useMemo(() => {
    if (!editingDiary) return false;
    return JSON.stringify(editingDiary) !== diarySnapshotRef.current;
  }, [editingDiary]);

  const isSettingsDirty = useMemo(() => {
    if (activeTab !== 'settings') return false;
    const s = data.settings;
    return (
      settingsForm.blogTitle !== s.blogTitle ||
      settingsForm.blogSubtitle !== s.blogSubtitle ||
      settingsForm.authorName !== s.authorName ||
      settingsForm.authorHandle !== s.authorHandle ||
      settingsForm.authorBio !== s.authorBio ||
      settingsForm.authorLocation !== s.authorLocation ||
      settingsForm.authorEmail !== s.authorEmail ||
      settingsForm.aboutContent !== s.aboutContent
    );
  }, [activeTab, settingsForm, data.settings]);

  const hasAnyUnsavedChanges = isArticleDirty || isDiaryDirty || isSettingsDirty;

  useEffect(() => {
    onDirtyChange?.(hasAnyUnsavedChanges);
    return () => onDirtyChange?.(false);
  }, [hasAnyUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    if (!hasAnyUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasAnyUnsavedChanges]);

  const openArticleEditor = (article?: Article) => {
    if (article) {
      const catId = article.categoryId || data.categories[0]?.id || '';
      const tagsJoined = article.tags.join(', ');
      const pubSlice = article.publishedAt.slice(0, 16);
      setArtId(article.id);
      setArtTitle(article.title);
      setArtExcerpt(article.excerpt);
      setArtCategoryId(catId);
      setArtTagsText(tagsJoined);
      // 后端返回 YYYY-MM-DDTHH:mm:ss，<input type="datetime-local"> 只吃前 16 位
      setArtPublishedAt(pubSlice);
      setArtStatus(article.status);
      setArtPinned(article.pinned);
      setArtContent(article.content);
      articleSnapshotRef.current = buildArticleSnapshot(
        article.title,
        article.excerpt,
        catId,
        tagsJoined,
        pubSlice,
        article.status,
        article.pinned,
        article.content,
      );
    } else {
      const catId = data.categories[0]?.id || '';
      const nowLocal = getNowDateTimeLocal();
      setArtId(null);
      setArtTitle('');
      setArtExcerpt('');
      setArtCategoryId(catId);
      setArtTagsText('');
      // Default publish time is current local time
      setArtPublishedAt(nowLocal);
      setArtStatus('published');
      setArtPinned(false);
      setArtContent('');
      articleSnapshotRef.current = buildArticleSnapshot(
        '',
        '',
        catId,
        '',
        nowLocal,
        'published',
        false,
        '',
      );
    }
    setEditorMobileTab('write');
    setIsEditingArticle(true);
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      setIsEditingArticle(false);
      onClearInitialTab?.();
    }
  }, [initialTab]);

  useEffect(() => {
    if (!initialEditArticleId) return;
    const target = data.articles.find((a) => a.id === initialEditArticleId);
    // 后台列表还在加载时先不清除请求，等数据到位再打开，避免编辑意图丢失
    if (!target) return;
    setActiveTab('articles');
    openArticleEditor(target);
    onClearInitialEditArticle();
  }, [initialEditArticleId, data.articles]);

  const saveArticleAction = useCallback(async () => {
    if (savingArticle) return;
    if (!artTitle.trim()) {
      showToast('请输入文章标题');
      return;
    }
    const parsedTags = artTagsText
      .split(/[,，\s]+/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    // datetime-local 为 YYYY-MM-DDTHH:mm，提交时补全秒；留空则由后端取当前上海时间
    const publishedAt = artPublishedAt
      ? artPublishedAt.length === 16
        ? `${artPublishedAt}:00`
        : artPublishedAt
      : null;

    const draft: ArticleDraft = {
      id: artId,
      title: artTitle.trim(),
      excerpt: artExcerpt.trim(),
      content: artContent,
      categoryId: artCategoryId || null,
      tags: parsedTags,
      publishedAt,
      status: artStatus,
      pinned: artPinned,
    };

    setSavingArticle(true);
    try {
      await onSaveArticle(draft);
      setIsEditingArticle(false);
      showToast(artStatus === 'published' ? '文章已保存并公开' : '草稿已保存');
    } catch (err) {
      showToast(getErrorMessage(err, '文章保存失败'));
    } finally {
      setSavingArticle(false);
    }
  }, [
    savingArticle,
    artTitle,
    artTagsText,
    artPublishedAt,
    artId,
    artExcerpt,
    artContent,
    artCategoryId,
    artStatus,
    artPinned,
    onSaveArticle,
  ]);

  const handleSaveArticleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveArticleAction();
  };

  const handleTogglePinClick = async (art: Article) => {
    setBusyArticleId(art.id);
    try {
      await onTogglePin(art.id);
      showToast(art.pinned ? '已取消置顶' : '已设为置顶');
    } catch (err) {
      showToast(getErrorMessage(err, '置顶操作失败'));
    } finally {
      setBusyArticleId(null);
    }
  };

  const handleDeleteArticleClick = async (id: string) => {
    setBusyArticleId(id);
    try {
      await onDeleteArticle(id);
      showToast('文章已删除');
    } catch (err) {
      showToast(getErrorMessage(err, '文章删除失败'));
    } finally {
      setBusyArticleId(null);
    }
  };

  const filteredArticles = useMemo(() => {
    const q = articleSearch.trim().toLowerCase();
    return [...data.articles]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.publishedAt.localeCompare(a.publishedAt);
      })
      .filter((a) => {
        if (articleFilter !== 'all' && a.status !== articleFilter) return false;
        if (q && !`${a.title} ${a.tags.join(' ')}`.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [data.articles, articleFilter, articleSearch]);

  const allTagStats = useMemo(() => {
    const map = new Map<string, number>();
    data.articles.forEach((a) => a.tags.forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [data.articles]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingCategory) return;
    const name = newCatName.trim();
    if (!name) return;
    setSavingCategory(true);
    try {
      await onCreateCategory({
        name,
        description: newCatDesc.trim() || '自定义分类',
        dotColor: newCatColor,
      });
      setNewCatName('');
      setNewCatDesc('');
      showToast('分类已添加');
    } catch (err) {
      showToast(getErrorMessage(err, '分类添加失败'));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (data.categories.length <= 1) {
      showToast('至少保留一个分类');
      return;
    }
    setBusyCategoryId(catId);
    try {
      await onDeleteCategory(catId);
      showToast('分类已删除');
    } catch (err) {
      showToast(getErrorMessage(err, '分类删除失败'));
    } finally {
      setBusyCategoryId(null);
    }
  };

  const handleRenameTagSubmit = async (oldTag: string, nextName: string) => {
    const target = nextName.trim();
    setRenamingTag(null);
    if (!target || target === oldTag) return;
    setBusyTag(oldTag);
    try {
      await onRenameTagGlobal(oldTag, target);
      showToast('标签已重命名');
    } catch (err) {
      showToast(getErrorMessage(err, '标签重命名失败'));
    } finally {
      setBusyTag(null);
    }
  };

  const handleDeleteTagClick = async (tag: string) => {
    setBusyTag(tag);
    try {
      await onDeleteTagGlobal(tag);
      showToast(`已移除标签 #${tag}`);
    } catch (err) {
      showToast(getErrorMessage(err, '标签移除失败'));
    } finally {
      setBusyTag(null);
    }
  };

  const handleSaveDiarySubmit = useCallback(async () => {
    if (!editingDiary || savingDiary) return;
    const title = editingDiary.title.trim() || `${editingDiary.date} 每日日报`;
    const draft: DiaryDraft = {
      id: editingDiary.id,
      date: editingDiary.date,
      time: editingDiary.time || null,
      title,
      mood: editingDiary.mood,
      tags: editingDiary.tags,
      content: editingDiary.content,
    };
    setSavingDiary(true);
    try {
      await onSaveDiary(draft);
      setEditingDiary(null);
      showToast('日记已保存');
    } catch (err) {
      showToast(getErrorMessage(err, '日记保存失败'));
    } finally {
      setSavingDiary(false);
    }
  }, [editingDiary, savingDiary, onSaveDiary]);

  const handleDeleteDiaryClick = async (id: string) => {
    setBusyDiaryId(id);
    try {
      await onDeleteDiary(id);
      if (editingDiary?.id === id) setEditingDiary(null);
      showToast('日记已删除');
    } catch (err) {
      showToast(getErrorMessage(err, '日记删除失败'));
    } finally {
      setBusyDiaryId(null);
    }
  };

  const saveSettingsAction = useCallback(async () => {
    if (savingSettings) return;
    const payload: SiteSettingsInput = {
      blogTitle: settingsForm.blogTitle,
      blogSubtitle: settingsForm.blogSubtitle,
      authorName: settingsForm.authorName,
      authorHandle: settingsForm.authorHandle,
      authorBio: settingsForm.authorBio,
      authorLocation: settingsForm.authorLocation,
      authorEmail: settingsForm.authorEmail,
      aboutContent: settingsForm.aboutContent,
    };
    setSavingSettings(true);
    try {
      await onSaveSettings(payload);
      showToast('站点设置已保存');
    } catch (err) {
      showToast(getErrorMessage(err, '设置保存失败'));
    } finally {
      setSavingSettings(false);
    }
  }, [savingSettings, settingsForm, onSaveSettings]);

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettingsAction();
  };

  // Ctrl+S / Cmd+S shortcut in Admin editors
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (activeTab === 'articles' && isEditingArticle) {
          e.preventDefault();
          void saveArticleAction();
        } else if (activeTab === 'diaries' && editingDiary) {
          e.preventDefault();
          void handleSaveDiarySubmit();
        } else if (activeTab === 'settings' && isSettingsDirty) {
          e.preventDefault();
          void saveSettingsAction();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    isEditingArticle,
    editingDiary,
    isSettingsDirty,
    saveArticleAction,
    handleSaveDiarySubmit,
    saveSettingsAction,
  ]);

  const requestGuardedAction = (dirty: boolean, message: string, action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    setConfirmMessage(message);
    setConfirmAction(() => action);
  };

  const handleTabSwitch = (nextTab: AdminTab) => {
    if (nextTab === activeTab) return;
    requestGuardedAction(
      hasAnyUnsavedChanges,
      '当前页面有未保存的编辑内容，切换标签页将放弃未保存的改动。',
      () => {
        setEditingDiary(null);
        setActiveTab(nextTab);
      },
    );
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdSaving) return;
    if (!pwdOld) {
      setPwdError('请输入原密码');
      return;
    }
    if (pwdNew.length < 6) {
      setPwdError('新密码长度不能少于 6 位');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    setPwdError(null);
    setPwdSaving(true);
    try {
      await onChangePassword(pwdOld, pwdNew);
      setPwdOld('');
      setPwdNew('');
      setPwdConfirm('');
      showToast('管理员密码已修改');
    } catch (err) {
      setPwdError(getErrorMessage(err, '密码修改失败'));
    } finally {
      setPwdSaving(false);
    }
  };

  const tabButtonClass = (tab: AdminTab) =>
    `px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
      activeTab === tab
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs'
        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
    }`;

  // SPLIT-PANE MARKDOWN EDITOR VIEW
  if (activeTab === 'articles' && isEditingArticle) {
    return (
      <form onSubmit={handleSaveArticleSubmit} className="space-y-4">
        {toast && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium shadow-lg">
            <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
            <span>{toast}</span>
          </div>
        )}
        <ConfirmModal
          isOpen={confirmAction !== null}
          title="放弃未保存的文章？"
          message={confirmMessage}
          confirmLabel="放弃并离开"
          cancelLabel="继续编辑"
          onConfirm={() => {
            const fn = confirmAction;
            setConfirmAction(null);
            fn?.();
          }}
          onCancel={() => setConfirmAction(null)}
        />

        {/* Top Editor Bar */}
        <div className="glass-card rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3" data-rain-ledge>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                requestGuardedAction(
                  isArticleDirty,
                  '当前文章有未保存的修改，返回列表将丢失这些改动。',
                  () => setIsEditingArticle(false),
                )
              }
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              返回列表
            </button>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {artId ? '编辑文章' : '撰写新文章'}
            </span>
            {isArticleDirty && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300">
                未保存 · Ctrl+S
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={artStatus}
              onChange={(e) => setArtStatus(e.target.value as ArticleStatus)}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
            >
              <option value="published">公开发布</option>
              <option value="draft">保存为草稿</option>
            </select>

            <button
              type="button"
              onClick={() => setArtPinned((p) => !p)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                artPinned
                  ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{artPinned ? '已置顶' : '置顶'}</span>
            </button>

            <button
              type="submit"
              disabled={savingArticle}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {savingArticle
                  ? '保存中…'
                  : artStatus === 'published'
                    ? '发布保存'
                    : '存为草稿'}
              </span>
            </button>
          </div>
        </div>

        {/* Metadata Panel (including Custom Publish Time) */}
        <div className="glass-card-reading rounded-2xl p-5 space-y-4 shadow-2xs">
          <div>
            <input
              type="text"
              value={artTitle}
              onChange={(e) => setArtTitle(e.target.value)}
              placeholder="输入文章标题..."
              className="w-full text-lg sm:text-xl font-bold bg-transparent text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none pb-2 border-b border-zinc-100 dark:border-zinc-800"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                发布时间（默认当前时间，支持自由设为过去或未来）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={artPublishedAt}
                  onChange={(e) => setArtPublishedAt(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setArtPublishedAt(getNowDateTimeLocal())}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0"
                  title="重置为当前本地时间"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>设为当前时间</span>
                </button>
              </div>
              {isFutureDateTime(artPublishedAt) && (
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                  提示：当前设为未来日期，发布后将立即公开并按此日期排序展示。
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">文章分类</label>
                <select
                  value={artCategoryId}
                  onChange={(e) => setArtCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  {data.categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  标签（逗号分隔）
                </label>
                <input
                  type="text"
                  value={artTagsText}
                  onChange={(e) => setArtTagsText(e.target.value)}
                  placeholder="React, 笔记"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              文章摘要（选填，留空自动提取正文前 90 字）
            </label>
            <input
              type="text"
              value={artExcerpt}
              onChange={(e) => setArtExcerpt(e.target.value)}
              placeholder="一句话概括这篇文章的核心内容..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* Dual-Pane Markdown Editor + Live Preview */}
        <div className="glass-card-reading rounded-2xl overflow-hidden shadow-2xs">
          {/* Mobile Tab Switcher */}
          <div className="flex md:hidden border-b border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setEditorMobileTab('write')}
              className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 ${
                editorMobileTab === 'write'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Markdown 编辑</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorMobileTab('preview')}
              className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 ${
                editorMobileTab === 'preview'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>实时预览</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 min-h-[420px]">
            <div
              className={`flex flex-col border-zinc-200 dark:border-zinc-800 md:border-r ${
                editorMobileTab === 'preview' ? 'hidden md:flex' : 'flex'
              }`}
            >
              <div className="hidden md:flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-medium text-zinc-400">
                <span>MARKDOWN 源码 · 支持 Ctrl+V 粘贴 / 拖拽图片</span>
                <span>
                  {articleImageUpload.uploading ? '正在上传图片…' : '支持 GFM 语法'}
                </span>
              </div>
              <textarea
                value={artContent}
                onChange={(e) => setArtContent(e.target.value)}
                {...articleImageUpload.textareaProps}
                placeholder="# 开始写作...&#10;&#10;支持标题、列表、代码块、引用、表格，以及截图 Ctrl+V 粘贴或拖拽图片。"
                className={`flex-1 w-full p-4 text-sm font-mono leading-relaxed bg-transparent text-zinc-900 dark:text-zinc-100 resize-none focus:outline-none min-h-[420px] transition-colors ${
                  articleImageUpload.isDraggingOver ? 'bg-indigo-500/10 ring-2 ring-inset ring-indigo-500/60' : ''
                }`}
              />
            </div>

            <div
              className={`flex flex-col bg-zinc-50/50 dark:bg-zinc-950/40 ${
                editorMobileTab === 'write' ? 'hidden md:flex' : 'flex'
              }`}
            >
              <div className="hidden md:flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-medium text-zinc-400">
                <span>实时阅读预览</span>
                <span>{artContent.length} 字</span>
              </div>
              <div className="p-5 overflow-y-auto max-h-[540px]">
                {artContent.trim() ? (
                  <MarkdownBody html={renderMarkdown(artContent)} />
                ) : (
                  <p className="text-sm text-zinc-400 italic">左侧输入 Markdown 后，这里将实时预览排版效果…</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={confirmAction !== null}
        title="放弃未保存的改动？"
        message={confirmMessage}
        confirmLabel="放弃并离开"
        cancelLabel="继续编辑"
        onConfirm={() => {
          const fn = confirmAction;
          setConfirmAction(null);
          fn?.();
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium shadow-lg">
          <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
          <span>{toast}</span>
        </div>
      )}

      {/* Admin Top Header & Tabs */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4" data-rain-ledge>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Settings className="w-5 h-5 text-zinc-500" />
              <span>管理后台</span>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              内容管理、每日日报维护与站点配置（所有修改实时保存至数据库）
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => handleTabSwitch('articles')}
            className={tabButtonClass('articles')}
          >
            文章管理 ({data.articles.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('diaries')}
            className={tabButtonClass('diaries')}
          >
            日记管理 ({data.diaries.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('taxonomy')}
            className={tabButtonClass('taxonomy')}
          >
            分类与标签
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('settings')}
            className={tabButtonClass('settings')}
          >
            站点设置
          </button>
        </div>
      </div>

      {/* TAB 1: ARTICLES MANAGEMENT */}
      {activeTab === 'articles' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(['all', 'published', 'draft'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setArticleFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    articleFilter === status
                      ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                  }`}
                >
                  {status === 'all' ? '全部' : status === 'published' ? '已发布' : '草稿'}
                </button>
              ))}
              <input
                type="text"
                value={articleSearch}
                onChange={(e) => setArticleSearch(e.target.value)}
                placeholder="筛选标题..."
                className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 w-36 sm:w-52"
              />
            </div>

            <button
              type="button"
              onClick={() => openArticleEditor()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <Plus className="w-4 h-4" />
              <span>新建文章</span>
            </button>
          </div>

          <div className="space-y-3">
            {filteredArticles.map((art) => {
              const cat = data.categories.find((c) => c.id === art.categoryId);
              return (
                <div
                  key={art.id}
                  className="glass-card rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded font-medium ${
                          art.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {art.status === 'published' ? '已发布' : '草稿'}
                      </span>
                      {art.pinned && (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-medium">
                          置顶
                        </span>
                      )}
                      {cat && (
                        <span className="text-zinc-500 dark:text-zinc-400">{cat.name}</span>
                      )}
                      <span className="text-zinc-400 tabular-nums">
                        {formatDateTimeLabel(art.publishedAt)}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {art.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {art.status === 'published' && (
                      <button
                        type="button"
                        onClick={() => onPreviewArticle(art.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
                        title="前台查看"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleTogglePinClick(art)}
                      disabled={busyArticleId === art.id}
                      className={`p-1.5 rounded-lg disabled:opacity-60 ${
                        art.pinned
                          ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40'
                          : 'text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                      title="切换置顶"
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openArticleEditor(art)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>编辑</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteArticleClick(art.id)}
                      disabled={busyArticleId === art.id}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 disabled:opacity-60"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: DIARIES MANAGEMENT */}
      {activeTab === 'diaries' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">管理所有私密每日日报与补写记录</p>
            <button
              type="button"
              onClick={() => {
                const nextDiary: DiaryFormState = {
                  id: null,
                  date: getTodayDateStr(),
                  time: getNowTimeStr(),
                  title: '',
                  content: DAILY_REPORT_TEMPLATE,
                  mood: 'focused',
                  tags: ['日报'],
                };
                diarySnapshotRef.current = JSON.stringify(nextDiary);
                setIsNewDiary(true);
                setEditingDiary(nextDiary);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <NotebookPen className="w-4 h-4" />
              <span>新建 / 补写日记</span>
            </button>
          </div>

          {editingDiary && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {isNewDiary ? '新建日报' : '编辑日报'}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingDiary({
                        ...editingDiary,
                        content: editingDiary.content.trim()
                          ? `${editingDiary.content}\n\n${DAILY_REPORT_TEMPLATE}`
                          : DAILY_REPORT_TEMPLATE,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>插入日报模板</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      requestGuardedAction(
                        isDiaryDirty,
                        '当前日记有未保存的修改，关闭后改动将会丢失。',
                        () => setEditingDiary(null),
                      )
                    }
                    className="p-1 text-zinc-400 hover:text-zinc-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="date"
                  value={editingDiary.date}
                  onChange={(e) => setEditingDiary({ ...editingDiary, date: e.target.value })}
                  className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
                <input
                  type="time"
                  value={editingDiary.time}
                  onChange={(e) => setEditingDiary({ ...editingDiary, time: e.target.value })}
                  className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
                <input
                  type="text"
                  value={editingDiary.title}
                  onChange={(e) => setEditingDiary({ ...editingDiary, title: e.target.value })}
                  placeholder={`${editingDiary.date} 每日日报`}
                  className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>

              <div className="space-y-1">
                <textarea
                  rows={7}
                  value={editingDiary.content}
                  onChange={(e) => setEditingDiary({ ...editingDiary, content: e.target.value })}
                  {...diaryImageUpload.textareaProps}
                  placeholder="支持 Markdown、截图 Ctrl+V 粘贴或拖拽图片..."
                  className={`w-full p-3 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 ${
                    diaryImageUpload.isDraggingOver ? 'ring-2 ring-indigo-500' : ''
                  }`}
                />
                <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                  <span>支持截图 Ctrl+V 粘贴或拖拽图片自动上传</span>
                  {diaryImageUpload.uploading && (
                    <span className="text-indigo-500 font-medium">正在上传图片…</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    requestGuardedAction(
                      isDiaryDirty,
                      '当前日记有未保存的修改，关闭后改动将会丢失。',
                      () => setEditingDiary(null),
                    )
                  }
                  disabled={savingDiary}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveDiarySubmit}
                  disabled={savingDiary}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingDiary ? '保存中…' : '保存日记'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {[...data.diaries]
              .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
              .map((d) => (
                <div
                  key={d.id}
                  className="glass-card rounded-xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-400 tabular-nums">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{d.date}</span>
                      <span>{d.time}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate mt-0.5">
                      {d.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const editCopy: DiaryFormState = {
                          id: d.id,
                          date: d.date,
                          time: d.time,
                          title: d.title,
                          mood: d.mood,
                          tags: [...d.tags],
                          content: d.content,
                        };
                        diarySnapshotRef.current = JSON.stringify(editCopy);
                        setIsNewDiary(false);
                        setEditingDiary(editCopy);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDiaryClick(d.id)}
                      disabled={busyDiaryId === d.id}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORIES & TAGS */}
      {activeTab === 'taxonomy' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Categories */}
          <section className="glass-card-reading rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <FolderPlus className="w-4 h-4 text-zinc-400" />
              <span>分类管理</span>
            </h3>

            <form onSubmit={handleAddCategory} className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="新分类名称"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingCategory ? '添加中…' : '添加'}
                </button>
              </div>
              <input
                type="text"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="分类简介（选填）"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400">标识色：</span>
                {DOT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCatColor(color)}
                    className={`w-4 h-4 rounded-full transition-transform ${
                      newCatColor === color ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-zinc-100 scale-110' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </form>

            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              {data.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.dotColor }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {cat.name}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">{cat.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id)}
                    disabled={busyCategoryId === cat.id}
                    className="p-1 text-zinc-400 hover:text-rose-600 disabled:opacity-60"
                    title="删除分类"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Tags */}
          <section className="glass-card-reading rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-zinc-400" />
              <span>标签总览</span>
            </h3>

            {renamingTag && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                <input
                  type="text"
                  value={renamingTag.next}
                  onChange={(e) => setRenamingTag({ ...renamingTag, next: e.target.value })}
                  className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900"
                />
                <button
                  type="button"
                  disabled={busyTag === renamingTag.old}
                  onClick={() => handleRenameTagSubmit(renamingTag.old, renamingTag.next)}
                  className="px-2.5 py-1 rounded-lg text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-60"
                >
                  {busyTag === renamingTag.old ? '保存中…' : '保存'}
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingTag(null)}
                  className="text-xs text-zinc-500 px-1.5"
                >
                  取消
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              {allTagStats.map(([tag, count]) => (
                <div
                  key={tag}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 text-xs"
                >
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    #{tag}{' '}
                    <span className="text-zinc-400 font-normal ml-1">({count} 篇)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRenamingTag({ old: tag, next: tag })}
                      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTagClick(tag)}
                      disabled={busyTag === tag}
                      className="text-zinc-400 hover:text-rose-600 disabled:opacity-60"
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: SITE SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSettingsSubmit}
            className="glass-card-reading rounded-2xl p-5 sm:p-6 space-y-4"
          >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                博客名称
              </label>
              <input
                type="text"
                value={settingsForm.blogTitle}
                onChange={(e) => setSettingsForm({ ...settingsForm, blogTitle: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                副标题 / Slogan
              </label>
              <input
                type="text"
                value={settingsForm.blogSubtitle}
                onChange={(e) => setSettingsForm({ ...settingsForm, blogSubtitle: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                博主昵称
              </label>
              <input
                type="text"
                value={settingsForm.authorName}
                onChange={(e) => setSettingsForm({ ...settingsForm, authorName: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                个人主页 ID
              </label>
              <input
                type="text"
                value={settingsForm.authorHandle}
                onChange={(e) => setSettingsForm({ ...settingsForm, authorHandle: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                所在城市
              </label>
              <input
                type="text"
                value={settingsForm.authorLocation}
                onChange={(e) => setSettingsForm({ ...settingsForm, authorLocation: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                联系邮箱
              </label>
              <input
                type="email"
                value={settingsForm.authorEmail}
                onChange={(e) => setSettingsForm({ ...settingsForm, authorEmail: e.target.value })}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
              个人简介（左侧名片展示）
            </label>
            <textarea
              rows={2}
              value={settingsForm.authorBio}
              onChange={(e) => setSettingsForm({ ...settingsForm, authorBio: e.target.value })}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                「关于自己 / 个人简历」Markdown 内容
              </label>
              <span className="text-xs text-zinc-400">
                {aboutImageUpload.uploading ? '正在上传图片…' : '支持粘贴 / 拖拽图片'}
              </span>
            </div>
            <textarea
              rows={8}
              value={settingsForm.aboutContent}
              onChange={(e) => setSettingsForm({ ...settingsForm, aboutContent: e.target.value })}
              {...aboutImageUpload.textareaProps}
              className={`w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-white/5 ${
                aboutImageUpload.isDraggingOver ? 'ring-2 ring-indigo-500' : ''
              }`}
            />
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-end gap-3">
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? '保存中…' : '保存全部设置'}</span>
            </button>
          </div>
          </form>

          {/* 独立的管理员密码修改表单（需要原密码验证） */}
          <form onSubmit={handlePasswordSubmit} className="glass-card-reading rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                修改管理员密码
              </h3>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              需要输入当前密码校验；修改成功后其它已登录的旧会话会失效，当前浏览器保持登录。
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  当前密码
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={pwdOld}
                  onChange={(e) => {
                    setPwdOld(e.target.value);
                    setPwdError(null);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  新密码（至少 6 位）
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pwdNew}
                  onChange={(e) => {
                    setPwdNew(e.target.value);
                    setPwdError(null);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  确认新密码
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={pwdConfirm}
                  onChange={(e) => {
                    setPwdConfirm(e.target.value);
                    setPwdError(null);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
            </div>

            {pwdError && <p className="text-xs text-rose-600 dark:text-rose-400">{pwdError}</p>}

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={pwdSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{pwdSaving ? '提交中…' : '修改密码'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
