'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  AlertTriangle, Bell, Calendar, CheckCircle2, Clock, Edit2, Inbox,
  Plus, RefreshCw, Save, Trash2, X,
} from 'lucide-react'
import clsx from 'clsx'

// ─── Supabase singleton ───────────────────────────────────────────────────────
const getSupabase = (() => {
  let client: ReturnType<typeof createBrowserClient> | null = null
  return () => {
    if (!client) client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    return client
  }
})()

// ─── Types ────────────────────────────────────────────────────────────────────
type Urgency = 'overdue' | 'kritis' | 'mendekat' | 'aman' | 'no_target'

type UnitDeadline = {
  unit_id: string
  unit_kode: string
  unit_nama: string
  target_date: string | null
  keterangan: string | null
  days_remaining: number | null
  urgency: Urgency
}

type EditState = { unit_id: string; target_date: string; keterangan: string } | null
type FilterTab = 'all' | 'attention' | 'mendekat' | 'aman' | 'no_target'

// ─── Urgency config ───────────────────────────────────────────────────────────
const CFG: Record<Urgency, {
  label: string
  color: string
  accent: string
  badge: string
  icon: string
  Icon: typeof AlertTriangle
}> = {
  overdue: {
    label: 'Terlambat', color: '#DC2626', accent: 'border-l-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200',
    icon: 'text-red-600', Icon: AlertTriangle,
  },
  kritis: {
    label: 'Kritis', color: '#EA580C', accent: 'border-l-orange-500',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: 'text-orange-600', Icon: AlertTriangle,
  },
  mendekat: {
    label: 'Mendekat', color: '#D97706', accent: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: 'text-amber-600', Icon: Clock,
  },
  aman: {
    label: 'Aman', color: '#16A34A', accent: 'border-l-green-500',
    badge: 'bg-green-50 text-green-700 border-green-200',
    icon: 'text-green-600', Icon: CheckCircle2,
  },
  no_target: {
    label: 'Belum diset', color: '#94A3B8', accent: 'border-l-slate-300',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: 'text-slate-400', Icon: Calendar,
  },
}

const URGENCY_ORDER: Record<Urgency, number> = {
  overdue: 0, kritis: 1, mendekat: 2, aman: 3, no_target: 4,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtShort = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
const fmtTime = (d: Date) =>
  d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

// ─── Countdown ring ───────────────────────────────────────────────────────────
// Fill merepresentasikan kedekatan ke deadline, bukan arbitrary 90 hari:
// 60+ hari → 5% (aman), 30 hari → 50%, 0 hari → 100%, overdue → 100%
function CountdownRing({
  days, urgency, size = 56,
}: { days: number | null; urgency: Urgency; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const cfg = CFG[urgency]

  let fill = 0.05
  if (urgency === 'overdue') fill = 1
  else if (days != null && days >= 0) {
    fill = Math.max(0.05, Math.min(1, 1 - Math.min(days, 60) / 60))
  }
  const offset = circ * (1 - fill)

  const dayNum =
    days == null ? '—'
    : urgency === 'overdue' ? Math.abs(days)
    : days
  const dayLabel =
    days == null ? ''
    : urgency === 'overdue' ? 'lewat'
    : days === 0 ? 'hari ini'
    : 'hari'

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        days == null ? 'Belum ada target'
        : urgency === 'overdue' ? `Terlambat ${Math.abs(days)} hari`
        : `${days} hari lagi menuju audit`
      }
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={cfg.color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={clsx('font-bold tabular-nums leading-none', cfg.icon)} style={{ fontSize: 15 }}>
          {dayNum}
        </span>
        {dayLabel && <span className="text-[9px] text-slate-400 mt-0.5">{dayLabel}</span>}
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function Stat({
  label, value, total, accent, Icon,
}: {
  label: string; value: number; total: number
  accent: 'red' | 'amber' | 'green' | 'slate'
  Icon: typeof AlertTriangle
}) {
  const map = {
    red:   { accent: 'border-l-red-500',   icon: 'text-red-600' },
    amber: { accent: 'border-l-amber-500', icon: 'text-amber-600' },
    green: { accent: 'border-l-green-500', icon: 'text-green-600' },
    slate: { accent: 'border-l-slate-300', icon: 'text-slate-400' },
  }[accent]
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className={clsx('bg-white border border-slate-200 border-l-4 rounded-lg p-4', map.accent)}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={map.icon} />
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">{value}</p>
      <p className="text-[11px] text-slate-400">{pct}% dari {total} unit</p>
    </div>
  )
}

// ─── Skeleton & Empty ─────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto animate-pulse">
      <div className="h-7 w-64 bg-slate-200 rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-lg" />)}
      </div>
      <div className="h-32 bg-slate-100 rounded-lg" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-28 bg-slate-100 rounded-lg" />)}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Inbox className="text-slate-400" size={24} />
      </div>
      <p className="text-sm font-medium text-slate-900">Belum ada unit kerja terdaftar</p>
      <p className="text-sm text-slate-500 mt-1 max-w-sm">
        Daftar unit dan target deadline akan muncul di sini setelah unit terdaftar di sistem.
      </p>
    </div>
  )
}

