'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Upload, Eye, Search, ChevronRight, ChevronDown, Loader2, RefreshCcw,
  FileText, ImageIcon, FileSpreadsheet, Film, FolderOpen, Info, X,
  CheckCircle2, LayoutGrid, Menu, ArrowLeft, Pencil, Trash2, Plus,
  ExternalLink, Download, RefreshCw, AlertTriangle,
  MessageSquare, CalendarDays, Send, Clock, Calendar, PanelLeftClose, PanelLeftOpen,
  ChevronLeft, File as FileIcon
} from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { clsx } from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuditDocument {
  id: number;
  unit: string;
  category_code: string;
  category_name: string;
  item_code: string;
  nama_eviden: string;
  format_req: string;
  kebutuhan_file: number;
  tahun?: string;
  is_uploaded: boolean;
  file_url?: string;
  file_urls?: string[];
  uploaded_count?: number;
  status: string;
  updated_at?: string;
  deadline?: string;
  deadline_label?: string;
}

interface CategoryGroup { code: string; name: string; items: AuditDocument[]; }
interface Catatan { id: number; document_id: number; penulis: string; isi: string; created_at: string; } // ✅ baru

const UP_CATEGORIES = [
  { code: '1.1', label: 'Penciptaan Arsip' },
  { code: '1.2', label: 'Penggunaan Arsip' },
  { code: '1.3', label: 'Pemeliharaan Arsip' },
  { code: '1.4', label: 'Penyusutan Arsip' },
  { code: '2.1', label: 'SDM Kearsipan' },
  { code: '2.2', label: 'Sarana & Prasarana' },
];
const UK_CATEGORIES = [
  { code: '1.1', label: 'Pengendalian Naskah Dinas' },
  { code: '1.2', label: 'Penggunaan Arsip' },
  { code: '1.3', label: 'Pemeliharaan Arsip' },
  { code: '1.4', label: 'Penyusutan Arsip' },
  { code: '2.1', label: 'SDM Kearsipan' },
  { code: '2.2', label: 'Sarana & Prasarana' },
];

