'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Saat true, modal tidak bisa ditutup (mis. sedang mengunggah) */
  locked?: boolean;
  maxWidth?: string;
  children: React.ReactNode;
}

/**
 * Modal yang dirender lewat portal ke <body>, sehingga selalu menutupi seluruh
 * layar (termasuk header & sidebar) dan tidak terpengaruh stacking context halaman.
 */
export default function Modal({ onClose, title, subtitle, locked = false, maxWidth = 'max-w-lg', children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !locked) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [locked, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50"
      onMouseDown={e => { if (e.target === e.currentTarget && !locked) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title}
        className={clsx('bg-white rounded-2xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden', maxWidth)}>
        <div className="px-6 py-4 border-b border-[#E9ECEF] flex items-start justify-between gap-4 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[#1A1C1E]">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={() => !locked && onClose()} disabled={locked} aria-label="Tutup"
            className="w-8 h-8 -mr-2 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-30">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}