// ─── Timeline (staggered, limited, no collision) ──────────────────────────────
function Timeline({ rows }: { rows: UnitDeadline[] }) {
  const withDate = rows
    .filter(r => r.target_date)
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())
    .slice(0, 10)

  if (!withDate.length) return null

  const today = Date.now()
  const dates = withDate.map(r => new Date(r.target_date!).getTime())
  const minTs = Math.min(today, ...dates) - 7 * 86400000
  const maxTs = Math.max(today, ...dates) + 14 * 86400000
  const toPos = (ts: number) =>
    Math.max(0, Math.min(100, ((ts - minTs) / (maxTs - minTs)) * 100))

  // staggered levels untuk menghindari tabrakan label
  const items = withDate.map(r => ({ r, pos: toPos(new Date(r.target_date!).getTime()) }))
  items.sort((a, b) => a.pos - b.pos)
  const levels: number[] = []
  for (let i = 0; i < items.length; i++) {
    let level = 0
    while (
      level < 3 &&
      items.slice(0, i).some((p, j) => levels[j] === level && Math.abs(p.pos - items[i].pos) < 7)
    ) level++
    levels.push(level)
  }
  const maxLevel = Math.max(...levels, 0)
  const staggerPx = 20

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-5 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Timeline deadline · {withDate.length} terdekat
        </p>
        <p className="text-[11px] text-slate-400 tabular-nums">
          {fmtShort(new Date(minTs).toISOString())} — {fmtShort(new Date(maxTs).toISOString())}
        </p>
      </div>

      <div className="relative" style={{ paddingTop: 18, paddingBottom: 20 + maxLevel * staggerPx }}>
        {/* "Hari ini" label di ATAS track supaya tidak tabrakan dengan label unit */}
        <div
          className="absolute text-[10px] text-[#1E3A8A] font-semibold whitespace-nowrap"
          style={{ left: `${toPos(today)}%`, top: 0, transform: 'translateX(-50%)' }}
        >
          Hari ini
        </div>

        {/* Track */}
        <div className="relative h-2 bg-slate-200 rounded-full">
          <div
            className="absolute top-0 bottom-0 w-px bg-[#1E3A8A] z-10"
            style={{ left: `${toPos(today)}%` }}
          />
          {items.map(({ r, pos }, i) => {
            const cfg = CFG[r.urgency]
            const level = levels[i]
            return (
              <div
                key={r.unit_id}
                className="absolute"
                style={{
                  left: `${pos}%`,
                  top: `calc(50% + ${level * staggerPx}px)`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div
                  className="w-3 h-3 rounded-full border-2 border-white shadow-sm cursor-help"
                  style={{ backgroundColor: cfg.color }}
                  title={`${r.unit_nama} · ${fmtDate(r.target_date!)}`}
                />
                <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-500 mt-1.5">
                  {r.unit_kode}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function NotifikasiPage() {
  const [rows, setRows] = useState<UnitDeadline[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editState, setEditState] = useState<EditState>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const { data, error } = await getSupabase()
        .from('unit_deadline').select('*').order('unit_kode')
      if (error) throw error
      setRows((data ?? []) as UnitDeadline[])
      setLastUpdated(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data deadline')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!editState?.target_date) return
    setSaving(true); setError(null)
    const { error } = await getSupabase().from('audit_targets').upsert(
      {
        unit_id: editState.unit_id,
        target_date: editState.target_date,
        keterangan: editState.keterangan.trim() || null,
      },
      { onConflict: 'unit_id' },
    )
    if (error) setError(error.message)
    else { setEditState(null); await load(true) }
    setSaving(false)
  }

  const handleDelete = async (unit_id: string) => {
    setDeleting(true); setError(null)
    const { error } = await getSupabase().from('audit_targets').delete().eq('unit_id', unit_id)
    if (error) setError(error.message)
    else { setConfirmDel(null); await load(true) }
    setDeleting(false)
  }

  const sortedRows = useMemo(() =>
    [...rows].sort((a, b) => {
      const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
      if (u !== 0) return u
      return (a.days_remaining ?? 9999) - (b.days_remaining ?? 9999)
    }), [rows])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return sortedRows
    if (filter === 'attention')
      return sortedRows.filter(r => r.urgency === 'overdue' || r.urgency === 'kritis')
    return sortedRows.filter(r => r.urgency === filter)
  }, [sortedRows, filter])

  const counts = useMemo(() => ({
    total: rows.length,
    attention: rows.filter(r => r.urgency === 'overdue' || r.urgency === 'kritis').length,
    mendekat: rows.filter(r => r.urgency === 'mendekat').length,
    aman: rows.filter(r => r.urgency === 'aman').length,
    no_target: rows.filter(r => r.urgency === 'no_target').length,
  }), [rows])

  const alertUnits = rows.filter(r => r.urgency === 'overdue' || r.urgency === 'kritis')

  if (loading) return <Skeleton />

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Bell size={20} className="text-[#1E3A8A]" />
            Notifikasi & Deadline Audit
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pantau target tanggal audit per unit kerja
            {lastUpdated && (
              <span className="text-slate-400"> · Diperbarui {fmtTime(lastUpdated)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full hidden sm:inline-block">
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]/30"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{refreshing ? 'Memuat…' : 'Muat ulang'}</span>
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-sm text-red-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Terjadi kesalahan</p>
            <p className="text-red-700 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {rows.length === 0 ? <EmptyState /> : (
        <>
          {/* ── Stats ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Perlu tindakan" value={counts.attention} total={counts.total} accent="red" Icon={AlertTriangle} />
            <Stat label="Mendekat" value={counts.mendekat} total={counts.total} accent="amber" Icon={Clock} />
            <Stat label="Aman" value={counts.aman} total={counts.total} accent="green" Icon={CheckCircle2} />
            <Stat label="Belum diset" value={counts.no_target} total={counts.total} accent="slate" Icon={Calendar} />
          </div>

          {/* ── Alert banner ───────────────────────────────── */}
          {alertUnits.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-800">
                  {alertUnits.length} unit perlu tindakan
                </p>
                <p className="text-sm text-red-700 mt-0.5">
                  {alertUnits.slice(0, 3).map((u, i) => (
                    <span key={u.unit_id}>
                      {i > 0 && ', '}
                      <strong>{u.unit_nama}</strong>{' '}
                      {u.urgency === 'overdue'
                        ? `(terlambat ${Math.abs(u.days_remaining ?? 0)} hari)`
                        : `(${u.days_remaining} hari lagi)`}
                    </span>
                  ))}
                  {alertUnits.length > 3 && (
                    <span className="text-red-600">, +{alertUnits.length - 3} lainnya</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ── Timeline ───────────────────────────────────── */}
          <Timeline rows={rows} />

          {/* ── Filter tabs ────────────────────────────────── */}
          <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
            {([
              ['all', 'Semua', counts.total],
              ['attention', 'Perlu tindakan', counts.attention],
              ['mendekat', 'Mendekat', counts.mendekat],
              ['aman', 'Aman', counts.aman],
              ['no_target', 'Belum diset', counts.no_target],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={clsx(
                  'px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap focus-visible:outline-none',
                  filter === key
                    ? 'text-[#1E3A8A] border-[#1E3A8A]'
                    : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300',
                )}
              >
                {label}
                <span className={clsx(
                  'ml-1.5 text-[11px] tabular-nums px-1.5 py-0.5 rounded',
                  filter === key ? 'bg-blue-50 text-[#1E3A8A]' : 'bg-slate-100 text-slate-500',
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* ── Unit rows ──────────────────────────────────── */}
          {filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Tidak ada unit pada kategori ini
            </p>
          ) : (
            <div className="space-y-2">
              {filteredRows.map(unit => {
                const cfg = CFG[unit.urgency]
                const { Icon } = cfg
                const isEditing = editState?.unit_id === unit.unit_id
                const isConfirm = confirmDel === unit.unit_id
                const hasTarget = !!unit.target_date

                return (
                  <div
                    key={unit.unit_id}
                    className={clsx(
                      'bg-white border border-slate-200 border-l-4 rounded-lg overflow-hidden',
                      cfg.accent,
                    )}
                  >
                    {/* Header row */}
                    <div className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                          <Icon size={16} className={cfg.icon} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 truncate">{unit.unit_nama}</p>
                            <span className={clsx(
                              'text-[11px] px-2 py-0.5 rounded-full border font-medium',
                              cfg.badge,
                            )}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                              {unit.unit_kode}
                            </span>
                            {hasTarget && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span>Target: <span className="text-slate-700">{fmtDate(unit.target_date!)}</span></span>
                              </>
                            )}
                          </p>
                          {unit.keterangan && (
                            <p className="text-xs text-slate-400 mt-1 italic">"{unit.keterangan}"</p>
                          )}
                        </div>
                      </div>

                      {!isEditing && !isConfirm && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasTarget && (
                            <button
                              onClick={() => setConfirmDel(unit.unit_id)}
                              className="flex items-center gap-1 text-xs text-red-600 px-2 py-1.5 rounded-md border border-red-200 bg-white hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                              title="Hapus target"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => setEditState({
                              unit_id: unit.unit_id,
                              target_date: unit.target_date ?? '',
                              keterangan: unit.keterangan ?? '',
                            })}
                            className="flex items-center gap-1 text-xs text-slate-700 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]/30"
                          >
                            {hasTarget ? <><Edit2 size={13} /> Edit</> : <><Plus size={13} /> Set target</>}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Countdown — hanya kalau ada target & tidak sedang edit */}
                    {hasTarget && !isEditing && !isConfirm && (
                      <div className="px-5 pb-4 flex items-center gap-4">
                        <CountdownRing days={unit.days_remaining} urgency={unit.urgency} />
                        <p className="text-sm text-slate-600">
                          {unit.urgency === 'overdue'
                            ? <span className="text-red-700 font-medium">
                                Lewat {Math.abs(unit.days_remaining ?? 0)} hari dari target
                              </span>
                            : unit.days_remaining === 0
                              ? <span className="text-red-700 font-medium">Jatuh tempo hari ini</span>
                              : <span>
                                  <strong className="text-slate-900 tabular-nums">{unit.days_remaining}</strong>
                                  {' '}hari lagi menuju audit
                                </span>
                          }
                        </p>
                      </div>
                    )}

                    {/* Belum ada target */}
                    {!hasTarget && !isEditing && (
                      <div className="px-5 pb-4 flex items-center gap-2 text-sm text-slate-400">
                        <Calendar size={14} />
                        Belum ada target tanggal audit untuk unit ini
                      </div>
                    )}

                    {/* Edit form */}
                    {isEditing && editState && (
                      <div className="px-5 pb-4 space-y-3">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Target tanggal audit
                            </label>
                            <input
                              type="date"
                              value={editState.target_date}
                              onChange={e => setEditState(s => s ? { ...s, target_date: e.target.value } : s)}
                              className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white w-full focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              Keterangan <span className="text-slate-400 font-normal">(opsional)</span>
                            </label>
                            <input
                              type="text"
                              value={editState.keterangan}
                              onChange={e => setEditState(s => s ? { ...s, keterangan: e.target.value } : s)}
                              placeholder="Contoh: Audit eksternal semester 1"
                              className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white w-full focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSave}
                            disabled={saving || !editState.target_date}
                            className="flex items-center gap-1.5 text-sm bg-[#1E3A8A] text-white px-4 py-2 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
                          >
                            <Save size={14} />
                            {saving ? 'Menyimpan…' : 'Simpan'}
                          </button>
                          <button
                            onClick={() => setEditState(null)}
                            className="flex items-center gap-1.5 text-sm text-slate-600 px-4 py-2 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
                          >
                            <X size={14} /> Batal
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Delete confirm */}
                    {isConfirm && (
                      <div className="px-5 pb-4">
                        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-md border border-red-100">
                          <Trash2 size={16} className="text-red-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-red-800">
                              Hapus target deadline <strong>{unit.unit_nama}</strong>?
                            </p>
                            <p className="text-xs text-red-600 mt-0.5">
                              Tanggal target dan keterangan akan dihapus permanen.
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleDelete(unit.unit_id)}
                              disabled={deleting}
                              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {deleting ? 'Menghapus…' : 'Hapus'}
                            </button>
                            <button
                              onClick={() => setConfirmDel(null)}
                              className="text-xs text-slate-600 px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}