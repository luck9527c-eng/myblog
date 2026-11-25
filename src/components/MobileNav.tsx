import React from 'react';
import {
  Archive,
  FileText,
  Menu,
  NotebookPen,
  Search,
  Settings,
  User,
  X,
} from 'lucide-react';
import type { AppView } from '../types';

interface MobileTopBarProps {
  blogTitle: string;
  isAdmin: boolean;
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
  hasActiveFilter: boolean;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  blogTitle,
  isAdmin,
  onOpenLeftDrawer,
  onOpenRightDrawer,
  hasActiveFilter,
}) => {
  return (
    <header className="lg:hidden sticky top-0 z-30 h-14 px-3 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl border-b border-white/60 dark:border-white/10 flex items-center justify-between shadow-2xs">
      <button
        type="button"
        onClick={onOpenLeftDrawer}
        className="p-2 -ml-1 rounded-xl text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10"
        aria-label="打开左侧菜单"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
          {blogTitle}
        </span>
        {isAdmin && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-500/25 dark:text-emerald-300 shrink-0">
            管理中
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenRightDrawer}
        className="relative p-2 -mr-1 rounded-xl text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10"
        aria-label="打开搜索与筛选"
      >
        <Search className="w-5 h-5" />
        {hasActiveFilter && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500" />
        )}
      </button>
    </header>
  );
};

interface MobileBottomNavProps {
  currentView: AppView;
  isAdmin: boolean;
  onNavigate: (view: AppView) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  isAdmin,
  onNavigate,
}) => {
  const itemClass = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center py-2 text-[11px] font-medium transition-colors ${
      active
        ? 'text-indigo-600 dark:text-indigo-400'
        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`;

  return (
    <nav
      aria-label="移动端底部导航"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-xl border-t border-white/60 dark:border-white/10 flex items-center pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.04)]"
    >
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className={itemClass(currentView === 'home' || currentView === 'article')}
      >
        <FileText className="w-4 h-4 mb-0.5" />
        <span>首页</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('archive')}
        className={itemClass(currentView === 'archive')}
      >
        <Archive className="w-4 h-4 mb-0.5" />
        <span>归档</span>
      </button>

      {isAdmin ? (
        <>
          <button
            type="button"
            onClick={() => onNavigate('diary')}
            className={itemClass(currentView === 'diary')}
          >
            <NotebookPen className="w-4 h-4 mb-0.5" />
            <span>日记</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className={itemClass(currentView === 'admin')}
          >
            <Settings className="w-4 h-4 mb-0.5" />
            <span>后台</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onNavigate('about')}
          className={itemClass(currentView === 'about')}
        >
          <User className="w-4 h-4 mb-0.5" />
          <span>关于自己</span>
        </button>
      )}
    </nav>
  );
};

interface MobileDrawerProps {
  isOpen: boolean;
  side: 'left' | 'right';
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  side,
  title,
  onClose,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/35 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={`relative z-10 w-[84vw] max-w-[320px] h-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl border-white/60 dark:border-white/10 shadow-2xl flex flex-col ${
          side === 'left' ? 'mr-auto border-r' : 'ml-auto border-l'
        }`}
      >
        <div className="h-13 px-4 border-b border-zinc-200/60 dark:border-white/10 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};
