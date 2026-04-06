require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

//Konfigurasi CORS untuk Chrome Extension
app.use(cors()); 

// Middleware server membaca JSON
app.use(express.json()); 

// Global Cache
// Struktur data: { "url_berita": { summary, sentiment, category, timestamp } }
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
        if (summaryCache[url]) {
            console.log(`[CACHE HIT] Mengambil data dari memori untuk: ${url}`);
            return res.status(200).json({
                ...summaryCache[url],
                source: "cache" 
            });
        }

        console.log(`[CACHE MISS] Menghubungi Gemini untuk: ${url}`);
        
        // 2. Proses AI
        // TODO: (SWE-9) Logika pemanggilan Google Gemini API akan diletakkan di sini
        // Balasan sementara karena SWE-9 belum selesai. Kalau udah, bagian ini bisa dihapus/disesuaikan
        const mockAiProcess = () => new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    summary: [
                        "Poin 1 Rangkuman",
                        "Poin 2 Rangkuman",
                        "Poin 3 Rangkuman"
                    ],
                    sentiment: "Positif / Negatif",
                    category: "Kategori"
                });
            }, 3000); // Simulasi proses 3 detik
        });

        const result = await mockAiProcess();

        // 3. Simpan ke cache
        summaryCache[url] = result;

        res.status(200).json({
            ...result,
            source: "gemini_api"
        });

    } catch (error) {
        console.error("[ERROR] Terjadi kesalahan di endpoint summarize:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//Server berjalan di localhost:3000 
app.listen(PORT, () => {
    console.log(`🚀 Quicksummarizer Backend siap sedia!`);
    console.log(`👉 Berjalan di: http://localhost:${PORT}`);
});