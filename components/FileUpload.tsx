'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  UploadCloud, CheckCircle2, XCircle, Loader2, Trash2,
  FileText, Eye, X, AlertCircle, FileImage, FileSpreadsheet, Film,
} from 'lucide-react';
import { clsx } from 'clsx';
import ConfirmDialog from '@/components/ConfirmDialog';

interface Props {
  documentId: number;
  itemName: string;
  requiredFormat: string;
  kebutuhan_file: number;
  uploaded_count?: number;
  status?: string;
  existingFile?: { url: string; name: string; format: string };
  file_urls?: string[];
  /** action: 'upload' setelah file berhasil diunggah, 'delete' setelah file dihapus */
  onComplete: (action?: 'upload' | 'delete') => void;
  /** Dipanggil saat proses upload/hapus mulai & selesai (untuk mengunci penutupan modal) */
  onBusyChange?: (busy: boolean) => void;
  /** Jika diisi, tombol "Selesai" muncul saat semua file sudah lengkap */
  onDone?: () => void;
}

const MAX_SIZE_MB = 50; // sama dengan batas bucket audit-files

// Token format di data eviden -> ekstensi yang diterima.
// Token lain (mis. "TTE") hanya keterangan, bukan format file.
const EXT_MAP: Record<string, string[]> = {
  PDF:   ['PDF'],
  JPEG:  ['JPG', 'JPEG'],
  JPG:   ['JPG', 'JPEG'],
  PNG:   ['PNG'],
  MP4:   ['MP4'],
  MPEG:  ['MPEG', 'MPG', 'MP4'],
  EXCEL: ['XLS', 'XLSX', 'CSV'],
  XLSX:  ['XLSX'],
  XLS:   ['XLS'],
};

function fileKind(ext: string) {
  const e = ext.toUpperCase();
  if (e === 'PDF') return 'pdf';
  if (['JPG', 'JPEG', 'PNG'].includes(e)) return 'img';
  if (['MP4', 'MPEG', 'MPG'].includes(e)) return 'vid';
  if (['XLS', 'XLSX', 'CSV'].includes(e)) return 'xls';
  return 'file';
}

function KindIcon({ ext, size = 16 }: { ext: string; size?: number }) {
  const k = fileKind(ext);
  if (k === 'img') return <FileImage size={size} className="text-blue-500" />;
  if (k === 'vid') return <Film size={size} className="text-purple-500" />;
  if (k === 'xls') return <FileSpreadsheet size={size} className="text-emerald-600" />;
  return <FileText size={size} className="text-red-400" />;
}

type QueueItem = { name: string; state: 'wait' | 'up' | 'ok' | 'err' };

