require('dotenv').config();

const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

const db = require('./src/db');
const ai = require('./src/ai');
const { parseExpense } = require('./src/parser');
const { generateReport, cleanupReport } = require('./src/report');

// ─── Validate environment ────────────────────────────────────────
const requiredEnvVars = ['BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing environment variable: ${envVar}`);
    process.exit(1);
  }
}

// ─── Initialize bot ──────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── Helper: format currency ─────────────────────────────────────
function formatRupiah(num) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

// ─── /start ──────────────────────────────────────────────────────
bot.start(async (ctx) => {
  try {
    const tgUser = ctx.from;
    const telegramId = tgUser.id;
    const firstName = tgUser.first_name || 'Pengguna';

    // Check if user already exists
    const existing = await db.getProfile(telegramId);

    if (existing) {
      return ctx.reply(
        `👋 Selamat datang kembali, *${firstName}*\\!\n\n` +
        `📊 Bot Money Tracker\\-mu sudah aktif\\.\n` +
        `Kirim pengeluaranmu langsung, misal: _kopi susu 25k_`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // New user: create profile + seed categories
    await db.upsertProfile(telegramId, firstName);
    await db.seedDefaultCategories(telegramId);

    const categoryList = db.DEFAULT_CATEGORIES.map((c, i) => `  ${i + 1}\\. ${c}`).join('\n');

    return ctx.reply(
      `🎉 Halo, *${firstName}*\\! Selamat datang di Money Tracker Bot\\!\n\n` +
      `✅ Akun berhasil dibuat\\.\n\n` +
      `📂 Kategori default\\-mu:\n${categoryList}\n\n` +
      `💡 *Cara pakai:*\n` +
      `• Kirim pengeluaran: _kopi susu 25k_\n` +
      `• /addcategory \\[Nama\\] — Tambah kategori\n` +
      `• /listcategory — Lihat semua kategori\n` +
      `• /setbudget \\[Angka\\] — Atur batas budget\n` +
      `• /report — Laporan bulanan \\(Excel\\)`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    console.error('❌ /start error:', error);
    return ctx.reply('⚠️ Terjadi kesalahan saat registrasi. Silakan coba lagi.');
  }
});

// ─── /addcategory ────────────────────────────────────────────────
bot.command('addcategory', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const args = ctx.message.text.replace('/addcategory', '').trim();
    if (!args) {
      return ctx.reply('❌ Format: /addcategory [Nama Kategori]\nContoh: /addcategory Hiburan');
    }

    await db.addCategory(telegramId, args);
    return ctx.reply(`✅ Kategori *"${args}"* berhasil ditambahkan, ${profile.first_name}!`, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('❌ /addcategory error:', error);
    if (error.code === '23505') {
      return ctx.reply('⚠️ Kategori dengan nama tersebut sudah ada.');
    }
    return ctx.reply('⚠️ Gagal menambahkan kategori. Silakan coba lagi.');
  }
});

// ─── /listcategory ───────────────────────────────────────────────
bot.command('listcategory', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const categories = await db.listCategories(telegramId);
    if (categories.length === 0) {
      return ctx.reply('📂 Kamu belum punya kategori. Gunakan /addcategory untuk menambah.');
    }

    const list = categories.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
    return ctx.reply(`📂 *Kategori milik ${profile.first_name}:*\n\n${list}`, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('❌ /listcategory error:', error);
    return ctx.reply('⚠️ Gagal mengambil daftar kategori.');
  }
});

// ─── /setbudget ──────────────────────────────────────────────────
bot.command('setbudget', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const args = ctx.message.text.replace('/setbudget', '').trim();
    const amount = parseFloat(args.replace(/[.,]/g, ''));

    if (!args || isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Format: /setbudget [Angka]\nContoh: /setbudget 2000000');
    }

    await db.setBudget(telegramId, amount);
    return ctx.reply(
      `✅ Budget bulanan berhasil diatur ke ${formatRupiah(amount)}, ${profile.first_name}!`
    );
  } catch (error) {
    console.error('❌ /setbudget error:', error);
    return ctx.reply('⚠️ Gagal mengatur budget. Silakan coba lagi.');
  }
});

