'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  AlertTriangle, CheckCircle2, XCircle, ShieldCheck,
  RefreshCw, Target, ArrowUpRight, Inbox,
} from 'lucide-react'
import clsx from 'clsx'

// ─── Supabase singleton ───────────────────────────────────────────────────────
let _sb: ReturnType<typeof createBrowserClient> | null = null
function supabase() {
  if (!_sb)
    _sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  return _sb
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Tier = 'siap' | 'perlu_perhatian' | 'tidak_siap'

type UnitReadiness = {
  unit_id: string
  unit_kode: string
  unit_nama: string
  total_aspek: number
  skor: number
  status: Tier
}

type AspekReadiness = {
  aspek_id: string
  unit_id: string
  aspek_nama: string
  aspek_kode: string
  bobot: number
  total_items: number
  completed_items: number
  compliance_pct: number
  status: Tier
}

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER = {
  siap: {
    label: 'Siap Audit', color: '#16A34A', dot: 'bg-green-500',
    bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200',
    Icon: CheckCircle2,
  },
  perlu_perhatian: {
    label: 'Perlu Perhatian', color: '#D97706', dot: 'bg-amber-500',
    bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200',
    Icon: AlertTriangle,
  },
  tidak_siap: {
    label: 'Tidak Siap', color: '#DC2626', dot: 'bg-red-500',
    bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200',
    Icon: XCircle,
  },
} as const

// ─── Gauge Chart (fixed clipping + tabular-nums) ──────────────────────────────
function GaugeChart({ skor, status }: { skor: number; status: Tier }) {
  const cx = 90, cy = 85, r = 68, sw = 11
  const color = TIER[status].color
  const angle = (Math.max(0, Math.min(100, skor)) / 100) * 180

  const pt = (a: number, radius: number) => {
    const rad = ((180 - a) * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
  }
  const arc = (from: number, to: number, radius: number) => {
    const s = pt(from, radius)
    const e = pt(to, radius)
    const large = to - from > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`
  }

  return (
    <svg
      viewBox="0 0 180 100"
      className="w-full max-w-[190px]"
      role="img"
      aria-label={`Skor ${skor} dari 100`}
    >
      <path d={arc(0, 180, r)} fill="none" stroke="#F1F5F9" strokeWidth={sw} strokeLinecap="round" />
      {skor > 0 && (
        <path d={arc(0, angle, r)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      )}
      <text
        x={cx} y={cy - 18}
        textAnchor="middle"
        fontSize="28"
        fontWeight="700"
        fill="#0F172A"
        className="tabular-nums"
      >
        {skor}
      </text>
    </svg>
  )
}

// ─── Radar Chart (highlight weakest aspek) ────────────────────────────────────
function RadarChart({ aspeks }: { aspeks: AspekReadiness[] }) {
  if (aspeks.length < 3) return null

  const cx = 110, cy = 110, r = 80
  const n = aspeks.length
  const weakestId = [...aspeks].sort((a, b) => a.compliance_pct - b.compliance_pct)[0]?.aspek_id

  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    const d = (v / 100) * r
    return { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) }
  }
  const axisEnd = (i: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  const labelPos = (i: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    const d = r + 18
    return { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) }
  }

  const points = aspeks.map((a, i) => pt(i, a.compliance_pct))
  const poly = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox="0 0 220 220" className="w-full max-w-[240px]" role="img" aria-label="Radar kelengkapan per aspek">
      {[25, 50, 75, 100].map(ring => (
        <polygon
          key={ring}
          points={aspeks.map((_, i) => { const p = pt(i, ring); return `${p.x},${p.y}` }).join(' ')}
          fill="none" stroke="#F1F5F9" strokeWidth="1"
        />
      ))}
      {aspeks.map((_, i) => {
        const e = axisEnd(i)
        return <line key={i} x1={cx} y1={cy} x2={e.x} y2={e.y} stroke="#F1F5F9" strokeWidth="1" />
      })}
      <polygon points={poly} fill="#1E3A8A" fillOpacity="0.12" stroke="#1E3A8A" strokeWidth="2" />
      {points.map((p, i) => {
        const isWeak = aspeks[i].aspek_id === weakestId
        return (
          <circle
            key={i} cx={p.x} cy={p.y}
            r={isWeak ? 4.5 : 3}
            fill={isWeak ? '#DC2626' : '#1E3A8A'}
          />
        )
      })}
      {aspeks.map((a, i) => {
        const lp = labelPos(i)
        return (
          <text
            key={i} x={lp.x} y={lp.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fill="#475569" fontWeight="600"
          >
            {a.aspek_kode}
          </text>
        )
      })}
    </svg>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────
function TierBadge({ status, size = 'sm' }: { status: Tier; size?: 'sm' | 'md' }) {
  const T = TIER[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold border shrink-0',
        size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
        T.bg, T.text, T.border,
      )}
    >
      <T.Icon size={size === 'md' ? 13 : 11} />
      {T.label}
    </span>
  )
}

function Stat({
  label, value, suffix, tone = 'neutral',
}: {
  label: string; value: string | number; suffix?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const toneClass = {
    neutral: 'text-slate-900',
    good: 'text-green-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
  }[tone]

  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
      <p className="text-[11px] text-slate-500 font-medium">{label}</p>
      <p className={clsx('text-xl font-semibold tabular-nums mt-0.5', toneClass)}>
        {value}
        {suffix && <span className="text-xs font-normal text-slate-400 ml-0.5">{suffix}</span>}
      </p>
    </div>
  )
}

// ─── Loading & Empty ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
      <div className="h-7 w-56 bg-slate-200 rounded" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-lg" />)}
      </div>
      <div className="h-10 w-full bg-slate-100 rounded-lg" />
      <div className="h-80 bg-slate-100 rounded-lg" />
      <div className="h-64 bg-slate-100 rounded-lg" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Inbox className="text-slate-400" size={24} />
      </div>
      <p className="text-sm font-medium text-slate-900">Belum ada data kesiapan audit</p>
      <p className="text-sm text-slate-500 mt-1 max-w-sm">
        Data skor kesiapan akan muncul di sini setelah unit mulai mengunggah dokumen.
      </p>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatTime(d: Date) {
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SkorPage() {
  const [units, setUnits] = useState<UnitReadiness[]>([])
  const [aspeks, setAspeks] = useState<AspekReadiness[]>([])
  const [activeUnit, setActiveUnit] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const sb = supabase()
      const [uRes, aRes] = await Promise.all([
        sb.from('unit_readiness').select('*'),
        sb.from('aspek_readiness').select('*').order('aspek_kode'),
      ])
      if (uRes.error) throw uRes.error
      if (aRes.error) throw aRes.error

      const unitList = (uRes.data ?? []) as UnitReadiness[]
      setUnits(unitList)
      setAspeks((aRes.data ?? []) as AspekReadiness[])
      setLastUpdated(new Date())

      setActiveUnit(prev => {
        if (prev && unitList.find(u => u.unit_id === prev)) return prev
        return unitList[0]?.unit_id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data kesiapan audit')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // urutkan dari skor terendah — supaya unit bermasalah langsung kelihatan
  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.skor - b.skor),
    [units],
  )

  const selectedUnit = units.find(u => u.unit_id === activeUnit)
  const selectedAspeks = useMemo(
    () => aspeks.filter(a => a.unit_id === activeUnit),
    [aspeks, activeUnit],
  )

  const totalBobot = useMemo(
    () => selectedAspeks.reduce((s, a) => s + a.bobot, 0) || 1,
    [selectedAspeks],
  )

  // Potential gain: berapa poin skor yang bisa didapat jika aspek ini dilengkapi 100%
  // gain = (100 - pct) × bobot / totalBobot
  const prioritized = useMemo(() => {
    return [...selectedAspeks]
      .map(a => ({ a, gain: ((100 - a.compliance_pct) * a.bobot) / totalBobot }))
      .filter(x => x.gain > 0.5)
      .sort((x, y) => y.gain - x.gain)
      .slice(0, 3)
  }, [selectedAspeks, totalBobot])

  const counts = useMemo(() => ({
    siap: units.filter(u => u.status === 'siap').length,
    perlu_perhatian: units.filter(u => u.status === 'perlu_perhatian').length,
    tidak_siap: units.filter(u => u.status === 'tidak_siap').length,
  }), [units])

  if (loading) return <Skeleton />

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="text-[#1E3A8A]" size={22} />
            Skor Kesiapan Audit
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kesiapan arsip per unit terhadap aspek penilaian audit
            {lastUpdated && (
              <span className="text-slate-400"> · Diperbarui {formatTime(lastUpdated)}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]/30"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-sm text-red-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Gagal memuat data</p>
            <p className="text-red-700 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {units.length === 0 ? <EmptyState /> : (
        <>
          {/* ── Summary ────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            {(['siap', 'perlu_perhatian', 'tidak_siap'] as const).map(tier => {
              const T = TIER[tier]
              const count = counts[tier]
              const pct = units.length ? Math.round((count / units.length) * 100) : 0
              return (
                <div
                  key={tier}
                  className="bg-white border border-slate-200 border-l-4 rounded-lg p-4"
                  style={{ borderLeftColor: T.color }}
                >
                  <div className="flex items-center gap-2">
                    <T.Icon size={14} className={T.text} />
                    <p className="text-xs font-medium text-slate-500">{T.label}</p>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">{count}</p>
                  <p className="text-[11px] text-slate-400">{pct}% dari total unit</p>
                </div>
              )
            })}
          </div>

          {/* ── Unit tab selector ──────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Pilih unit · diurutkan dari skor terendah
            </p>
            <div className="flex flex-wrap gap-2">
              {sortedUnits.map(u => {
                const T = TIER[u.status]
                const isActive = activeUnit === u.unit_id
                return (
                  <button
                    key={u.unit_id}
                    onClick={() => setActiveUnit(u.unit_id)}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]/30',
                      isActive
                        ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className={clsx('w-1.5 h-1.5 rounded-full', T.dot)} />
                    <span className="font-medium">{u.unit_kode}</span>
                    <span className={clsx('text-xs tabular-nums', isActive ? 'text-slate-300' : 'text-slate-400')}>
                      {u.skor}%
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedUnit && (
            <>
              {/* ── Detail card ──────────────────────────────────── */}
              <div className="bg-white border border-slate-200 rounded-lg">
                <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900 truncate">
                      {selectedUnit.unit_nama}
                    </h2>
                    <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {selectedUnit.unit_kode}
                      </span>
                      <span className="text-slate-300">·</span>
                      {selectedUnit.total_aspek} aspek penilaian
                    </p>
                  </div>
                  <TierBadge status={selectedUnit.status} size="md" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_240px] gap-6 p-6 items-center">
                  <div className="flex flex-col items-center">
                    <GaugeChart skor={selectedUnit.skor} status={selectedUnit.status} />
                    <p className="text-[11px] text-slate-400 -mt-1">skor dari 100</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Stat
                      label="Aspek siap"
                      value={selectedAspeks.filter(a => a.status === 'siap').length}
                      suffix={`/ ${selectedUnit.total_aspek}`}
                      tone="good"
                    />
                    <Stat
                      label="Perlu perhatian"
                      value={selectedAspeks.filter(a => a.status === 'perlu_perhatian').length}
                      tone="warn"
                    />
                    <Stat
                      label="Tidak siap"
                      value={selectedAspeks.filter(a => a.status === 'tidak_siap').length}
                      tone="bad"
                    />
                    <Stat
                      label="Total item"
                      value={selectedAspeks.reduce((s, a) => s + a.total_items, 0)}
                    />
                  </div>

                  <div className="flex flex-col items-center">
                    {selectedAspeks.length >= 3 ? (
                      <>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                          Radar aspek
                        </p>
                        <RadarChart aspeks={selectedAspeks} />
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 text-center">
                        Butuh minimal 3 aspek untuk radar chart
                      </p>
                    )}
                  </div>
                </div>

                {/* Prioritas perbaikan — insight, bukan display */}
                {prioritized.length > 0 && (
                  <div className="mx-6 mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-start gap-3">
                      <Target size={18} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-amber-900">Prioritas perbaikan</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Aspek berikut memberi dampak terbesar jika dilengkapi:
                        </p>
                        <ul className="mt-2 space-y-1">
                          {prioritized.map(({ a, gain }) => (
                            <li key={a.aspek_id} className="flex items-center gap-2 text-sm">
                              <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                              <span className="font-medium text-amber-900 truncate">{a.aspek_nama}</span>
                              <span className="text-xs text-amber-600 shrink-0 ml-auto tabular-nums flex items-center gap-0.5">
                                <ArrowUpRight size={11} />
                                +{gain.toFixed(1)} poin
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Aspek breakdown ──────────────────────────────── */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Detail per aspek</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Kelengkapan dokumen tiap aspek penilaian</p>
                  </div>
                  <span className="text-xs text-slate-400 tabular-nums">{selectedAspeks.length} aspek</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {selectedAspeks.length === 0 ? (
                    <p className="px-6 py-10 text-center text-sm text-slate-400">
                      Belum ada data aspek untuk unit ini
                    </p>
                  ) : (
                    selectedAspeks.map(a => {
                      const T = TIER[a.status]
                      return (
                        <div key={a.aspek_id} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                              {a.aspek_kode}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-slate-900 truncate">{a.aspek_nama}</p>
                                <TierBadge status={a.status} />
                                {a.bobot !== 1 && (
                                  <span className="text-[11px] text-[#1E3A8A] font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                    bobot ×{a.bobot}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                                {a.completed_items} dari {a.total_items} item terpenuhi
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-semibold text-slate-900 tabular-nums">
                                {a.compliance_pct}%
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${a.compliance_pct}%`, backgroundColor: T.color }}
                            />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Legend ─────────────────────────────────────────────── */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Ambang status tier
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <strong className="text-slate-800">Siap Audit</strong> · skor ≥ 80
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <strong className="text-slate-800">Perlu Perhatian</strong> · skor 50–79
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <strong className="text-slate-800">Tidak Siap</strong> · skor &lt; 50
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}