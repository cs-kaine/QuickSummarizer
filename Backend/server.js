require('dotenv').config();
const express = require('express');
const cors = require('cors');
// 1. Import SDK Gemini 
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Inisialisasi instance Gemini API 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Konfigurasi CORS untuk Chrome Extension
app.use(cors()); 

// Middleware server membaca JSON
app.use(express.json()); 

// Global Cache
const summaryCache = {};

// Route default
app.get('/', (req, res) => {
    res.send('Quicksummarizer Backend Server is running!');
});

// Endpoint yang nerima URL
app.post('/api/summarize', async (req, res) => {
    try {
        const { url, text } = req.body;

        // Validasi input
        if (!url && !text) {
            return res.status(400).json({ 
                error: "Bad Request", 
                message: "Harap sertakan 'url' atau 'text' di dalam body request." 
            });
        }

        console.log(`[LOG] Menerima request untuk merangkum: ${url ? url : 'Teks langsung'}`);

        // 1. Cek Cache
        if (url && summaryCache[url]) {
            console.log(`[CACHE HIT] Mengambil data dari memori untuk: ${url}`);
            return res.status(200).json({
                ...summaryCache[url],
                source: "cache" 
            });
        }

        console.log(`[CACHE MISS] Menghubungi Gemini untuk: ${url}`);
        
        // 2. Proses AI dengan Google Gemini API
        const sourceData = text ? text : url;
        
        const systemPrompt = `Anda adalah asisten cerdas yang bertugas merangkum berita untuk ekstensi browser.
Tugas Anda adalah membaca teks berita yang diberikan dan menghasilkan rangkuman ringkas, menganalisis sentimen, dan menentukan kategori berita.

ATURAN WAJIB:
- Output Anda HARUS berformat JSON yang valid.
- Jangan tambahkan teks apa pun sebelum atau sesudah blok JSON.
- Jangan gunakan formatting markdown seperti \`\`\`json.
- JSON harus memiliki struktur persis seperti ini:
{
  "summary": ["poin paling penting 1", "poin paling penting 2", "poin paling penting 3"],
  "sentiment": "Positif" | "Negatif" | "Netral",
  "category": "Politik" | "Teknologi" | "Ekonomi" | "Hiburan" | "Olahraga" | "Lainnya"
}

Teks Berita yang harus dirangkum:
"""
${sourceData}
"""`;

        // Memanggil model Gemini 2.5 Flash 
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json", 
                temperature: 0.3 
            }
        });
        const geminiResult = JSON.parse(response.text);

        // 3. Simpan ke cache 
        if (url) {
            summaryCache[url] = geminiResult;
        }

        // Kembalikan ke klien/ekstensi
        res.status(200).json({
            ...geminiResult,
            source: "gemini_api"
        });

    } catch (error) {
        console.error("[ERROR] Terjadi kesalahan di endpoint summarize:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

// Server berjalan
app.listen(PORT, () => {
    console.log(`🚀 Quicksummarizer Backend siap sedia!`);
    console.log(`👉 Berjalan di: http://localhost:${PORT}`);
});