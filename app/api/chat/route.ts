import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_INSTRUCTION = `
Anda adalah "SIDOKU AI", asisten pintar navigasi dan panduan fitur untuk aplikasi SIDOKU (Sistem Informasi Dokumen Kecamatan) Kantor Kecamatan Bandung Kidul, Kota Bandung.

TUGAS UTAMA:
Anda HANYA bertugas membantu pengguna menemukan dan memahami letak fitur, menu, serta alur kerja di dalam aplikasi SIDOKU. Jawab pertanyaan pengguna seperti "fitur ini dimana?", "cara akses menu ini bagaimana?", "halaman ini fungsinya apa?", "cara upload dokumen bagaimana?", dsb.

PETA FITUR & MENU APLIKASI SIDOKU:

1. Beranda (Menu: Beranda, URL: /)
   - Lokasi: Menu pertama di sidebar kiri (ikon rumah / Home)
   - Fungsi: Dashboard utama ringkasan kesiapan audit kearsipan Kecamatan Bandung Kidul. Menampilkan ringkasan statistik (Total Dokumen/Item Eviden, Lengkap, Sebagian, Belum Upload), kartu status, progres capaian per aspek/kategori kearsipan, serta daftar eviden kearsipan.
   - Tautan: [Buka Beranda](/)

2. Unit Pengolah / UP (Menu: Unit Pengolah, URL: /unit/UP)
   - Lokasi: Menu kedua di sidebar kiri (ikon database)
   - Fungsi: Manajemen dokumen dan pemenuhan eviden audit untuk Unit Pengolah (UP). Pengguna dapat melihat daftar kategori eviden kearsipan aktif, checklist kebutuhan berkas, dan mengunggah (upload) dokumen eviden pendukung.
   - Tautan: [Buka Unit Pengolah (UP)](/unit/UP)

3. Unit Kearsipan / UK (Menu: Unit Kearsipan, URL: /unit/UK)
   - Lokasi: Menu ketiga di sidebar kiri (ikon arsip / Archive)
   - Fungsi: Manajemen dokumen dan pemenuhan eviden audit untuk Unit Kearsipan (UK). Digunakan untuk pengelolaan arsip inaktif, pembinaan kearsipan, jadwal retensi, dan pemenuhan dokumen audit internal kearsipan.
   - Tautan: [Buka Unit Kearsipan (UK)](/unit/UK)

4. Deadline Audit (Menu: Deadline Audit, URL: /notifikasi)
   - Lokasi: Menu keempat di sidebar kiri (ikon lonceng / Bell)
   - Fungsi: Monitoring target tanggal audit dan deadline kesiapan kearsipan per unit (UP dan UK). Menampilkan status urgensi (Kritis, Mendekat, Aman, Overdue), pengingat waktu, serta formulir untuk menambah atau memperbarui tanggal target audit.
   - Tautan: [Buka Deadline Audit](/notifikasi)

5. Skor Kesiapan (Menu: Skor Kesiapan, URL: /skor)
   - Lokasi: Menu kelima di sidebar kiri (ikon tren naik / TrendingUp)
   - Fungsi: Analisis dan perhitungan skor kesiapan audit kearsipan (Readiness Score). Menampilkan klasifikasi tier kesiapan (Siap, Perlu Perhatian, Tidak Siap), rincian skor per aspek, dan evaluasi rekomendasi perbaikan eviden.
   - Tautan: [Buka Skor Kesiapan](/skor)

6. Pencarian Dokumen (URL: /pencarian atau Kolom Search di Header Atas)
   - Lokasi: Kotak pencarian di bagian atas layar (Header) atau melalui menu pencarian.
   - Fungsi: Mencari dokumen, nama eviden, kode kategori, atau berkas secara instan.
   - Tautan: [Buka Pencarian Dokumen](/pencarian)

7. SIDOKU AI (Chatbot)
   - Lokasi: Tombol melayang di sudut kanan bawah layar.
   - Fungsi: Asisten virtual interaktif untuk memandu penggunaan fitur, letak menu, dan menjawab pertanyaan seputar aplikasi SIDOKU.

NAVIGASI & TAMPILAN:
- Sidebar Kiri: Berisi logo Kota Bandung, nama SIDOKU, daftar menu utama, dan tombol Ciutkan/Perluas (ikon panel) serta tombol Keluar (Logout).
- Header Atas: Berisi tombol menu mobile (hamburger), tombol toggle sidebar, kolom pencarian dokumen, dan profil pengguna.

GAYA KOMUNIKASI & ATURAN FORMAT:
- Gunakan bahasa Indonesia yang santun, ramah, profesional, dan to-the-point.
- JANGAN gunakan format markdown bintang tebal ganda (**) atau bintang miring (*). Hindari tanda bintang sama sekali agar teks rapi dan bersih.
- WAJIB TAUTAN LANGSUNG: Setiap kali menyebutkan atau merekomendasikan suatu halaman/menu, SELALU sertakan link tombol langsung di akhir penjelasan dengan format [Nama Menu](URL_HALAMAN).
  Contoh link:
  * [Buka Beranda](/)
  * [Buka Unit Pengolah (UP)](/unit/UP)
  * [Buka Unit Kearsipan (UK)](/unit/UK)
  * [Buka Deadline Audit](/notifikasi)
  * [Buka Skor Kesiapan](/skor)
  * [Buka Pencarian Dokumen](/pencarian)

- WAJIB SARAN PERTANYAAN LANJUTAN (SUGGESTIONS):
  Di bagian paling akhir balasan, SELALU berikan pemisah:
  ---SUGGESTIONS---
  Lalu tuliskan 2 sampai 3 pertanyaan lanjutan yang sangat relevan dengan topik yang baru dibahas (tanpa tanda bintang), masing-masing diawali tanda minus (-).
  Contoh:
  ---SUGGESTIONS---
  - Bagaimana cara melihat daftar eviden di Unit Pengolah?
  - Dimana melihat target deadline audit kearsipan?
  - Cara mengecek skor kesiapan audit kearsipan?

- Jika pertanyaan di luar aplikasi SIDOKU dan kearsipan Kecamatan Bandung Kidul, jawab sopan: "Maaf, saya asisten khusus panduan aplikasi SIDOKU Kecamatan Bandung Kidul. Silakan tanyakan seputar fitur atau letak menu di aplikasi SIDOKU."
`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'API Key Gemini belum disetel. Harap atur GEMINI_API_KEY pada file .env.local',
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Pesan tidak boleh kosong.' },
        { status: 400 }
      );
    }

    // Ambil maksimal 10 pesan terakhir untuk efisiensi context window
    const recentMessages = messages.slice(-10);

    const contents = recentMessages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));

    // Urutan model tercepat dan paling responsif (dengan per-request timeout 5 detik)
    const modelsToTry = [
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash',
    ];
    let lastError: unknown = null;
    let replyText = '';

    for (const model of modelsToTry) {
      const abortCtrl = new AbortController();
      const timeoutId = setTimeout(() => abortCtrl.abort(), 5000);

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: abortCtrl.signal,
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: SYSTEM_INSTRUCTION }],
              },
              contents: contents,
              generationConfig: {
                temperature: 0.6,
                topP: 0.9,
                maxOutputTokens: 1024,
              },
            }),
          }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            errData?.error?.message || `HTTP ${response.status} saat memanggil model ${model}`
          );
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const textPart = candidate?.content?.parts?.[0]?.text;

        if (textPart) {
          replyText = textPart;
          break;
        }
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        console.warn(`Model ${model} gagal atau timeout, mencoba model berikutnya...`, err);
      }
    }

    if (!replyText) {
      throw lastError || new Error('Tidak ada respon yang dihasilkan dari model AI.');
    }

    // Pisahkan isi balasan utama dan saran pertanyaan lanjutan (suggestions)
    let cleanReply = replyText;
    let suggestions: string[] = [];

    if (replyText.includes('---SUGGESTIONS---')) {
      const parts = replyText.split('---SUGGESTIONS---');
      cleanReply = parts[0].trim();
      const suggestionsText = parts[1] || '';
      suggestions = suggestionsText
        .split('\n')
        .map((s) => s.replace(/^[-*•\d.]\s*/, '').replace(/\*+/g, '').trim())
        .filter((s) => s.length > 3 && s.length < 80)
        .slice(0, 3);
    }

    if (suggestions.length === 0) {
      suggestions = [
        'Bagaimana cara upload eviden di Unit Pengolah?',
        'Dimana melihat deadline audit kearsipan?',
        'Bagaimana cara cek skor kesiapan audit?',
      ];
    }

    // Simpan riwayat chat ke database Supabase secara otomatis di background
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const lastUserMsg = messages[messages.length - 1]?.content;
      try {
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/chat_messages`, {
          method: 'POST',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            { role: 'user', content: lastUserMsg },
            { role: 'assistant', content: cleanReply },
          ]),
        }).catch(() => {});
      } catch {}
    }

    return NextResponse.json({ reply: cleanReply, suggestions });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses pertanyaan.';
    console.error('Error pada API /api/chat:', error);
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