export default function FileUpload({
  documentId, itemName, requiredFormat,
  kebutuhan_file = 1, uploaded_count = 0,
  file_urls = [], onComplete, onBusyChange, onDone,
}: Props) {
  const [busy, setBusy]               = useState(false);
  const [errors, setErrors]           = useState<string[]>([]);
  const [queue, setQueue]             = useState<QueueItem[]>([]);
  const [dragActive, setDragActive]   = useState(false);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [confirmDel, setConfirmDel]   = useState<{ type: 'one'; url: string } | { type: 'all' } | null>(null);
  const inputRef                      = useRef<HTMLInputElement>(null);

  useEffect(() => { onBusyChange?.(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Format yang diterima
  const tokens      = requiredFormat.toUpperCase().split(/\s+/).filter(Boolean);
  const known       = tokens.filter(t => EXT_MAP[t]);
  const allowedExts = Array.from(new Set((known.length ? known : [tokens[0] ?? 'PDF']).flatMap(t => EXT_MAP[t] ?? [t])));
  const acceptAttr  = allowedExts.map(e => `.${e.toLowerCase()}`).join(',');
  const acceptLabel = (known.length ? known : [tokens[0] ?? 'PDF']).join(' / ');

  const remaining = Math.max(0, kebutuhan_file - uploaded_count);
  const isFull    = remaining === 0;
  const percent   = kebutuhan_file > 0 ? Math.min(100, Math.round((uploaded_count / kebutuhan_file) * 100)) : 0;

  function computeStatus(count: number) {
    if (count <= 0) return 'missing';
    if (count >= kebutuhan_file) return 'done';
    return 'partial';
  }

  // ── Upload (bisa banyak file sekaligus) ────────────────────────────────────
  async function handleFiles(list: FileList | File[]) {
    const all = Array.from(list);
    if (all.length === 0 || busy) return;

    const errs: string[] = [];
    const valid: File[] = [];
    for (const f of all) {
      const ext = f.name.split('.').pop()?.toUpperCase() ?? '';
      if (!allowedExts.includes(ext)) { errs.push(`${f.name}: format salah, wajib ${acceptLabel}.`); continue; }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) { errs.push(`${f.name}: ukuran melebihi ${MAX_SIZE_MB} MB.`); continue; }
      valid.push(f);
    }
    let toUpload = valid;
    if (valid.length > remaining) {
      errs.push(`${valid.length - remaining} file tidak diunggah karena sisa slot hanya ${remaining}.`);
      toUpload = valid.slice(0, remaining);
    }
    setErrors(errs);
    if (toUpload.length === 0) { if (inputRef.current) inputRef.current.value = ''; return; }

    setBusy(true);
    setQueue(toUpload.map(f => ({ name: f.name, state: 'wait' as const })));

    const newUrls: string[] = [];
    for (let i = 0; i < toUpload.length; i++) {
      const f = toUpload[i];
      setQueue(q => q.map((x, idx) => idx === i ? { ...x, state: 'up' } : x));
      try {
        const ext  = f.name.split('.').pop()!.toLowerCase();
        const path = `audits/${documentId}_${Date.now()}_${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from('audit-files').upload(path, f, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('audit-files').getPublicUrl(path);
        newUrls.push(publicUrl);
        setQueue(q => q.map((x, idx) => idx === i ? { ...x, state: 'ok' } : x));
      } catch (err: any) {
        setQueue(q => q.map((x, idx) => idx === i ? { ...x, state: 'err' } : x));
        setErrors(prev => [...prev, `${f.name}: ${err?.message || 'gagal diunggah.'}`]);
      }
    }

    if (newUrls.length > 0) {
      try {
        const urls     = [...file_urls, ...newUrls];
        const count    = uploaded_count + newUrls.length;
        const { error: dbErr } = await supabase.from('audit_documents').update({
          file_url:       urls[urls.length - 1],
          file_urls:      urls,
          is_uploaded:    true,
          uploaded_count: count,
          status:         computeStatus(count),
          updated_at:     new Date().toISOString(),
        }).eq('id', documentId);
        if (dbErr) throw dbErr;
        onComplete('upload');
      } catch (err: any) {
        setErrors(prev => [...prev, err?.message || 'Gagal menyimpan data.']);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    setTimeout(() => setQueue([]), 1200);
  }

  // ── Hapus satu file ────────────────────────────────────────────────────────
  async function handleDeleteOne(urlToDelete: string) {
    setBusy(true); setErrors([]);
    try {
      await removeFromStorage([urlToDelete]);
      const urls  = file_urls.filter(u => u !== urlToDelete);
      const { error } = await supabase.from('audit_documents').update({
        file_url:       urls[urls.length - 1] ?? null,
        file_urls:      urls,
        is_uploaded:    urls.length > 0,
        uploaded_count: urls.length,
        status:         computeStatus(urls.length),
      }).eq('id', documentId);
      if (error) throw error;
      onComplete('delete');
    } catch (err: any) { setErrors([err?.message || 'Gagal menghapus file.']); }
    finally { setBusy(false); setConfirmDel(null); }
  }

  // ── Hapus semua file ───────────────────────────────────────────────────────
  async function handleDeleteAll() {
    setBusy(true); setErrors([]);
    try {
      await removeFromStorage(file_urls);
      const { error } = await supabase.from('audit_documents').update({
        file_url: null, file_urls: [], is_uploaded: false, uploaded_count: 0, status: 'missing',
      }).eq('id', documentId);
      if (error) throw error;
      onComplete('delete');
    } catch (err: any) { setErrors([err?.message || 'Gagal menghapus file.']); }
    finally { setBusy(false); setConfirmDel(null); }
  }

  async function removeFromStorage(urls: string[]) {
    for (const url of urls) {
      const path = url.split('/storage/v1/object/public/')[1];
      if (!path) continue;
      const bucket = path.split('/')[0];
      await supabase.storage.from(bucket).remove([path.split('/').slice(1).join('/')]);
    }
  }

  function onDrag(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  const previewExt = showPreview ? (showPreview.split('?')[0].split('.').pop() ?? '').toUpperCase() : '';

  return (
    <div className="flex flex-col gap-5">

      {/* ── Pratinjau (layar penuh) ───────────────────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 z-[300] bg-black/60 p-4 sm:p-8 flex items-center justify-center" onClick={() => setShowPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl h-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-[#E9ECEF] flex items-center justify-between">
              <span className="text-xs font-black text-[#1E3A8A] uppercase tracking-widest">Pratinjau</span>
              <div className="flex items-center gap-2">
                <a href={showPreview} target="_blank" rel="noreferrer" className="text-[11px] font-black text-[#1E3A8A] hover:underline">Buka di tab baru</a>
                <button onClick={() => setShowPreview(null)} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 overflow-hidden">
              {previewExt === 'PDF' ? (
                <iframe src={showPreview} className="w-full h-full border-none" />
              ) : fileKind(previewExt) === 'img' ? (
                <div className="w-full h-full flex items-center justify-center p-6">
                  <img src={showPreview} alt="Pratinjau" className="max-w-full max-h-full object-contain rounded-lg shadow-xl" />
                </div>
              ) : fileKind(previewExt) === 'vid' ? (
                <div className="w-full h-full flex items-center justify-center p-6 bg-black">
                  <video src={showPreview} controls className="max-w-full max-h-full" />
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <FileText size={44} />
                  <p className="text-xs font-bold">Pratinjau tidak tersedia untuk format ini.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Ringkasan item ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-base font-black text-[#1A1C1E] leading-snug">{itemName}</h4>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={clsx('text-[9px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider',
                isFull ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : uploaded_count > 0 ? 'text-amber-700 bg-amber-50 border-amber-200'
                : 'text-red-600 bg-red-50 border-red-200')}>
                {isFull ? 'Lengkap' : uploaded_count > 0 ? 'Belum Lengkap' : 'Kosong'}
              </span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">{requiredFormat}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-black text-[#1E3A8A] leading-none">{uploaded_count}<span className="text-sm text-slate-300">/{kebutuhan_file}</span></p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">file</p>
          </div>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-4">
          <div className={clsx('h-full rounded-full transition-all duration-500',
            isFull ? 'bg-emerald-500' : uploaded_count > 0 ? 'bg-amber-400' : 'bg-slate-200')} style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* ── File yang sudah diunggah ──────────────────────────────────────── */}
      {file_urls.length > 0 && (
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">File Terunggah ({file_urls.length})</p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {file_urls.map((url, i) => {
              const ext = (url.split('?')[0].split('.').pop() ?? '').toUpperCase();
              return (
                <div key={url} className="flex items-center gap-3 px-3 py-2 bg-[#F8F9FB] rounded-xl border border-[#E9ECEF]">
                  <KindIcon ext={ext} />
                  <span className="text-[11px] font-black text-slate-600 flex-1 truncate">File {i + 1}</span>
                  <span className="text-[9px] font-black text-slate-400 uppercase">{ext}</span>
                  <button onClick={() => setShowPreview(url)} title="Lihat" aria-label="Lihat file"
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-[#1E3A8A] hover:bg-blue-50 flex items-center justify-center transition-colors"><Eye size={14} /></button>
                  <button onClick={() => setConfirmDel({ type: 'one', url })} disabled={busy} title="Hapus" aria-label="Hapus file"
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors disabled:opacity-40"><X size={14} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Area unggah / status lengkap ──────────────────────────────────── */}
      {isFull ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0"><CheckCircle2 size={20} className="text-emerald-600" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-emerald-800">Semua file sudah lengkap</p>
            <p className="text-[11px] text-emerald-600">Untuk menambah atau mengganti file, hapus salah satu file dulu.</p>
          </div>
          {onDone && <button onClick={onDone} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-colors flex-shrink-0">Selesai</button>}
        </div>
      ) : (
        <div
          role="button" tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
          onDragEnter={onDrag} onDragLeave={onDrag} onDragOver={onDrag} onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          className={clsx(
            'rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]/30',
            busy ? 'cursor-default border-[#E9ECEF] bg-[#F8F9FB]'
            : dragActive ? 'cursor-pointer border-[#1E3A8A] bg-blue-50'
            : 'cursor-pointer border-slate-200 hover:border-[#1E3A8A]/40 hover:bg-[#F8F9FB]')}
        >
          <input ref={inputRef} type="file" className="hidden" accept={acceptAttr} multiple={remaining > 1} disabled={busy}
            onChange={e => e.target.files && handleFiles(e.target.files)} />
          <div className={clsx('w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3 transition-colors',
            dragActive ? 'bg-[#1E3A8A] text-white' : 'bg-blue-50 text-[#1E3A8A]')}>
            {busy ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
          </div>
          {busy ? (
            <p className="text-sm font-black text-[#1E3A8A]">Mengunggah...</p>
          ) : (
            <>
              <p className="text-sm font-black text-[#1A1C1E]">
                {dragActive ? 'Lepaskan file di sini' : <>Tarik file ke sini atau <span className="text-[#1E3A8A] underline underline-offset-2">pilih dari komputer</span></>}
              </p>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {acceptLabel} · maks. {MAX_SIZE_MB} MB per file · sisa {remaining} file{remaining > 1 ? ' (bisa pilih banyak sekaligus)' : ''}
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Antrean unggah ────────────────────────────────────────────────── */}
      {queue.length > 0 && (
        <div className="space-y-1.5">
          {queue.map((q, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#F8F9FB] border border-[#E9ECEF] text-[11px] font-bold text-slate-600">
              {q.state === 'up'   && <Loader2 size={14} className="animate-spin text-[#1E3A8A] flex-shrink-0" />}
              {q.state === 'wait' && <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 flex-shrink-0" />}
              {q.state === 'ok'   && <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />}
              {q.state === 'err'  && <XCircle size={14} className="text-rose-500 flex-shrink-0" />}
              <span className="truncate flex-1">{q.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Pesan kesalahan ───────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
          {errors.map((m, i) => (
            <p key={i} className="text-[11px] font-bold text-rose-700 flex items-start gap-2"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" />{m}</p>
          ))}
        </div>
      )}

      {/* ── Hapus semua ───────────────────────────────────────────────────── */}
      {file_urls.length > 1 && (
        <button onClick={() => setConfirmDel({ type: 'all' })} disabled={busy}
          className="self-start flex items-center gap-1.5 text-[11px] font-black text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40">
          <Trash2 size={13} /> Hapus semua file
        </button>
      )}

      {/* ── Konfirmasi hapus ──────────────────────────────────────────────── */}
      {confirmDel && (
        <ConfirmDialog
          danger loading={busy}
          title={confirmDel.type === 'all' ? 'Hapus semua file?' : 'Hapus file ini?'}
          message={confirmDel.type === 'all'
            ? <>Semua <b>{file_urls.length} file</b> pada item ini akan dihapus permanen dan status item kembali menjadi <b>Kosong</b>.</>
            : <>File akan dihapus permanen dari penyimpanan. Tindakan ini tidak bisa dibatalkan.</>}
          confirmLabel="Ya, hapus"
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => confirmDel.type === 'all' ? handleDeleteAll() : handleDeleteOne(confirmDel.url)}
        />
      )}
    </div>
  );
}