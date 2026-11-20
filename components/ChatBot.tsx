'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Sparkles,
  Send,
  X,
  Trash2,
  Copy,
  Check,
  StopCircle,
  ArrowRight,
  Bot,
  User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const STORAGE_KEY = 'sidoku_chat_memory_v2';

const INITIAL_SUGGESTIONS = [
  'Bagaimana cara upload dokumen eviden?',
  'Dimana letak menu Unit Pengolah (UP)?',
  'Dimana melihat deadline audit kearsipan?',
  'Bagaimana cara mengecek skor kesiapan audit?',
];

const DEFAULT_WELCOME: Message = {
  id: 'welcome-init',
  role: 'assistant',
  content:
    'Halo! Saya SIDOKU AI, asisten panduan fitur aplikasi SIDOKU Kecamatan Bandung Kidul. Tanyakan menu atau fitur yang ingin Anda cari, saya akan langsung memandu Anda!',
  timestamp: '',
};

// Fungsi helper untuk merender teks dan tombol navigasi link langsung
function renderCleanText(text: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    // Regex memisahkan [Label](URL), **bold**, dan *italic*
    const parts = line.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*|\*.*?\*)/g);
    return (
      <span key={lineIdx} className={lineIdx > 0 ? 'block mt-1.5' : 'block'}>
        {parts.map((part, partIdx) => {
          // Format Link tombol: [Label](URL)
          const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
          if (linkMatch) {
            const [, label, href] = linkMatch;
            return (
              <span key={partIdx} className="block my-2">
                <Link
                  href={href}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#1E3A8A] hover:bg-[#1e40af] text-white text-xs font-semibold rounded-lg shadow-sm transition hover:shadow-md transform hover:-translate-y-0.5"
                >
                  <span>{label}</span>
                  <ArrowRight size={13} className="text-amber-300" />
                </Link>
              </span>
            );
          }

          // Format Tebal: **text**
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={partIdx} className="font-bold text-[#1E3A8A]">
                {part.slice(2, -2)}
              </strong>
            );
          }

          // Format Miring: *text*
          if (part.startsWith('*') && part.endsWith('*')) {
            return (
              <span key={partIdx} className="font-semibold text-slate-700">
                {part.slice(1, -1)}
              </span>
            );
          }

          return part;
        })}
      </span>
    );
  });
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([DEFAULT_WELCOME]);
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Muat riwayat chat dari Supabase (dengan fallback ke LocalStorage)
  useEffect(() => {
    async function loadChatHistory() {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id, role, content, created_at')
          .order('created_at', { ascending: true })
          .limit(50);

        if (!error && data && data.length > 0) {
          const loaded: Message[] = data.map((item: { id: string; role: string; content: string; created_at: string }) => ({
            id: item.id,
            role: item.role as 'user' | 'assistant',
            content: item.content,
            timestamp: new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }));
          setMessages(loaded);
          return;
        }
      } catch {
        // Fallback jika database offline atau tabel belum siap
      }

      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            return;
          }
        }
      } catch {}

      setMessages([
        {
          ...DEFAULT_WELCOME,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }

    loadChatHistory();
  }, []);

  // Simpan riwayat chat ke LocalStorage
  const saveMemory = (newMsgs: Message[]) => {
    setMessages(newMsgs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newMsgs));
    } catch {}
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updated = [...messages, userMessage];
    saveMemory(updated);
    setInput('');
    setLoading(true);

    // Simpan pesan user ke Supabase secara background
    try {
      supabase.from('chat_messages').insert([{ role: 'user', content: text }]).then(() => {});
    } catch {}

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: updated.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || 'Maaf, saya tidak dapat memproses pertanyaan tersebut.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      saveMemory([...updated, botMessage]);

      // Simpan respons bot ke Supabase secara background
      try {
        supabase.from('chat_messages').insert([{ role: 'assistant', content: botMessage.content }]).then(() => {});
      } catch {}
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        const cancelMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Respons dihentikan oleh pengguna.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        saveMemory([...updated, cancelMessage]);
      } else {
        const errMsg = err instanceof Error ? err.message : 'Gagal terhubung ke server.';
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Kendala koneksi: ${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        saveMemory([...updated, errorMessage]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    if (confirm('Bersihkan riwayat percakapan SIDOKU AI?')) {
      const resetList: Message[] = [
        {
          id: 'welcome-reset',
          role: 'assistant',
          content:
            'Riwayat percakapan telah dibersihkan. Tanyakan letak fitur SIDOKU yang ingin Anda temukan!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
      saveMemory(resetList);
      setSuggestions(INITIAL_SUGGESTIONS);
      try {
        supabase
          .from('chat_messages')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
          .then(() => {});
      } catch {}
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Buka Chatbot AI"
        className="fixed bottom-6 right-6 z-50 group flex items-center gap-2.5 bg-[#1E3A8A] hover:bg-[#1e40af] text-white px-4 py-3 rounded-full shadow-2xl hover:shadow-[#1E3A8A]/30 transition-all duration-200 border border-white/20 focus:outline-none focus:ring-4 focus:ring-blue-400/30"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
        <Sparkles size={18} className="text-amber-300 group-hover:rotate-12 transition-transform" />
        <span className="font-bold text-sm tracking-wide">SIDOKU AI</span>
      </button>

      {/* Pop-up Window Chatbot */}
      {isOpen && (
        <div className="fixed bottom-22 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[600px] h-[78vh] bg-white rounded-2xl shadow-2xl border border-[#E9ECEF] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header Pop-up */}
          <div className="bg-[#1E3A8A] text-white px-4 py-3.5 flex items-center justify-between border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-amber-300">
                <MessageSquare size={17} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm tracking-tight">SIDOKU AI</h3>
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold px-1.5 py-0.2 rounded-full border border-emerald-400/30">
                    Aktif
                  </span>
                </div>
                <p className="text-blue-200 text-[11px] leading-tight">
                  Panduan Navigasi & Fitur
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-white/80">
              <button
                onClick={handleClearChat}
                title="Bersihkan Percakapan"
                className="p-1.5 hover:bg-white/10 rounded-lg transition text-blue-200 hover:text-white"
              >
                <Trash2 size={16} />
              </button>

              <button
                onClick={() => setIsOpen(false)}
                title="Tutup Chat"
                className="p-1.5 hover:bg-white/10 rounded-lg transition text-blue-200 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Chat Messages Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8F9FB]">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                      isUser
                        ? 'bg-[#1E3A8A] text-white'
                        : 'bg-blue-100 text-[#1E3A8A] border border-blue-200'
                    }`}
                  >
                    {isUser ? <User size={14} /> : <Bot size={15} />}
                  </div>

                  {/* Bubble Chat */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed shadow-sm relative ${
                      isUser
                        ? 'bg-[#1E3A8A] text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-[#E9ECEF] rounded-tl-none'
                    }`}
                  >
                    <div className="font-sans leading-relaxed">
                      {renderCleanText(m.content)}
                    </div>

                    <div
                      className={`flex items-center justify-between gap-3 mt-1.5 pt-1 border-t ${
                        isUser
                          ? 'border-white/15 text-blue-200 text-[10px]'
                          : 'border-slate-100 text-slate-400 text-[10px]'
                      }`}
                    >
                      <span>{m.timestamp}</span>

                      {!isUser && (
                        <button
                          onClick={() => handleCopy(m.id, m.content)}
                          className="hover:text-[#1E3A8A] font-medium transition flex items-center gap-1"
                          title="Salin jawaban"
                        >
                          {copiedId === m.id ? (
                            <>
                              <Check size={12} className="text-emerald-600" />
                              <span className="text-emerald-600 font-semibold">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Status Loading */}
            {loading && (
              <div className="flex gap-2.5 items-start">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#1E3A8A] border border-blue-200 flex items-center justify-center text-xs font-bold shadow-sm">
                  <Bot size={15} />
                </div>
                <div className="bg-white border border-[#E9ECEF] px-3.5 py-2.5 rounded-2xl rounded-tl-none text-xs text-slate-500 flex items-center gap-2">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-[#1E3A8A] rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-[#1E3A8A] rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-[#1E3A8A] rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                  <span>Mencari letak fitur...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Area Input & Tombol Cancel */}
          <div className="p-3 bg-white border-t border-[#E9ECEF] flex-shrink-0">
            {/* Saran Pertanyaan Dinamis */}
            {!loading && suggestions.length > 0 && (
              <div className="mb-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {suggestions.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F8F9FB] hover:bg-blue-50 text-[#1E3A8A] border border-[#E9ECEF] hover:border-[#1E3A8A]/30 text-[11px] font-medium rounded-full whitespace-nowrap transition shadow-2xs hover:shadow-xs flex-shrink-0"
                    >
                      <Sparkles size={11} className="text-amber-500" />
                      <span>{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tombol Cancel saat AI sedang merespon */}
            {loading && (
              <div className="flex justify-center mb-2">
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-medium rounded-full transition shadow-xs"
                >
                  <StopCircle size={13} />
                  <span>Hentikan Jawaban</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 bg-[#F8F9FB] border border-[#E9ECEF] focus-within:border-[#1E3A8A] focus-within:ring-2 focus-within:ring-blue-100 rounded-xl px-3 py-1.5 transition">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tanya letak fitur di SIDOKU..."
                rows={1}
                disabled={loading}
                className="w-full bg-transparent resize-none outline-none text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 max-h-24 py-1"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || loading}
                aria-label="Kirim Pesan"
                className="w-8 h-8 rounded-lg bg-[#1E3A8A] hover:bg-[#1e40af] disabled:opacity-40 disabled:hover:bg-[#1E3A8A] text-white flex items-center justify-center transition flex-shrink-0"
              >
                <Send size={15} />
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 px-1">
              <span>Tersimpan otomatis ke database</span>
              <span>SIDOKU Kec. Bandung Kidul</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