function getStatusInfo(status: string) {
  if (status === 'done')    return { label: 'Lengkap',       color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (status === 'partial') return { label: 'Belum Lengkap', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  return                           { label: 'Kosong',        color: 'text-red-600 bg-red-50 border-red-200' };
}
function catPercent(items: AuditDocument[]) {
  if (!items.length) return 0;
  return Math.round((items.filter(i => i.status === 'done').length / items.length) * 100);
}
function catStatusColor(pct: number) {
  if (pct === 100) return 'text-emerald-600';
  if (pct > 0)     return 'text-amber-500';
  return 'text-red-500';
}
// ✅ Helper deadline
function getDeadlineInfo(deadline?: string) {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (diff < 0)  return { label: `Lewat ${Math.abs(diff)} hari`, color: 'text-red-700 bg-red-50 border-red-200',         urgent: true  };
  if (diff <= 3) return { label: `${diff} hari lagi`,            color: 'text-red-600 bg-red-50 border-red-200',         urgent: true  };
  if (diff <= 7) return { label: `${diff} hari lagi`,            color: 'text-amber-700 bg-amber-50 border-amber-200',   urgent: false };
  return               { label: `${diff} hari lagi`,             color: 'text-emerald-700 bg-emerald-50 border-emerald-200', urgent: false };
}

function FormatIcon({ fmt }: { fmt: string }) {
  const base = fmt.split(' ')[0];
  if (base === 'PDF')  return <FileText       size={15} className="text-red-400"    />;
  if (base === 'JPEG') return <ImageIcon       size={15} className="text-blue-400"   />;
  if (base === 'MP4' || base === 'MPEG') return <Film size={15} className="text-purple-400" />;
  return <FileSpreadsheet size={15} className="text-green-500" />;
}
function FormatBadge({ fmt }: { fmt: string }) {
  const base = fmt.split(' ')[0];
  const colors: Record<string, string> = {
    PDF:  'bg-red-50 text-red-600 border-red-100',
    JPEG: 'bg-blue-50 text-blue-600 border-blue-100',
    MP4:  'bg-purple-50 text-purple-600 border-purple-100',
    MPEG: 'bg-purple-50 text-purple-600 border-purple-100',
  };
  return <span className={clsx('text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider', colors[base] ?? 'bg-slate-50 text-slate-500 border-slate-100')}>{base}</span>;
}

function matchFormat(fmt: string, f: string) {
  const s = (fmt || '').toLowerCase();
  if (f === 'Video') return s.includes('mp4') || s.includes('mpeg');
  return s.includes(f.toLowerCase());
}

export default function UnitPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const unitLabel = unitId === 'UP' ? 'Unit Pengolah (UP)' : 'Unit Kearsipan (UK)';
  const CATEGORIES = unitId === 'UP' ? UP_CATEGORIES : UK_CATEGORIES;

  const [items, setItems]                       = useState<AuditDocument[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [selectedCatCode, setSelectedCatCode]   = useState(CATEGORIES[0].code);
  const [selectedItem, setSelectedItem]         = useState<AuditDocument | null>(null);
  const [searchQuery, setSearchQuery]           = useState('');
  const [statusFilter, setStatusFilter]         = useState<'all' | 'missing' | 'partial' | 'done'>('all');
  const [formatFilter, setFormatFilter]         = useState<'all' | 'PDF' | 'JPEG' | 'Excel' | 'Video'>('all');
  const [treeCollapsed, setTreeCollapsed]       = useState(false);
  const [uploadBusy, setUploadBusy]             = useState(false);
  const [expandedCats, setExpandedCats]         = useState<Set<string>>(new Set([CATEGORIES[0].code]));
  const [showUploadPanel, setShowUploadPanel]   = useState(false);
  const [showNotification, setShowNotification] = useState<string | null>(null);

  const [editItem, setEditItem]                 = useState<AuditDocument | null>(null);
  const [editNama, setEditNama]                 = useState('');
  const [editFormat, setEditFormat]             = useState('PDF');
  const [isSavingEdit, setIsSavingEdit]         = useState(false);
  const [deleteItem, setDeleteItem]             = useState<AuditDocument | null>(null);
  const [uploadItem, setUploadItem]             = useState<AuditDocument | null>(null);
  const [fileViewItem, setFileViewItem]         = useState<AuditDocument | null>(null);
  const [isDeletingFile, setIsDeletingFile]     = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<AuditDocument | null>(null);
  const [showReplaceUpload, setShowReplaceUpload] = useState(false);
  const [detailItem, setDetailItem]             = useState<AuditDocument | null>(null);
  // Tampilan detail item di panel tengah (muncul saat item di struktur direktori diklik)
  const [viewItemId, setViewItemId]             = useState<number | null>(null);
  const [previewUrl, setPreviewUrl]             = useState<string | null>(null);
  const [confirmDelOne, setConfirmDelOne]       = useState<{ item: AuditDocument; url: string } | null>(null);
  const [isDeletingOne, setIsDeletingOne]       = useState(false);
  const [editingDesc, setEditingDesc]           = useState(false);
  const [descValue, setDescValue]               = useState('');
  const [showAddModal, setShowAddModal]         = useState(false);
  const [addNama, setAddNama]                   = useState('');
  const [addFormat, setAddFormat]               = useState('PDF');
  const [addJumlah, setAddJumlah]               = useState(1);
  const [addTahun, setAddTahun]                 = useState('2025');
  const [isSavingAdd, setIsSavingAdd]           = useState(false);
  const [inlineEditId, setInlineEditId]         = useState<number | null>(null);
  const [inlineFormat, setInlineFormat]         = useState('');
  const [inlineJumlah, setInlineJumlah]        = useState(1);
  const [mobileView, setMobileView]             = useState<'table' | 'detail'>('table');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // ✅ State detail panel tabs
  const [detailTab, setDetailTab]               = useState<'info' | 'catatan'>('info');

  // ✅ State deadline
  const [editDeadline, setEditDeadline]         = useState(false);
  const [deadlineVal, setDeadlineVal]           = useState('');
  const [deadlineLabelVal, setDeadlineLabelVal] = useState('Normal');
  const [savingDeadline, setSavingDeadline]     = useState(false);

  // ✅ State catatan
  const [catatan, setCatatan]                   = useState<Catatan[]>([]);
  const [loadingCat, setLoadingCat]             = useState(false);
  const [newCatatan, setNewCatatan]             = useState('');
  const [penulisCat, setPenulisCat]             = useState('Operator');
  const [sendingCat, setSendingCat]             = useState(false);
  const [deletingCatId, setDeletingCatId]       = useState<number | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('audit_documents').select('*').eq('unit', unitId).order('item_code', { ascending: true });
      setItems(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [unitId]);
  useEffect(() => {
    try { setTreeCollapsed(localStorage.getItem('sidoku_tree_collapsed') === '1'); } catch {}
  }, []);

  const categoryGroups = useMemo<CategoryGroup[]>(() =>
    CATEGORIES.map(cat => ({ code: cat.code, name: cat.label, items: items.filter(i => i.category_code === cat.code) })),
    [items, unitId]
  );
  const currentGroup    = useMemo(() => categoryGroups.find(g => g.code === selectedCatCode), [categoryGroups, selectedCatCode]);
  const viewItem = useMemo(() => items.find(i => i.id === viewItemId) ?? null, [items, viewItemId]);
  const viewSiblings = useMemo(() => viewItem ? items.filter(i => i.category_code === viewItem.category_code) : [], [items, viewItem]);
  // Jika ada pencarian/filter aktif -> cari di SELURUH unit, bukan hanya folder yang terbuka
  const isFiltering = searchQuery.trim() !== '' || statusFilter !== 'all' || formatFilter !== 'all';
  const baseItems   = useMemo(() => isFiltering ? items : (currentGroup?.items ?? []), [isFiltering, items, currentGroup]);
  const filteredItems   = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return baseItems.filter(i =>
      (!q || i.nama_eviden.toLowerCase().includes(q) || i.item_code.toLowerCase().includes(q)) &&
      (statusFilter === 'all' || i.status === statusFilter) &&
      (formatFilter === 'all' || matchFormat(i.format_req, formatFilter))
    );
  }, [baseItems, searchQuery, statusFilter, formatFilter]);
  function resetFilters() { setSearchQuery(''); setStatusFilter('all'); setFormatFilter('all'); }
  const catStats = useMemo(() => {
    const its = currentGroup?.items ?? [];
    return { total: its.length, done: its.filter(i=>i.status==='done').length, partial: its.filter(i=>i.status==='partial').length, missing: its.filter(i=>i.status==='missing').length };
  }, [currentGroup]);
  const unitStats = useMemo(() => {
    const total = items.length, done = items.filter(i=>i.status==='done').length;
    return { total, done, percent: total > 0 ? Math.round((done/total)*100) : 0 };
  }, [items]);

  // ✅ Fetch catatan
  async function fetchCatatan(docId: number) {
    setLoadingCat(true);
    try {
      const { data } = await supabase.from('item_catatan').select('*').eq('document_id', docId).order('created_at', { ascending: true });
      setCatatan(data || []);
    } catch {} finally { setLoadingCat(false); }
  }

  function notify(msg: string) { setShowNotification(msg); setTimeout(() => setShowNotification(null), 3000); }
  function toggleCat(code: string) {
    setExpandedCats(prev => { const next = new Set(prev); next.has(code) ? next.delete(code) : next.add(code); return next; });
  }
  function selectCat(code: string) {
    setSelectedCatCode(code); setSelectedItem(null); setShowUploadPanel(false); setViewItemId(null);
    resetFilters(); if (!expandedCats.has(code)) toggleCat(code); setShowMobileSidebar(false);
  }
  function openUpload(item: AuditDocument) { setUploadItem(item); }

  // Buka item sebagai tampilan detail di panel tengah (sekaligus mengisi panel kanan)
  function openItemView(item: AuditDocument) {
    if (item.category_code !== selectedCatCode) setSelectedCatCode(item.category_code);
    resetFilters();
    setViewItemId(item.id);
    openDetail(item);
    setMobileView('table'); // di layar kecil, tampilkan detail item di tengah (panel kanan disembunyikan)
    setShowMobileSidebar(false);
  }
  // Hapus satu file saja dari item
  async function handleDeleteOneFile(item: AuditDocument, url: string) {
    setIsDeletingOne(true);
    try {
      const path = url.split('/storage/v1/object/public/')[1];
      if (path) await supabase.storage.from(path.split('/')[0]).remove([path.split('/').slice(1).join('/')]);
      const all: string[] = item.file_urls?.length ? item.file_urls : item.file_url ? [item.file_url] : [];
      const urls = all.filter(u => u !== url);
      const status = urls.length <= 0 ? 'missing' : urls.length >= item.kebutuhan_file ? 'done' : 'partial';
      const { error } = await supabase.from('audit_documents').update({
        file_url: urls[urls.length - 1] ?? null, file_urls: urls, is_uploaded: urls.length > 0,
        uploaded_count: urls.length, status, updated_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (error) throw error;
      notify('File berhasil dihapus'); fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); }
    finally { setIsDeletingOne(false); setConfirmDelOne(null); }
  }

  // ✅ openDetail diperluas: reset state catatan & deadline
  function openDetail(item: AuditDocument) {
    setDetailItem(item);
    setDescValue(item.nama_eviden);
    setEditingDesc(false);
    setDetailTab('info');
    setEditDeadline(false);
    setDeadlineVal(item.deadline?.slice(0, 10) ?? '');
    setDeadlineLabelVal(item.deadline_label ?? 'Normal');
    setMobileView('detail');
    fetchCatatan(item.id);
  }

  async function handleSaveEdit() {
    if (!editItem || !editNama.trim()) return;
    setIsSavingEdit(true);
    try {
      const { error } = await supabase.from('audit_documents').update({ nama_eviden: editNama.trim(), format_req: editFormat }).eq('id', editItem.id);
      if (error) throw error;
      notify('Item berhasil diperbarui'); setEditItem(null); fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); } finally { setIsSavingEdit(false); }
  }
  async function handleDelete(item: AuditDocument) {
    try {
      const { error } = await supabase.from('audit_documents').delete().eq('id', item.id);
      if (error) throw error;
      notify('Item berhasil dihapus'); setDeleteItem(null);
      if (detailItem?.id === item.id) setDetailItem(null);
      if (viewItemId === item.id) setViewItemId(null);
      fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); }
  }
  async function handleSaveDesc() {
    if (!detailItem || !descValue.trim()) return;
    try {
      const { error } = await supabase.from('audit_documents').update({ nama_eviden: descValue.trim() }).eq('id', detailItem.id);
      if (error) throw error;
      notify('Deskripsi diperbarui'); setEditingDesc(false); fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); }
  }
  async function handleAddFolder() {
    if (!addNama.trim()) return;
    setIsSavingAdd(true);
    try {
      const catItems = items.filter(i => i.category_code === selectedCatCode);
      const maxNo = catItems.reduce((max, i) => { const no = parseInt(i.item_code?.split('-').pop() ?? '0'); return no > max ? no : max; }, 0);
      const newCode = `${unitId}-${selectedCatCode}-${String(maxNo+1).padStart(2,'0')}`;
      const { error } = await supabase.from('audit_documents').insert([{ unit: unitId, category_code: selectedCatCode, category_name: currentGroup?.name ?? '', item_code: newCode, nama_eviden: addNama.trim(), format_req: addFormat, kebutuhan_file: addJumlah, tahun: addTahun, is_uploaded: false, status: 'missing' }]);
      if (error) throw error;
      notify('Folder baru ditambahkan'); setShowAddModal(false);
      setAddNama(''); setAddFormat('PDF'); setAddJumlah(1); setAddTahun('2025'); fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); } finally { setIsSavingAdd(false); }
  }
  async function handleSaveInline(item: AuditDocument) {
    try {
      const { error } = await supabase.from('audit_documents').update({ format_req: inlineFormat, kebutuhan_file: inlineJumlah }).eq('id', item.id);
      if (error) throw error;
      notify('Format diperbarui'); setInlineEditId(null); fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); }
  }
  // Supabase: ?download=<nama> membuat server mengirim Content-Disposition: attachment,
  // sehingga browser mengunduh ke lokal alih-alih membuka tab baru.
  function downloadUrl(url: string) {
    const name = decodeURIComponent(url.split('?')[0].split('/').pop() || 'file');
    return `${url.split('?')[0]}?download=${encodeURIComponent(name)}`;
  }
  async function handleDeleteFile(item: AuditDocument) {
    setIsDeletingFile(true);
    try {
      // Hapus semua file dari storage
      const urls: string[] = (item as any).file_urls?.length
        ? (item as any).file_urls
        : item.file_url ? [item.file_url] : [];

      for (const url of urls) {
        const path = url.split('/storage/v1/object/public/')[1];
        if (path) {
          const bucket = path.split('/')[0];
          const filePath = path.split('/').slice(1).join('/');
          await supabase.storage.from(bucket).remove([filePath]);
        }
      }

      // Reset semua kolom file ke awal
      const { error } = await supabase
        .from('audit_documents')
        .update({
          is_uploaded: false,
          file_url: null,
          file_urls: [],
          uploaded_count: 0,
          status: 'missing',
        })
        .eq('id', item.id);

      if (error) throw error;
      notify('File dihapus'); setFileViewItem(null); fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); } finally { setIsDeletingFile(false); }
  }

  // ✅ Simpan deadline
  async function handleSaveDeadline() {
    if (!detailItem) return;
    setSavingDeadline(true);
    try {
      const { error } = await supabase.from('audit_documents').update({ deadline: deadlineVal || null, deadline_label: deadlineLabelVal }).eq('id', detailItem.id);
      if (error) throw error;
      notify('Deadline disimpan'); setEditDeadline(false); fetchData();
    } catch (err: any) { notify('Gagal: ' + err.message); } finally { setSavingDeadline(false); }
  }
  async function handleRemoveDeadline() {
    if (!detailItem) return;
    await supabase.from('audit_documents').update({ deadline: null, deadline_label: null }).eq('id', detailItem.id);
    setDeadlineVal(''); setEditDeadline(false); fetchData();
  }

  // ✅ Kirim & hapus catatan
  async function handleSendCatatan() {
    if (!detailItem || !newCatatan.trim()) return;
    setSendingCat(true);
    try {
      const { error } = await supabase.from('item_catatan').insert([{ document_id: detailItem.id, penulis: penulisCat || 'Operator', isi: newCatatan.trim() }]);
      if (error) throw error;
      setNewCatatan(''); fetchCatatan(detailItem.id);
    } catch (err: any) { notify('Gagal: ' + err.message); } finally { setSendingCat(false); }
  }
  async function handleDeleteCatatan(id: number) {
    setDeletingCatId(id);
    try { await supabase.from('item_catatan').delete().eq('id', id); setCatatan(p => p.filter(c => c.id !== id)); }
    catch {} finally { setDeletingCatId(null); }
  }

  if (loading && items.length === 0) return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-[#1E3A8A]" size={40} />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Memuat Data...</p>
      </div>
    </div>
  );

  // Struktur direktori: simpan pilihan ciut/buka (desktop)
  function toggleTree() {
    setTreeCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidoku_tree_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }

  const SidebarContent = ({ compact = false }: { compact?: boolean }) => (
    <>
      <div className={clsx('border-b border-[#E9ECEF] flex items-center', compact ? 'justify-center py-3' : 'px-4 py-3.5 justify-between')}>
        {!compact && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Struktur Direktori</p>}
        <button onClick={() => setShowMobileSidebar(false)} className="lg:hidden text-slate-300 hover:text-slate-500"><X size={16} /></button>
        <button onClick={toggleTree} aria-label={compact ? 'Perluas struktur direktori' : 'Ciutkan struktur direktori'}
          title={compact ? 'Perluas struktur direktori' : 'Ciutkan struktur direktori'}
          className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-slate-400 hover:text-[#1E3A8A] hover:bg-slate-50 transition-colors">
          {compact ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      {compact ? (
        <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1">
          {categoryGroups.map(group => {
            const pct = catPercent(group.items);
            const isActive = selectedCatCode === group.code;
            return (
              <button key={group.code} onClick={() => selectCat(group.code)} title={`${group.code} ${group.name} · ${pct}%`}
                className={clsx('w-10 py-1.5 rounded-lg flex flex-col items-center gap-0.5 transition-all',
                  isActive ? 'bg-[#1E3A8A] text-white' : 'text-slate-500 hover:bg-slate-50')}>
                <FolderOpen size={14} className={isActive ? 'text-white/80' : 'text-amber-400'} />
                <span className="text-[8px] font-black leading-none">{group.code}</span>
              </button>
            );
          })}
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] font-black text-[#1E3A8A] px-2 py-1.5 rounded-lg bg-blue-50/60">
            <FolderOpen size={13} className="text-[#1E3A8A] flex-shrink-0" /><span className="truncate">{unitLabel}</span>
          </div>
        </div>
        {categoryGroups.map(group => {
          const pct = catPercent(group.items);
          const isActive = selectedCatCode === group.code;
          const isExpanded = expandedCats.has(group.code);
          return (
            <div key={group.code} className="px-3">
              <button onClick={() => selectCat(group.code)}
                className={clsx('w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all group mb-0.5', isActive ? 'bg-[#1E3A8A] text-white' : 'hover:bg-slate-50 text-slate-600')}>
                <span role="button" aria-label={isExpanded ? 'Tutup folder' : 'Buka folder'} className="p-1 -m-1 rounded cursor-pointer hover:bg-black/10"
                  onClick={e => { e.stopPropagation(); toggleCat(group.code); }}>
                  {isExpanded ? <ChevronDown size={11} className={clsx('flex-shrink-0', isActive ? 'text-white/70' : 'text-slate-400')} />
                              : <ChevronRight size={11} className={clsx('flex-shrink-0', isActive ? 'text-white/70' : 'text-slate-400')} />}
                </span>
                <FolderOpen size={12} className={clsx('flex-shrink-0', isActive ? 'text-white/80' : 'text-amber-400')} />
                <span className="text-[10px] font-black truncate leading-tight flex-1">{group.code} {group.name}</span>
                <span className={clsx('text-[9px] font-black flex-shrink-0', isActive ? 'text-white/70' : catStatusColor(pct))}>{pct}%</span>
              </button>
              {isExpanded && (
                <div className="ml-5 mb-1 space-y-0.5">
                  {group.items.map(item => (
                    <button key={item.id} onClick={() => openItemView(item)}
                      className={clsx('w-full text-left px-2 py-1.5 rounded-lg text-[9px] font-bold truncate transition-all flex items-center gap-1.5',
                        viewItemId === item.id ? 'bg-blue-100 text-[#1E3A8A]' : 'text-slate-500 hover:bg-slate-50')}>
                      {item.item_code}
                      {/* ✅ Badge deadline di sidebar */}
                      {item.deadline && (() => {
                        const diff = Math.ceil((new Date(item.deadline!).getTime() - Date.now()) / 86400000);
                        return diff <= 7 ? <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0 ml-auto', diff <= 3 ? 'bg-red-400' : 'bg-amber-400')} /> : null;
                      })()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full animate-fade-in relative">

      {/* Toast */}
      {showNotification && (
        <div className="fixed top-6 right-4 left-4 sm:left-auto sm:w-auto bg-[#1E3A8A] text-white px-4 py-3 rounded-xl shadow-2xl z-[200] flex items-center gap-3">
          <Info size={15} /><span className="text-xs font-black uppercase tracking-widest">{showNotification}</span>
        </div>
      )}

      {/* Modal Edit */}
      {editItem && (
        <Modal onClose={() => setEditItem(null)} locked={isSavingEdit} maxWidth="max-w-md"
          title="Edit Item Eviden" subtitle={editItem.item_code}>
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Nama Dokumen</label>
              <input autoFocus type="text" value={editNama} onChange={e => setEditNama(e.target.value)}
                className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Format File</label>
              <div className="grid grid-cols-4 gap-2">
                {['PDF', 'JPEG', 'MP4', 'MPEG'].map(fmt => (
                  <button key={fmt} type="button" onClick={() => setEditFormat(fmt)}
                    className={clsx('py-2.5 rounded-xl text-[10px] font-black border transition-all', editFormat === fmt ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]' : 'bg-white text-slate-400 border-[#E9ECEF] hover:bg-slate-50')}>{fmt}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditItem(null)} className="flex-1 py-3 rounded-xl border border-[#E9ECEF] text-xs font-black text-slate-400 hover:bg-slate-50">Batal</button>
              <button onClick={handleSaveEdit} disabled={isSavingEdit || !editNama.trim()}
                className="flex-1 py-3 rounded-xl bg-[#1E3A8A] text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50">
                {isSavingEdit ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Konfirmasi Hapus Item */}
      {deleteItem && (
        <ConfirmDialog danger title="Hapus item?" confirmLabel="Hapus" cancelLabel="Batal"
          message={<><span className="font-black text-slate-600">{deleteItem.nama_eviden}</span> akan dihapus permanen.</>}
          onConfirm={() => handleDelete(deleteItem)} onCancel={() => setDeleteItem(null)} />
      )}

      {/* Konfirmasi Hapus File */}
      {confirmDeleteFile && (
        <ConfirmDialog danger title="Hapus file terupload?" confirmLabel="Hapus File" loading={isDeletingFile}
          message={<>Semua file pada <span className="font-black text-slate-600">{confirmDeleteFile.nama_eviden}</span> akan dihapus dan status item kembali ke Kosong.</>}
          onConfirm={async () => { await handleDeleteFile(confirmDeleteFile); setConfirmDeleteFile(null); }}
          onCancel={() => setConfirmDeleteFile(null)} />
      )}

      {/* Konfirmasi Hapus Satu File */}
      {confirmDelOne && (
        <ConfirmDialog danger title="Hapus file ini?" confirmLabel="Hapus" loading={isDeletingOne}
          message={<><span className="font-black text-slate-600">{fileNameOf(confirmDelOne.url)}</span> akan dihapus permanen dari {confirmDelOne.item.item_code}.</>}
          onConfirm={() => handleDeleteOneFile(confirmDelOne.item, confirmDelOne.url)}
          onCancel={() => setConfirmDelOne(null)} />
      )}

      {/* Pratinjau File */}
      {previewUrl && (
        <Modal onClose={() => setPreviewUrl(null)} maxWidth="max-w-4xl" title="Pratinjau File" subtitle={fileNameOf(previewUrl)}>
          {fileKind(previewUrl) === 'image' ? (
            <img src={previewUrl} alt={fileNameOf(previewUrl)} className="max-h-[70vh] w-auto mx-auto rounded-lg" />
          ) : fileKind(previewUrl) === 'pdf' ? (
            <iframe src={previewUrl} title="Pratinjau PDF" className="w-full h-[70vh] rounded-lg border border-[#E9ECEF]" />
          ) : fileKind(previewUrl) === 'video' ? (
            <video src={previewUrl} controls className="max-h-[70vh] w-full rounded-lg bg-black" />
          ) : (
            <div className="text-center py-10">
              <p className="text-xs font-bold text-slate-500 mb-4">Jenis file ini tidak bisa dipratinjau di sini.</p>
              <a href={downloadUrl(previewUrl)} download className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E3A8A] text-white text-xs font-black"><Download size={14} /> Unduh File</a>
            </div>
          )}
        </Modal>
      )}

      {/* Modal Upload */}
      {uploadItem && (() => {
        const live = items.find(i => i.id === uploadItem.id) ?? uploadItem;
        return (
          <Modal onClose={() => setUploadItem(null)} locked={uploadBusy}
            title="Upload File Eviden" subtitle={`${live.item_code} · ${live.format_req}`}>
            <FileUpload documentId={live.id} itemName={live.nama_eviden} requiredFormat={live.format_req}
              kebutuhan_file={live.kebutuhan_file} uploaded_count={(live as any).uploaded_count ?? 0} file_urls={(live as any).file_urls ?? []}
              status={live.status} onBusyChange={setUploadBusy}
              onDone={() => setUploadItem(null)}
              onComplete={(a) => { fetchData(); notify(a === 'delete' ? 'File berhasil dihapus' : 'File berhasil diunggah'); }} />
          </Modal>
        );
      })()}

      {/* Modal File Viewer */}
      {fileViewItem && (
        <Modal onClose={() => { setFileViewItem(null); setShowReplaceUpload(false); }} locked={isDeletingFile}
          title="File Eviden" subtitle={`${fileViewItem.item_code} · ${fileViewItem.format_req}`}>
            <div className="space-y-4">
              <div className="bg-[#F8F9FB] rounded-xl p-4 border border-[#E9ECEF]">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nama Dokumen</p>
                <p className="text-sm font-black text-[#1A1C1E]">{fileViewItem.nama_eviden}</p>
                {fileViewItem.tahun && <p className="text-[10px] text-slate-400 mt-1">Tahun: {fileViewItem.tahun}</p>}
              </div>
              {fileViewItem.is_uploaded && fileViewItem.file_url ? (
                <>
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0"><CheckCircle2 size={20} className="text-emerald-600" /></div>
                    <div className="flex-1 min-w-0"><p className="text-[11px] font-black text-emerald-800">File Tersedia</p><p className="text-[9px] text-emerald-600 truncate mt-0.5">{fileViewItem.file_url.split('/').pop()}</p></div>
                  </div>
                  {!showReplaceUpload ? (
                    <div className="grid grid-cols-3 gap-3">
                      <a href={fileViewItem.file_url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 p-3.5 rounded-xl border border-[#E9ECEF] hover:bg-blue-50 hover:border-blue-200 transition-all group">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 group-hover:bg-blue-100 border border-blue-100 flex items-center justify-center"><ExternalLink size={16} className="text-[#1E3A8A]" /></div>
                        <p className="text-[10px] font-black text-slate-600 group-hover:text-[#1E3A8A]">Buka File</p>
                      </a>
                      <a href={downloadUrl(fileViewItem.file_url)} download className="flex flex-col items-center gap-2 p-3.5 rounded-xl border border-[#E9ECEF] hover:bg-emerald-50 hover:border-emerald-200 transition-all group">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 group-hover:bg-emerald-100 border border-emerald-100 flex items-center justify-center"><Download size={16} className="text-emerald-600" /></div>
                        <p className="text-[10px] font-black text-slate-600 group-hover:text-emerald-700">Unduh File</p>
                      </a>
                      <button onClick={() => setShowReplaceUpload(true)} className="flex flex-col items-center gap-2 p-3.5 rounded-xl border border-[#E9ECEF] hover:bg-amber-50 hover:border-amber-200 transition-all group">
                        <div className="w-9 h-9 rounded-lg bg-amber-50 group-hover:bg-amber-100 border border-amber-100 flex items-center justify-center"><RefreshCw size={16} className="text-amber-600" /></div>
                        <p className="text-[10px] font-black text-slate-600 group-hover:text-amber-700">Ganti File</p>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Upload File Pengganti</p>
                        <button onClick={() => setShowReplaceUpload(false)} className="text-[10px] font-black text-slate-400">Batal</button>
                      </div>
                      <FileUpload documentId={fileViewItem.id} itemName={fileViewItem.nama_eviden} requiredFormat={fileViewItem.format_req}
                        kebutuhan_file={fileViewItem.kebutuhan_file} uploaded_count={(fileViewItem as any).uploaded_count ?? 0} file_urls={(fileViewItem as any).file_urls ?? []}
                        status={fileViewItem.status} onComplete={(a) => { fetchData(); setFileViewItem(null); setShowReplaceUpload(false); notify(a === 'delete' ? 'File berhasil dihapus' : 'File berhasil diganti'); }} />
                    </div>
                  )}
                  {!showReplaceUpload && (
                    <div className="border-t border-[#F1F3F5] pt-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Zona Berbahaya</p>
                      <button onClick={() => setConfirmDeleteFile(fileViewItem)} disabled={isDeletingFile}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-[10px] font-black text-red-500 hover:bg-red-50 transition-all disabled:opacity-50">
                        {isDeletingFile ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Hapus File Terupload
                      </button>
                      <p className="text-[9px] text-slate-400 text-center mt-1.5">Status item akan kembali ke <span className="font-black text-red-400">Kosong</span></p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
                    <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center flex-shrink-0"><AlertTriangle size={20} className="text-red-500" /></div>
                    <div><p className="text-[11px] font-black text-red-700">Belum Ada File</p><p className="text-[9px] text-red-500 mt-0.5">Upload file untuk melengkapi item ini</p></div>
                  </div>
                  <FileUpload documentId={fileViewItem.id} itemName={fileViewItem.nama_eviden} requiredFormat={fileViewItem.format_req}
                    kebutuhan_file={fileViewItem.kebutuhan_file} uploaded_count={(fileViewItem as any).uploaded_count ?? 0} file_urls={(fileViewItem as any).file_urls ?? []}
                    status={fileViewItem.status} onComplete={(a) => { fetchData(); setFileViewItem(null); notify(a === 'delete' ? 'File berhasil dihapus' : 'File berhasil diunggah'); }} />
                </div>
              )}
            </div>
        </Modal>
      )}

      {/* Modal Buat Folder */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} locked={isSavingAdd} maxWidth="max-w-md"
          title="Buat Folder Baru" subtitle={`${selectedCatCode} ${currentGroup?.name ?? ''} · ${unitId === 'UP' ? 'Unit Pengolah' : 'Unit Kearsipan'}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nama Dokumen Eviden</label>
              <input autoFocus type="text" value={addNama} onChange={e => setAddNama(e.target.value)} placeholder="Contoh: Berita Acara Rapat..."
                className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Format File</label>
              <div className="grid grid-cols-4 gap-2">
                {['PDF', 'JPEG', 'MP4', 'MPEG'].map(fmt => (
                  <button key={fmt} type="button" onClick={() => setAddFormat(fmt)}
                    className={clsx('py-2 rounded-xl text-[10px] font-black border transition-all', addFormat === fmt ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]' : 'bg-white text-slate-400 border-[#E9ECEF] hover:bg-slate-50')}>{fmt}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Jumlah File</label>
                <input type="number" min={1} value={addJumlah} onChange={e => setAddJumlah(Number(e.target.value))}
                  className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tahun</label>
                <input type="text" value={addTahun} onChange={e => setAddTahun(e.target.value)} placeholder="2025 / 2024-2025"
                  className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 rounded-xl border border-[#E9ECEF] text-xs font-black text-slate-400 hover:bg-slate-50">Batal</button>
              <button onClick={handleAddFolder} disabled={isSavingAdd || !addNama.trim()}
                className="flex-1 py-3 rounded-xl bg-[#1E3A8A] text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50">
                {isSavingAdd ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />} Buat Folder
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Mobile Sidebar */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileSidebar(false)} />
          <div className="absolute left-0 inset-y-0 w-64 bg-white shadow-2xl flex flex-col"><SidebarContent /></div>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
          <LayoutGrid size={12} /><span>Explorer</span><ChevronRight size={11} /><span className="text-[#1E3A8A]">{unitLabel}</span>
        </div>
        <div className="flex justify-between items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#1E3A8A] tracking-tight">Explorer</h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5 hidden sm:block">Kelola dan lengkapi dokumen eviden pada setiap item.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMobileSidebar(true)} className="lg:hidden flex items-center gap-2 bg-white border border-[#E9ECEF] text-slate-500 px-3 py-2 rounded-xl text-xs font-bold shadow-sm">
              <Menu size={14} /> Direktori
            </button>
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white border border-[#E9ECEF] px-3 py-2 rounded-xl">
              <span className="text-emerald-600">{unitStats.done}</span><span>/</span><span>{unitStats.total}</span><span className="ml-1 text-[#1E3A8A]">{unitStats.percent}%</span>
            </div>
            <button onClick={fetchData} className="flex items-center gap-1.5 bg-white border border-[#E9ECEF] text-slate-500 px-3 py-2 rounded-xl font-bold text-xs shadow-sm hover:bg-slate-50">
              <RefreshCcw size={13} /><span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pencarian & Filter (di bawah header, mencakup seluruh unit) */}
      <div className="bg-white rounded-2xl border border-[#E9ECEF] shadow-sm px-4 py-3 mb-4 flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[16rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
          <input type="text" placeholder="Cari nama atau kode item eviden di seluruh unit..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl py-2.5 pl-9 pr-9 text-xs font-bold focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} aria-label="Hapus pencarian"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={14} /></button>
          )}
        </div>
        <div className="relative flex-shrink-0 xl:w-44">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Filter status"
            className={clsx('w-full appearance-none bg-[#F8F9FB] border rounded-xl py-2.5 pl-3.5 pr-9 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-[#1E3A8A]/10',
              statusFilter !== 'all' ? 'border-[#1E3A8A]/40 text-[#1E3A8A]' : 'border-[#E9ECEF] text-slate-500')}>
            <option value="all">Semua Status</option>
            <option value="missing">Kosong</option>
            <option value="partial">Belum Lengkap</option>
            <option value="done">Lengkap</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative flex-shrink-0 xl:w-40">
          <select value={formatFilter} onChange={e => setFormatFilter(e.target.value as typeof formatFilter)} aria-label="Filter format"
            className={clsx('w-full appearance-none bg-[#F8F9FB] border rounded-xl py-2.5 pl-3.5 pr-9 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-[#1E3A8A]/10',
              formatFilter !== 'all' ? 'border-[#1E3A8A]/40 text-[#1E3A8A]' : 'border-[#E9ECEF] text-slate-500')}>
            <option value="all">Semua Format</option>
            <option value="PDF">PDF</option>
            <option value="JPEG">JPEG</option>
            <option value="Excel">Excel</option>
            <option value="Video">Video</option>
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {isFiltering && (
          <button onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black text-rose-500 border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-all flex-shrink-0">
            <X size={12} /> Reset
          </button>
        )}
      </div>

      {/* 3-column layout */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Sidebar */}
        <div className={clsx('hidden lg:flex flex-shrink-0 bg-white rounded-2xl border border-[#E9ECEF] shadow-sm overflow-hidden flex-col transition-all duration-300',
          treeCollapsed ? 'w-14' : 'w-52 2xl:w-56')}>
          <SidebarContent compact={treeCollapsed} />
        </div>

        {/* Main table */}
        <div className={clsx('flex-1 min-w-0 flex flex-col gap-3', mobileView === 'detail' ? 'hidden lg:flex' : 'flex')}>
          {viewItem ? (
            <ItemDetailView
              item={viewItem}
              categoryLabel={`${viewItem.category_code} ${CATEGORIES.find(c => c.code === viewItem.category_code)?.label ?? ''}`}
              unitLabel={unitLabel}
              position={viewSiblings.findIndex(i => i.id === viewItem.id) + 1}
              total={viewSiblings.length}
              onPrev={() => { const i = viewSiblings.findIndex(x => x.id === viewItem.id); if (i > 0) openItemView(viewSiblings[i - 1]); }}
              onNext={() => { const i = viewSiblings.findIndex(x => x.id === viewItem.id); if (i < viewSiblings.length - 1) openItemView(viewSiblings[i + 1]); }}
              onBack={() => setViewItemId(null)}
              onUpload={() => openUpload(viewItem)}
              onEdit={() => { setEditItem(viewItem); setEditNama(viewItem.nama_eviden); setEditFormat(viewItem.format_req.split(' ')[0]); }}
              onDeleteItem={() => setDeleteItem(viewItem)}
              onDeleteAllFiles={() => setConfirmDeleteFile(viewItem)}
              onDeleteFile={url => setConfirmDelOne({ item: viewItem, url })}
              onPreview={setPreviewUrl}
              downloadUrl={downloadUrl}
            />
          ) : (<>
          {currentGroup && !isFiltering && (
            <div className="bg-white rounded-2xl border border-[#E9ECEF] shadow-sm px-5 py-4">
              <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-3 2xl:gap-4 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center flex-shrink-0"><FolderOpen size={18} className="text-amber-500" /></div>
                  <div>
                    <h2 className="text-sm font-black text-[#1A1C1E] uppercase tracking-wide">{currentGroup.code} {currentGroup.name}</h2>
                    <p className="text-[10px] text-slate-400 font-medium">Dokumen yang berkaitan dengan {currentGroup.name.toLowerCase()}.</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 2xl:flex 2xl:flex-shrink-0 2xl:items-center">
                  <StatPill label="Total" value={catStats.total} color="slate" />
                  <StatPill label="Selesai" value={catStats.done} color="green" />
                  <StatPill label="Belum" value={catStats.partial} color="amber" />
                  <StatPill label="Kosong" value={catStats.missing} color="red" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-[#E9ECEF]">
                    <div className={clsx('h-full rounded-full transition-all duration-700',
                      catStats.total > 0 && Math.round((catStats.done/catStats.total)*100) === 100 ? 'bg-emerald-500' : catStats.done > 0 ? 'bg-amber-400' : 'bg-slate-200'
                    )} style={{ width: `${catStats.total > 0 ? Math.round((catStats.done/catStats.total)*100) : 0}%` }} />
                  </div>
                  <span className="text-sm font-black text-[#1E3A8A] flex-shrink-0">{catStats.total > 0 ? Math.round((catStats.done/catStats.total)*100) : 0}%</span>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex-shrink-0">{currentGroup.items.length} item</span>
              </div>
            </div>
          )}

          <div className="flex-1 bg-white rounded-2xl border border-[#E9ECEF] shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-[#E9ECEF] flex flex-wrap items-center justify-between gap-2 bg-white">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filteredItems.length} item · {isFiltering ? `Hasil pencarian — seluruh ${unitLabel}` : `${selectedCatCode} ${currentGroup?.name ?? ''}`}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setInlineEditId(inlineEditId !== null ? null : -1)}
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all whitespace-nowrap',
                    inlineEditId !== null ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-[#E9ECEF] text-slate-500 hover:bg-slate-50')}>
                  <Pencil size={12} />{inlineEditId !== null ? 'Selesai Edit' : 'Edit Format'}
                </button>
                <button onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black bg-[#1E3A8A] text-white border border-[#1E3A8A] hover:bg-[#1E3A8A]/90 transition-all whitespace-nowrap">
                  <Plus size={12} /> Buat Folder
                </button>
              </div>
            </div>
            <div className="overflow-x-auto flex-1 flex flex-col">
              <table className={clsx('w-full text-left table-fixed', inlineEditId !== null ? 'min-w-[640px]' : 'min-w-[400px] 2xl:min-w-[640px]')}>
                <colgroup>
                  <col className={inlineEditId !== null ? 'w-[30%]' : 'w-[48%] 2xl:w-[38%]'} />
                  <col className={inlineEditId !== null ? 'w-[18%]' : 'hidden 2xl:table-column w-[12%]'} />
                  <col className={inlineEditId !== null ? 'w-[17%]' : 'hidden 2xl:table-column w-[13%]'} />
                  <col className={inlineEditId !== null ? 'w-[16%]' : 'w-[22%] 2xl:w-[17%]'} />
                  <col className={inlineEditId !== null ? 'w-[19%]' : 'w-[30%] 2xl:w-[20%]'} />
                </colgroup>
                <thead className="border-b border-[#E9ECEF] bg-slate-50/60">
                  <tr>{['Nama Item Eviden','Format','Kebutuhan','Status','Aksi'].map((h,i) => (
                    <th key={i} className={clsx('px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest first:pl-5', (i === 1 || i === 2) && inlineEditId === null && 'hidden 2xl:table-cell')}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-[#F1F3F5]">
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={5}><div className="flex flex-col items-center justify-center py-16 gap-3 opacity-30">
                      <FolderOpen size={36} strokeWidth={1} className="text-slate-300" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tidak ada item</p>
                    </div></td></tr>
                  ) : filteredItems.map((item, idx) => {
                    const st = getStatusInfo(item.status);
                    const dl = item.deadline ? (() => {
                      const diff = Math.ceil((new Date(item.deadline!).getTime() - Date.now()) / 86400000);
                      return { diff, isPast: diff < 0, isUrgent: diff <= 3 };
                    })() : null;
                    return (
                      <tr key={item.id} onClick={() => openDetail(item)} onDoubleClick={() => openItemView(item)}
                        className={clsx('hover:bg-[#F8F9FB] transition-colors cursor-pointer group', detailItem?.id === item.id && 'bg-blue-50/60')}>
                        <td className="px-4 py-3 pl-5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-[10px] font-black text-slate-300 w-6 flex-shrink-0 text-right">{item.item_code?.split('-').pop() ?? idx+1}</span>
                            <div className="w-7 h-7 rounded-lg border border-[#E9ECEF] bg-white flex items-center justify-center flex-shrink-0"><FormatIcon fmt={item.format_req} /></div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-black text-[#1A1C1E] truncate">{item.nama_eviden}</p>
                              <p className="text-[9px] text-slate-400 font-medium truncate">{isFiltering ? `${item.category_code} ${CATEGORIES.find(c => c.code === item.category_code)?.label ?? ''} · ` : ''}{item.tahun ?? '-'}{inlineEditId === null && <span className="2xl:hidden"> · {item.format_req} · {item.kebutuhan_file} file</span>}</p>
                            </div>
                          </div>
                        </td>
                        <td className={clsx('px-4 py-3', inlineEditId === null && 'hidden 2xl:table-cell')} onClick={e => inlineEditId !== null && e.stopPropagation()}>
                          {inlineEditId === item.id ? (
                            <select value={inlineFormat} onChange={e => setInlineFormat(e.target.value)}
                              className="w-full bg-[#F8F9FB] border border-amber-200 rounded-lg px-2 py-1 text-[10px] font-black outline-none">
                              {['PDF','JPEG','MP4','MPEG'].map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          ) : <FormatBadge fmt={item.format_req} />}
                        </td>
                        <td className={clsx('px-4 py-3', inlineEditId === null && 'hidden 2xl:table-cell')} onClick={e => inlineEditId !== null && e.stopPropagation()}>
                          {inlineEditId === item.id ? (
                            <input type="number" min={1} value={inlineJumlah} onChange={e => setInlineJumlah(Number(e.target.value))}
                              className="w-16 bg-[#F8F9FB] border border-amber-200 rounded-lg px-2 py-1 text-[10px] font-black outline-none" />
                          ) : <span className="text-[11px] font-black text-slate-500 whitespace-nowrap">{item.kebutuhan_file} file</span>}
                        </td>
                        {/* ✅ Status + deadline badge */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={clsx('text-[9px] font-black px-2.5 py-1 rounded-lg border w-fit', st.color)}>{st.label}</span>
                            {dl && (
                              <span className={clsx('text-[8px] font-black px-1.5 py-0.5 rounded-md w-fit flex items-center gap-0.5',
                                (dl.isPast || dl.isUrgent) ? 'text-red-600 bg-red-50' : dl.diff <= 7 ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-100')}>
                                <Clock size={8} /> {dl.isPast ? `Lewat ${Math.abs(dl.diff)}h` : `${dl.diff}h lagi`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {inlineEditId === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleSaveInline(item)}
                                className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100">
                                <CheckCircle2 size={11} /> Simpan
                              </button>
                              <button onClick={() => setInlineEditId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50"><X size={13} /></button>
                            </div>
                          ) : inlineEditId !== null ? (
                            <button onClick={() => { setInlineEditId(item.id); setInlineFormat(item.format_req.split(' ')[0]); setInlineJumlah(item.kebutuhan_file); }}
                              className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1.5 rounded-lg hover:bg-amber-100">
                              <Pencil size={11} /> Edit
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={e => { e.stopPropagation(); openUpload(item); }}
                                className="flex items-center gap-1.5 text-[9px] font-black text-[#1E3A8A] bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all">
                                <Upload size={11} /> Upload
                              </button>
                              <button onClick={e => { e.stopPropagation(); setFileViewItem(item); setShowReplaceUpload(false); }}
                                title="Lihat & kelola file"
                                className={clsx('w-7 h-7 flex items-center justify-center rounded-lg border transition-all',
                                  item.is_uploaded ? 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                                   : 'text-slate-300 hover:text-[#1E3A8A] hover:bg-blue-50 border-transparent hover:border-blue-100')}>
                                <Eye size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-[#F1F3F5]">
              <p className="text-[10px] font-bold text-slate-400">Menampilkan {filteredItems.length} dari {baseItems.length} item</p>
            </div>
          </div>
          </>)}
        </div>

        {/* ── Panel Kanan ──────────────────────────────────────────────────── */}
        <div className={clsx('flex-col gap-4 lg:w-64 2xl:w-72 lg:flex-shrink-0', mobileView === 'detail' ? 'flex w-full lg:w-64 2xl:w-72' : 'hidden lg:flex')}>
          {mobileView === 'detail' && (
            <button onClick={() => { setMobileView('table'); setDetailItem(null); }}
              className="lg:hidden flex items-center gap-2 text-xs font-black text-slate-500 bg-white border border-[#E9ECEF] px-4 py-2.5 rounded-xl shadow-sm self-start">
              <ArrowLeft size={14} /> Kembali ke Daftar
            </button>
          )}

          <div className="bg-white rounded-2xl border border-[#E9ECEF] shadow-sm overflow-hidden flex-1 flex flex-col">
            {/* Header + tabs */}
            <div className="border-b border-[#E9ECEF]">
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail Folder</p>
                {detailItem && <button onClick={() => { setDetailItem(null); setMobileView('table'); }} className="text-slate-300 hover:text-slate-500"><X size={14} /></button>}
              </div>
              {/* ✅ Tabs hanya muncul jika ada item dipilih */}
              {detailItem && (
                <div className="flex border-t border-[#F1F3F5]">
                  {[
                    { key: 'info'    as const, label: 'Info' },
                    { key: 'catatan' as const, label: `Catatan${catatan.length > 0 ? ` (${catatan.length})` : ''}` },
                  ].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)}
                      className={clsx('flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors',
                        detailTab === t.key ? 'text-[#1E3A8A] border-b-2 border-[#1E3A8A] bg-blue-50/40' : 'text-slate-400 hover:text-slate-600')}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {detailItem ? (
                <>
                  {/* ── Tab Info ──────────────────────────────────────────── */}
                  {detailTab === 'info' && (
                    <div className="p-4 space-y-4">
                      <InfoRow label="Nama Folder" value={detailItem.item_code} />
                      <InfoRow label="Unit" value={detailItem.unit === 'UP' ? 'Unit Pengolah (UP)' : 'Unit Kearsipan (UK)'} />
                      {detailItem.tahun && <InfoRow label="Tahun" value={detailItem.tahun} />}

                      {/* Deskripsi editable */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Deskripsi</p>
                          {!editingDesc && <button onClick={() => setEditingDesc(true)} className="text-[9px] font-black text-[#1E3A8A] flex items-center gap-1"><Pencil size={10} /> Edit</button>}
                        </div>
                        {editingDesc ? (
                          <div className="space-y-2">
                            <textarea autoFocus value={descValue} onChange={e => setDescValue(e.target.value)} rows={3}
                              className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl px-3 py-2 text-[11px] font-medium focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => setEditingDesc(false)} className="flex-1 py-1.5 rounded-lg border border-[#E9ECEF] text-[10px] font-black text-slate-400 hover:bg-slate-50">Batal</button>
                              <button onClick={handleSaveDesc} className="flex-1 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-[10px] font-black">Simpan</button>
                            </div>
                          </div>
                        ) : <p className="text-[11px] font-medium text-slate-600 leading-relaxed">{detailItem.nama_eviden}</p>}
                      </div>

                      {/* Status */}
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</p>
                        {(() => { const st = getStatusInfo(detailItem.status); return <span className={clsx('text-[9px] font-black px-2.5 py-1 rounded-lg border', st.color)}>{st.label}</span>; })()}
                      </div>

                      {/* File progress */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">File Terupload</p>
                          <p className="text-[9px] font-black text-[#1E3A8A]">
                            {detailItem.uploaded_count ?? (detailItem.is_uploaded ? 1 : 0)}/{detailItem.kebutuhan_file} file
                          </p>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full transition-all duration-500',
                            detailItem.status === 'done' ? 'bg-emerald-500' : detailItem.status === 'partial' ? 'bg-amber-400' : 'bg-slate-200'
                          )} style={{
                            width: detailItem.kebutuhan_file > 0
                              ? `${Math.min(100, Math.round(((detailItem.uploaded_count ?? (detailItem.is_uploaded ? 1 : 0)) / detailItem.kebutuhan_file) * 100))}%`
                              : '0%'
                          }} />
                        </div>
                      </div>

                      {/* ✅ Deadline ──────────────────────────────────────── */}
                      <div className="border-t border-[#F1F3F5] pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><CalendarDays size={11} /> Deadline</p>
                          <button onClick={() => setEditDeadline(v => !v)} className="text-[9px] font-black text-[#1E3A8A] flex items-center gap-1">
                            <Pencil size={10} />{detailItem.deadline ? 'Ubah' : 'Set Deadline'}
                          </button>
                        </div>
                        {detailItem.deadline && !editDeadline && (() => {
                          const dl = getDeadlineInfo(detailItem.deadline);
                          if (!dl) return null;
                          return (
                            <div className={clsx('flex items-center gap-2.5 px-3 py-2.5 rounded-xl border', dl.color)}>
                              {dl.urgent ? <AlertTriangle size={14} /> : <Clock size={14} />}
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black">{new Date(detailItem.deadline!).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
                                <p className="text-[9px] font-bold opacity-80">{dl.label} · {detailItem.deadline_label}</p>
                              </div>
                              <button onClick={handleRemoveDeadline} className="opacity-60 hover:opacity-100"><X size={12} /></button>
                            </div>
                          );
                        })()}
                        {!detailItem.deadline && !editDeadline && (
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-300">
                            <Calendar size={13} /><p className="text-[10px] font-bold">Belum ada deadline</p>
                          </div>
                        )}
                        {editDeadline && (
                          <div className="space-y-2.5 mt-1">
                            <div>
                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tanggal Deadline</label>
                              <input type="date" value={deadlineVal} onChange={e => setDeadlineVal(e.target.value)}
                                className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none" />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Prioritas</label>
                              <div className="grid grid-cols-3 gap-1.5">
                                {['Opsional','Normal','Mendesak'].map(lbl => (
                                  <button key={lbl} onClick={() => setDeadlineLabelVal(lbl)}
                                    className={clsx('py-1.5 rounded-lg text-[9px] font-black border transition-all',
                                      deadlineLabelVal === lbl
                                        ? lbl === 'Mendesak' ? 'bg-red-500 text-white border-red-500'
                                          : lbl === 'Normal' ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                                          : 'bg-slate-500 text-white border-slate-500'
                                        : 'bg-white text-slate-400 border-[#E9ECEF] hover:bg-slate-50'
                                    )}>{lbl}</button>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditDeadline(false)} className="flex-1 py-1.5 rounded-lg border border-[#E9ECEF] text-[10px] font-black text-slate-400 hover:bg-slate-50">Batal</button>
                              <button onClick={handleSaveDeadline} disabled={savingDeadline || !deadlineVal}
                                className="flex-1 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-[10px] font-black flex items-center justify-center gap-1 disabled:opacity-50">
                                {savingDeadline ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Simpan
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Hapus item */}
                      <div className="pt-1">
                        <button onClick={() => setDeleteItem(detailItem)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#E9ECEF] text-[10px] font-black text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all">
                          <Trash2 size={13} /> Hapus Item dari Daftar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ✅ Tab Catatan ───────────────────────────────────────── */}
                  {detailTab === 'catatan' && (
                    <div className="flex flex-col h-full">
                      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '300px' }}>
                        {loadingCat ? (
                          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                        ) : catatan.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-30">
                            <MessageSquare size={28} strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-widest">Belum ada catatan</p>
                          </div>
                        ) : catatan.map(c => (
                          <div key={c.id} className="group">
                            <div className="bg-[#F8F9FB] rounded-xl border border-[#E9ECEF] p-3">
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-[#1E3A8A] flex items-center justify-center flex-shrink-0">
                                    <span className="text-[8px] font-black text-white">{c.penulis.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <p className="text-[10px] font-black text-[#1A1C1E]">{c.penulis}</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[9px] text-slate-400">{new Date(c.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                                  <button onClick={() => handleDeleteCatatan(c.id)} disabled={deletingCatId === c.id}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all">
                                    {deletingCatId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                  </button>
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">{c.isi}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-[#F1F3F5] p-3 space-y-2">
                        <input type="text" value={penulisCat} onChange={e => setPenulisCat(e.target.value)} placeholder="Nama penulis"
                          className="w-full bg-[#F8F9FB] border border-[#E9ECEF] rounded-lg px-3 py-1.5 text-[10px] font-bold focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none" />
                        <div className="flex gap-2">
                          <textarea value={newCatatan} onChange={e => setNewCatatan(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendCatatan(); } }}
                            placeholder="Tulis catatan... (Enter kirim)" rows={2}
                            className="flex-1 bg-[#F8F9FB] border border-[#E9ECEF] rounded-xl px-3 py-2 text-[11px] font-medium focus:ring-2 focus:ring-[#1E3A8A]/10 outline-none resize-none" />
                          <button onClick={handleSendCatatan} disabled={sendingCat || !newCatatan.trim()}
                            className="w-9 flex items-center justify-center rounded-xl bg-[#1E3A8A] text-white hover:bg-[#1E3A8A]/90 transition-all disabled:opacity-40 flex-shrink-0">
                            {sendingCat ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Default — tidak ada item dipilih */
                <div className="p-4 space-y-4">
                  <InfoRow label="Nama Folder" value={`${selectedCatCode} ${currentGroup?.name}`} />
                  <InfoRow label="Unit" value={unitLabel} />
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Deskripsi</p>
                    <p className="text-[11px] font-medium text-slate-500 leading-relaxed">Dokumen yang berkaitan dengan {currentGroup?.name?.toLowerCase()} dalam kegiatan administrasi.</p>
                  </div>
                  <div className="pt-2 border-t border-[#F1F3F5]">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Keterangan</p>
                    <div className="space-y-2">
                      {[
                        { label:'Lengkap',       desc:'100% file terpenuhi',    color:'bg-emerald-500' },
                        { label:'Belum Lengkap', desc:'1–99% file terpenuhi',   color:'bg-amber-400'   },
                        { label:'Kosong',        desc:'Belum ada file diupload', color:'bg-red-400'     },
                      ].map(s => (
                        <div key={s.label} className="flex items-center gap-2.5">
                          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', s.color)} />
                          <div><p className="text-[10px] font-black text-slate-600">{s.label}</p><p className="text-[9px] text-slate-400">{s.desc}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-50 border-slate-200',
    green: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    red:   'text-red-600 bg-red-50 border-red-200',
  };
  return (
    <div className={clsx('text-center px-2.5 py-1.5 rounded-xl border min-w-0', colors[color])}>
      <p className="text-sm font-black">{value}</p>
      <p className="text-[8px] font-black uppercase tracking-widest opacity-70">{label}</p>
    </div>
  );
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-[11px] font-bold text-[#1A1C1E] leading-relaxed">{value}</p>
    </div>
  );
}

// ── Helper file ──────────────────────────────────────────────────────────────
function fileNameOf(url: string) {
  try { return decodeURIComponent(url.split('?')[0].split('/').pop() || 'file'); } catch { return url.split('/').pop() || 'file'; }
}
function fileKind(url: string): 'image' | 'pdf' | 'video' | 'sheet' | 'other' {
  const ext = fileNameOf(url).split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'mpeg', 'mpg', 'mov', 'webm'].includes(ext)) return 'video';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet';
  return 'other';
}
function KindIcon({ url, size = 18 }: { url: string; size?: number }) {
  const k = fileKind(url);
  if (k === 'image') return <ImageIcon size={size} className="text-blue-500" />;
  if (k === 'pdf')   return <FileText size={size} className="text-red-500" />;
  if (k === 'video') return <Film size={size} className="text-purple-500" />;
  if (k === 'sheet') return <FileSpreadsheet size={size} className="text-green-600" />;
  return <FileIcon size={size} className="text-slate-400" />;
}

// ── Tampilan detail item (panel tengah) ─────────────────────────────────────
interface ItemDetailViewProps {
  item: AuditDocument;
  categoryLabel: string;
  unitLabel: string;
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  onUpload: () => void;
  onEdit: () => void;
  onDeleteItem: () => void;
  onDeleteAllFiles: () => void;
  onDeleteFile: (url: string) => void;
  onPreview: (url: string) => void;
  downloadUrl: (url: string) => string;
}

function ItemDetailView(p: ItemDetailViewProps) {
  const { item } = p;
  const urls: string[] = item.file_urls?.length ? item.file_urls : item.file_url ? [item.file_url] : [];
  const need = Math.max(item.kebutuhan_file, urls.length);
  const emptySlots = Math.max(0, item.kebutuhan_file - urls.length);
  const st = getStatusInfo(item.status);
  const dl = getDeadlineInfo(item.deadline);
  const pct = item.kebutuhan_file > 0 ? Math.min(100, Math.round((urls.length / item.kebutuhan_file) * 100)) : 0;
  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-lg border border-[#E9ECEF] text-slate-400 transition-colors';

  return (
    <div className="flex-1 bg-white rounded-2xl border border-[#E9ECEF] shadow-sm overflow-hidden flex flex-col min-h-0">
      {/* Bar atas: breadcrumb + navigasi */}
      <div className="px-5 py-3 border-b border-[#E9ECEF] flex flex-wrap items-center justify-between gap-2">
        <button onClick={p.onBack} className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-[#1E3A8A] transition-colors min-w-0">
          <ArrowLeft size={13} className="flex-shrink-0" />
          <span className="truncate">Kembali ke daftar · {p.categoryLabel}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black text-slate-400 mr-1">{p.position} / {p.total}</span>
          <button onClick={p.onPrev} disabled={p.position <= 1} aria-label="Item sebelumnya" title="Item sebelumnya"
            className={clsx(iconBtn, 'hover:text-[#1E3A8A] hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none')}><ChevronLeft size={15} /></button>
          <button onClick={p.onNext} disabled={p.position >= p.total} aria-label="Item berikutnya" title="Item berikutnya"
            className={clsx(iconBtn, 'hover:text-[#1E3A8A] hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none')}><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Judul item */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl border border-[#E9ECEF] bg-[#F8F9FB] flex items-center justify-center flex-shrink-0"><FormatIcon fmt={item.format_req} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.item_code}</p>
            <h2 className="text-base font-black text-[#1A1C1E] leading-snug mt-0.5">{item.nama_eviden}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={clsx('text-[9px] font-black px-2.5 py-1 rounded-lg border', st.color)}>{st.label}</span>
              <FormatBadge fmt={item.format_req} />
              {item.tahun && <span className="text-[9px] font-black px-2 py-0.5 rounded border border-[#E9ECEF] text-slate-500 bg-white">Tahun {item.tahun}</span>}
              {dl && <span className={clsx('text-[9px] font-black px-2 py-0.5 rounded border flex items-center gap-1', dl.color)}><Clock size={10} />{dl.label}</span>}
            </div>
          </div>
        </div>

        {/* Aksi utama */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={p.onUpload}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1E3A8A] text-white text-[11px] font-black hover:bg-[#1E3A8A]/90 transition-all">
            <Upload size={13} /> {urls.length > 0 ? 'Tambah / Ganti File' : 'Upload File'}
          </button>
          <button onClick={p.onEdit}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E9ECEF] text-[11px] font-black text-slate-500 hover:bg-slate-50 transition-all">
            <Pencil size={13} /> Edit Item
          </button>
          {urls.length > 0 && (
            <button onClick={p.onDeleteAllFiles}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 text-[11px] font-black text-red-500 hover:bg-red-50 transition-all">
              <Trash2 size={13} /> Hapus Semua File
            </button>
          )}
          <button onClick={p.onDeleteItem}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
            <Trash2 size={13} /> Hapus Item
          </button>
        </div>

        {/* Progres */}
        <div className="bg-[#F8F9FB] rounded-xl border border-[#E9ECEF] px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kelengkapan File</p>
            <p className="text-[11px] font-black text-[#1E3A8A]">{urls.length} / {item.kebutuhan_file} file · {pct}%</p>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden border border-[#E9ECEF]">
            <div className={clsx('h-full rounded-full transition-all duration-500', item.status === 'done' ? 'bg-emerald-500' : item.status === 'partial' ? 'bg-amber-400' : 'bg-slate-200')} style={{ width: `${pct}%` }} />
          </div>
          {item.updated_at && <p className="text-[9px] text-slate-400 font-medium mt-2">Terakhir diperbarui {new Date(item.updated_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
        </div>

        {/* Daftar file */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Daftar File ({urls.length})</p>
          <div className="space-y-2">
            {urls.map((url, i) => (
              <div key={url} className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-[#E9ECEF] hover:border-[#1E3A8A]/20 hover:bg-[#F8F9FB]/60 transition-all">
                <span className="text-[10px] font-black text-slate-300 w-4 text-right flex-shrink-0">{i + 1}</span>
                <div className="w-9 h-9 rounded-lg bg-white border border-[#E9ECEF] flex items-center justify-center flex-shrink-0"><KindIcon url={url} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-[#1A1C1E] truncate">{fileNameOf(url)}</p>
                  <p className="text-[9px] text-slate-400 font-medium uppercase">{fileNameOf(url).split('.').pop()}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => p.onPreview(url)} title="Pratinjau" aria-label="Pratinjau" className={clsx(iconBtn, 'hover:text-[#1E3A8A] hover:bg-blue-50 hover:border-blue-200')}><Eye size={14} /></button>
                  <a href={url} target="_blank" rel="noopener noreferrer" title="Buka di tab baru" aria-label="Buka di tab baru" className={clsx(iconBtn, 'hover:text-[#1E3A8A] hover:bg-blue-50 hover:border-blue-200')}><ExternalLink size={14} /></a>
                  <a href={p.downloadUrl(url)} download title="Unduh" aria-label="Unduh" className={clsx(iconBtn, 'hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200')}><Download size={14} /></a>
                  <button onClick={() => p.onDeleteFile(url)} title="Hapus file" aria-label="Hapus file" className={clsx(iconBtn, 'hover:text-red-500 hover:bg-red-50 hover:border-red-200')}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <button key={`slot-${i}`} onClick={p.onUpload}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-dashed border-slate-200 text-slate-400 hover:border-[#1E3A8A]/40 hover:text-[#1E3A8A] hover:bg-blue-50/40 transition-all text-left">
                <span className="text-[10px] font-black w-4 text-right flex-shrink-0">{urls.length + i + 1}</span>
                <div className="w-9 h-9 rounded-lg border border-dashed border-slate-200 flex items-center justify-center flex-shrink-0"><Plus size={15} /></div>
                <p className="text-[11px] font-bold">File belum diunggah · klik untuk upload</p>
              </button>
            ))}
            {need === 0 && <p className="text-[11px] text-slate-400 font-medium">Belum ada file.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}