// ─── /report ─────────────────────────────────────────────────────
bot.command('report', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const transactions = await db.getMonthlyTransactions(telegramId);
    if (transactions.length === 0) {
      return ctx.reply('📊 Belum ada transaksi bulan ini, ' + profile.first_name + '.');
    }

    await ctx.reply('⏳ Sedang menyiapkan laporan...');

    const filePath = await generateReport(transactions, profile.first_name);

    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const now = new Date();

    await ctx.replyWithDocument(
      { source: fs.createReadStream(filePath), filename: `Laporan_${monthNames[now.getMonth()]}_${now.getFullYear()}.xlsx` },
      {
        caption: `📊 Laporan keuangan ${monthNames[now.getMonth()]} ${now.getFullYear()}\n` +
          `📝 Total transaksi: ${transactions.length}\n` +
          `💰 Total pengeluaran: ${formatRupiah(transactions.reduce((s, t) => s + Number(t.amount), 0))}`,
      }
    );

    cleanupReport(filePath);
  } catch (error) {
    console.error('❌ /report error:', error);
    return ctx.reply('⚠️ Gagal membuat laporan. Silakan coba lagi.');
  }
});

// ─── /summary ────────────────────────────────────────────────────
bot.command('summary', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const todayTx = await db.getDailyTransactions(telegramId);
    if (todayTx.length === 0) {
      return ctx.reply(`📋 Belum ada pengeluaran hari ini, ${profile.first_name}.`);
    }

    // Group by category
    const byCategory = {};
    let totalToday = 0;
    for (const tx of todayTx) {
      const amt = Number(tx.amount);
      totalToday += amt;
      if (!byCategory[tx.category]) {
        byCategory[tx.category] = { total: 0, items: [] };
      }
      byCategory[tx.category].total += amt;
      byCategory[tx.category].items.push(tx);
    }

    // Build message
    let msg = `📋 *Ringkasan Hari Ini*\n👤 ${profile.first_name}\n\n`;

    for (const [cat, data] of Object.entries(byCategory)) {
      msg += `📂 *${cat}* — ${formatRupiah(data.total)}\n`;
      for (const tx of data.items) {
        const time = new Date(tx.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        msg += `  • ${tx.item} · ${formatRupiah(Number(tx.amount))} _(${time})_\n`;
      }
      msg += `\n`;
    }

    msg += `💰 *Total hari ini:* ${formatRupiah(totalToday)}`;

    // Budget info
    const budgetLimit = Number(profile.budget_limit) || 0;
    if (budgetLimit > 0) {
      const monthlyTotal = await db.getMonthlyTotal(telegramId);
      const remaining = budgetLimit - monthlyTotal;
      if (remaining < 0) {
        msg += `\n\n🚨 *OVER BUDGET!*\nAnggaran bulanan: ${formatRupiah(budgetLimit)}\nLebih: ${formatRupiah(Math.abs(remaining))}`;
      } else {
        const pct = ((monthlyTotal / budgetLimit) * 100).toFixed(0);
        msg += `\n\n💼 Budget bulanan: ${formatRupiah(remaining)} tersisa (${pct}% terpakai)`;
      }
    }

    return ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ /summary error:', error);
    return ctx.reply('⚠️ Gagal mengambil ringkasan. Silakan coba lagi.');
  }
});

