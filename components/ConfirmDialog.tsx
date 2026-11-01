'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true = tombol konfirmasi merah (untuk aksi menghapus) */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Pengganti window.confirm(): dialog konfirmasi bergaya SIDOKU,
 * dirender lewat portal di atas modal lain.
 */
export default function ConfirmDialog({
  title, message, confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal',
  danger = false, loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus(); // fokus awal ke "Batal" supaya tidak terhapus tak sengaja
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.stopImmediatePropagation(); // jangan ikut menutup modal di bawahnya
        if (!loading) onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [loading, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50"
      onMouseDown={e => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div role="alertdialog" aria-modal="true" aria-label={title}
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <div className="flex items-start gap-4">
          <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border',
            danger ? 'bg-red-50 border-red-100 text-red-500' : 'bg-blue-50 border-blue-100 text-[#1E3A8A]')}>
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[#1A1C1E]">{title}</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button ref={cancelRef} onClick={onCancel} disabled={loading}
            className="px-4 py-2 rounded-xl border border-[#E9ECEF] text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={clsx('px-4 py-2 rounded-xl text-xs font-black text-white transition-colors flex items-center gap-2 disabled:opacity-70',
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[#1E3A8A] hover:bg-[#1E3A8A]/90')}>
            {loading && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}