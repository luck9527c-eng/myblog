import React, { useState } from 'react';
import { KeyRound, Lock, X } from 'lucide-react';
import { getErrorMessage } from '../api/client';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 提交密码到 POST /api/auth/login；失败时抛错，由本组件展示后端 detail */
  onSubmit: (password: string) => Promise<void>;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!password.trim()) {
      setError('请输入管理员密码');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(password);
      setPassword('');
    } catch (err) {
      setError(getErrorMessage(err, '登录失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="管理员身份验证"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-md"
    >
      <div className="glass-card-reading w-full max-w-sm rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                管理员身份验证
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                解锁「每日日记」与「管理后台」
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              管理密码
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                disabled={submitting}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="请输入管理员密码"
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-zinc-100/20 disabled:opacity-70"
              />
            </div>
            {error && <p className="mt-1.5 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4.5 py-2 rounded-xl text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? '登录中…' : '登录解锁'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
