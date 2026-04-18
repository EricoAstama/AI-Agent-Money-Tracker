---
title: AI Agent Money Tracker
emoji: 💰
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# 🤖 Money Tracker Bot

SaaS Telegram Bot untuk mencatat pengeluaran harian dengan AI-powered categorization menggunakan **Groq (Llama 3)**.

## ✨ Fitur

- 📝 **Catat pengeluaran** — Cukup kirim pesan seperti `kopi susu 25k`
- 🤖 **AI Categorization** — Otomatis dikategorikan oleh Gemini AI
- ⚡ **Smart Cache** — Hemat biaya API, item yang sama tidak perlu AI lagi
- 📊 **Laporan Excel** — Download laporan bulanan dalam format `.xlsx`
- 💰 **Budget Alert** — Peringatan otomatis saat melebihi budget
- 👥 **Multi-User** — Setiap user punya data & kategori terpisah

## 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Bot Framework | Telegraf |
| Database | Supabase (PostgreSQL) |
| AI Engine | Groq (Llama 3) |
| Report | ExcelJS |
| Server | Express.js |

## 📦 Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd ai-agent-money-tracker
npm install
```

### 2. Setup Database

Jalankan `schema.sql` di Supabase SQL Editor.

### 3. Environment Variables

Copy `.env.example` ke `.env` dan isi dengan credentials:

```bash
cp .env.example .env
```

- **BOT_TOKEN**: Dari [@BotFather](https://t.me/BotFather)
- **SUPABASE_URL**: URL project Supabase
- **SUPABASE_SERVICE_KEY**: Service Role key dari Supabase
- **GROQ_API_KEY**: Dari [Groq Console](https://console.groq.com/)

### 4. Run

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

## 📱 Bot Commands

| Command | Deskripsi |
|---------|-----------|
| `/start` | Registrasi & setup kategori default |
| `/addcategory [Nama]` | Tambah kategori baru |
| `/listcategory` | Lihat semua kategori |
| `/setbudget [Angka]` | Atur batas budget bulanan |
| `/report` | Download laporan bulanan (Excel) |

## 💡 Format Pengeluaran

Bot mengerti format angka Indonesia:

```
kopi susu 25k        → Rp25.000
nasi goreng 15rebu   → Rp15.000
bensin 50000         → Rp50.000
sewa 1.5jt           → Rp1.500.000
50.000 makan siang   → Rp50.000
```

## 🧠 Hybrid AI Categorization

```
Input → Parser → Cache Check → [HIT] → Gunakan cache
                             → [MISS] → Groq AI → Simpan ke cache
```

1. **Cache First** — Cek `category_cache` berdasarkan `user_id` + `keyword`
2. **AI Fallback** — Panggil Groq jika tidak ada di cache
3. **Auto-Learn** — Simpan hasil AI ke cache untuk penggunaan selanjutnya

## 📁 Struktur File

```
├── index.js          # Entry point + bot commands + Express server
├── src/
│   ├── db.js         # Supabase database operations
│   ├── ai.js         # Groq AI categorization
│   ├── parser.js     # Expense text parser
│   └── report.js     # Excel report generator
├── schema.sql        # Database schema (SQL)
├── .env.example      # Environment template
├── .gitignore
└── package.json
```

## 📄 License

ISC
