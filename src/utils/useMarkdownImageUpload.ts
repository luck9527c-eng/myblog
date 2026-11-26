import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import { getErrorMessage } from '../api/client';
import { uploadImage } from '../api/endpoints';

interface UseMarkdownImageUploadOptions {
  value: string;
  onChange: (nextValue: string) => void;
  onError: (message: string) => void;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i;

function isSupportedImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) {
    return file.type !== 'image/svg+xml';
  }
  return IMAGE_EXT_RE.test(file.name || '');
}

function buildAltText(file: File): string {
  const base = (file.name || '').replace(/\.[^.]+$/, '').replace(/[[\]()\r\n]/g, '').trim();
  if (!base || base.toLowerCase() === 'image') return '图片';
  return base;
}

/**
 * Provides Ctrl+V clipboard paste and drag-and-drop image upload handlers
 * for Markdown <textarea> editors.
 */
export function useMarkdownImageUpload({
  value,
  onChange,
  onError,
}: UseMarkdownImageUploadOptions) {
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [uploadingCount, setUploadingCount] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const uploadFilesAtCursor = useCallback(
    (files: File[], textarea: HTMLTextAreaElement | null) => {
      if (files.length === 0) return;

      const current = latestValueRef.current;
      const start = textarea?.selectionStart ?? current.length;
      const end = textarea?.selectionEnd ?? current.length;

      const tokens: Array<{ file: File; placeholder: string }> = files.map((file, idx) => {
        const token = `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          file,
          placeholder: `![正在上传图片(${token})...]()`,
        };
      });

      const prefix = start > 0 && current[start - 1] !== '\n' ? '\n' : '';
      const suffix = end < current.length && current[end] !== '\n' ? '\n' : '';
      const inserted = `${prefix}${tokens.map((t) => t.placeholder).join('\n')}${suffix}`;
      const nextWithPlaceholders = `${current.slice(0, start)}${inserted}${current.slice(end)}`;

      latestValueRef.current = nextWithPlaceholders;
      onChangeRef.current(nextWithPlaceholders);

      tokens.forEach(({ file, placeholder }) => {
        setUploadingCount((c) => c + 1);
        void uploadImage(file)
          .then((res) => {
            const alt = buildAltText(file);
            const markdown = `![${alt}](${res.url})`;
            const updated = latestValueRef.current.replace(placeholder, markdown);
            latestValueRef.current = updated;
            onChangeRef.current(updated);
          })
          .catch((err) => {
            const cleaned = latestValueRef.current
              .replace(`\n${placeholder}`, '')
              .replace(`${placeholder}\n`, '')
              .replace(placeholder, '');
            latestValueRef.current = cleaned;
            onChangeRef.current(cleaned);
            onErrorRef.current(getErrorMessage(err, '图片上传失败'));
          })
          .finally(() => {
            setUploadingCount((c) => Math.max(0, c - 1));
          });
      });
    },
    [],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const filesFromItems = items
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file && isSupportedImageFile(file)));

      const fallbackFiles =
        filesFromItems.length > 0
          ? filesFromItems
          : Array.from(e.clipboardData?.files ?? []).filter(isSupportedImageFile);

      if (fallbackFiles.length === 0) return;

      e.preventDefault();
      uploadFilesAtCursor(fallbackFiles, e.currentTarget);
    },
    [uploadFilesAtCursor],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    const types = Array.from(e.dataTransfer?.types ?? []);
    if (types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      setIsDraggingOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter(isSupportedImageFile);
      if (files.length === 0) return;

      e.preventDefault();
      uploadFilesAtCursor(files, e.currentTarget);
    },
    [uploadFilesAtCursor],
  );

  return {
    uploading: uploadingCount > 0,
    isDraggingOver,
    textareaProps: {
      onPaste: handlePaste,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