// ─── Text handler: Expense tracking ─────────────────────────────
bot.on('text', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const text = ctx.message.text;

    // Ignore commands
    if (text.startsWith('/')) return;

    const profile = await db.getProfile(telegramId);
    if (!profile) {
      return ctx.reply('⚠️ Silakan /start terlebih dahulu untuk mendaftar.');
    }

    // Parse the expense
    const parsed = parseExpense(text);
    if (!parsed) {
      return ctx.reply(
        '🤔 Hmm, aku tidak bisa membaca itu.\n\n' +
        '💡 *Contoh format:*\n' +
        '• _kopi susu 25k_\n' +
        '• _bensin 50000_\n' +
        '• _nasi goreng 15rebu_',
        { parse_mode: 'Markdown' }
      );
    }

    const { item, amount } = parsed;

    // Get user categories
    const categories = await db.listCategories(telegramId);
    if (categories.length === 0) {
      return ctx.reply('⚠️ Kamu belum punya kategori. Gunakan /start untuk setup awal.');
    }

    // ─── Hybrid AI Categorization ──────────────────────────
    let category;

    // Step 1: Check cache
    category = await db.getCachedCategory(telegramId, item);

    if (category) {
      console.log(`📦 Cache HIT: "${item}" → ${category}`);
    } else {
      // Step 2: AI Fallback
      console.log(`🔍 Cache MISS: "${item}" → asking AI...`);
      category = await ai.classifyCategory(item, categories);

      if (!category) {
        // AI failed (quota exceeded, network error, etc.)
        return ctx.reply(
          `⚠️ Maaf ${profile.first_name}, AI sedang tidak tersedia.\n\n` +
          `Kamu bisa coba lagi nanti, atau kirim dengan format:\n` +
          `_[item] [harga] [kategori]_\nContoh: _kopi 25k Jajan_`,
          { parse_mode: 'Markdown' }
        );
      }

      console.log(`🤖 AI result: "${item}" → ${category}`);

      // Step 3: Learning — save to cache
      await db.setCachedCategory(telegramId, item, category);
    }

    // ─── Save transaction ──────────────────────────────────
    await db.addTransaction(telegramId, item, amount, category);

    // ─── Budget check ──────────────────────────────────────
    const monthlyTotal = await db.getMonthlyTotal(telegramId);
    const budgetLimit = Number(profile.budget_limit) || 0;

    let reply =
      `✅ Tercatat, *${profile.first_name}*!\n\n` +
      `📝 *${item}*\n` +
      `💰 ${formatRupiah(amount)}\n` +
      `📂 Kategori: ${category}\n\n` +
      `📊 Total bulan ini: ${formatRupiah(monthlyTotal)}`;

    if (budgetLimit > 0) {
      const remaining = budgetLimit - monthlyTotal;
      if (remaining < 0) {
        reply += `\n\n🚨 *OVER BUDGET!*\nAnggaran: ${formatRupiah(budgetLimit)}\nLebih: ${formatRupiah(Math.abs(remaining))}`;
      } else {
        const percentage = ((monthlyTotal / budgetLimit) * 100).toFixed(0);
        reply += `\n\n💼 Sisa budget: ${formatRupiah(remaining)} (${percentage}% terpakai)`;

        // Warning at 80%
        if (percentage >= 80) {
          reply += `\n⚠️ _Perhatian! Budget hampir habis._`;
        }
      }
    }

    return ctx.reply(reply, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ Text handler error:', error);
    return ctx.reply('⚠️ Terjadi kesalahan saat mencatat pengeluaran. Silakan coba lagi.');
  }
});

// ─── Error handler ───────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`❌ Bot error for ${ctx.updateType}:`, err);
  ctx.reply('⚠️ Terjadi kesalahan internal. Silakan coba lagi nanti.').catch(() => { });
});

// ─── Express server (health check + future webhook) ──────────────
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'Money Tracker Bot',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ─── Launch ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Start Express
    app.listen(PORT, () => {
      console.log(`🌐 Server running on port ${PORT}`);
    });

    // Start bot (polling mode for development)
    await bot.launch();
    console.log('🤖 Money Tracker Bot is running!');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

start();
