require('dotenv').config();

const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

const db = require('./src/db');
const ai = require('./src/ai');
const { parseExpense, parseAmount } = require('./src/parser');
const { generateReport, cleanupReport } = require('./src/report');
const { Markup } = require('telegraf');

// ─── Validate environment ────────────────────────────────────────
const requiredEnvVars = ['BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GROQ_API_KEY'];
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

    const categoryList = db.DEFAULT_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join('\n');

    return ctx.reply(
      `🎉 Halo, *${firstName}*! Selamat datang di Money Tracker Bot!\n\n` +
      `✅ Akun berhasil dibuat.\n\n` +
      `📂 Kategori default-mu:\n${categoryList}\n\n` +
      `💡 *Cara pakai:*\n` +
      `• Kirim pengeluaran: _kopi susu 25k_\n` +
      `• /addcategory [Nama] — Tambah kategori\n` +
      `• /listcategory — Lihat semua kategori\n` +
      `• /setbudget [Angka] — Atur batas budget\n` +
      `• /deletebudget — Hapus batas budget\n` +
      `• /report — Laporan bulanan (Excel)`,
      { parse_mode: 'Markdown' }
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
    const amount = parseAmount(args);

    if (!args || isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Format: /setbudget [Angka]\nContoh:\n• /setbudget 2000000\n• /setbudget 2jt\n• /setbudget 1.5jt');
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

// ─── /deletecategory ─────────────────────────────────────────────
bot.command('deletecategory', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const args = ctx.message.text.replace('/deletecategory', '').trim();

    // If name is provided directly
    if (args) {
      await db.deleteCategory(telegramId, args);
      return ctx.reply(`✅ Kategori *"${args}"* berhasil dihapus.`, { parse_mode: 'Markdown' });
    }

    // Otherwise, show interactive buttons
    const categories = await db.listCategories(telegramId);
    if (categories.length === 0) {
      return ctx.reply('📂 Kamu tidak punya kategori untuk dihapus.');
    }

    const buttons = categories.map((cat) => {
      // Limit category name for callback data safety
      return [Markup.button.callback(`🗑 ${cat}`, `del_cat:${cat.substring(0, 30)}`)];
    });

    return ctx.reply(
      '📂 *Pilih kategori yang ingin dihapus:*\n\n' +
      '_Catatan: Cache terkait kategori ini juga akan dibersihkan._',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
  } catch (error) {
    console.error('❌ /deletecategory error:', error);
    return ctx.reply('⚠️ Gagal memproses penghapusan kategori.');
  }
});

bot.action(/^del_cat:(.+)$/, async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const categoryName = ctx.match[1];

    await db.deleteCategory(telegramId, categoryName);
    await ctx.editMessageText(`✅ Kategori *"${categoryName}"* telah dihapus!`, { parse_mode: 'Markdown' });
    return ctx.answerCbQuery(`Kategori ${categoryName} dihapus`);
  } catch (error) {
    console.error('❌ del_cat action error:', error);
    return ctx.answerCbQuery('⚠️ Gagal menghapus kategori.');
  }
});

// ─── /deletebudget ───────────────────────────────────────────────
bot.command('deletebudget', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    await db.setBudget(telegramId, null);
    return ctx.reply(`✅ Budget bulanan berhasil diapus, ${profile.first_name}! Bot tidak akan menghitung sisa budget lagi.`);
  } catch (error) {
    console.error('❌ /deletebudget error:', error);
    return ctx.reply('⚠️ Gagal menghapus budget.');
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

// ─── /help ───────────────────────────────────────────────────────
bot.help((ctx) => {
  return ctx.reply(
    `📖 *Panduan Money Tracker*\n\n` +
    `💬 *Mencatat Pengeluaran:*\n` +
    `Kirim saja pesan seperti:\n` +
    `• _kopi 25k_\n` +
    `• _nasi goreng 15000_\n` +
    `• _ojek 12rebu_\n\n` +
    `✨ *Smart Matching:*\n` +
    `Bot akan mengingat kategori tiap kata kunci. Contoh: Jika kamu set "makan" sebagai *Pangan*, maka "makan malam" otomatis akan masuk kategori *Pangan*.\n\n` +
    `🛠 *Perintah Lain:*\n` +
    `• /summary — Ringkasan hari ini\n` +
    `• /report — Download laporan Excel\n` +
    `• /undo — Hapus transaksi terakhir\n` +
    `• /reset — Hapus semua data bulan ini\n` +
    `• /listcategory — Lihat semua kategori\n` +
    `• /addcategory [Nama] — Tambah kategori baru\n` +
    `• /deletecategory — Hapus kategori\n` +
    `• /setbudget — Atur target budget\n` +
    `• /deletebudget — Hapus target budget`,
    { parse_mode: 'Markdown' }
  );
});

// ─── /undo (Hapus transaksi terakhir) ──────────────────────────
bot.command('undo', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const deleted = await db.deleteLastTransaction(telegramId);

    if (!deleted) {
      return ctx.reply('📭 Tidak ada transaksi yang bisa dihapus.');
    }

    // NEW: Unlearn the keyword so it can be re-categorized correctly
    await db.unlearnKeyword(telegramId, deleted.item);

    return ctx.reply(
      `🗑 *Transaksi Dihapus & "Unlearned"!*\n\n` +
      `📝 ${deleted.item}\n` +
      `💰 ${formatRupiah(deleted.amount)}\n` +
      `📂 ${deleted.category}\n\n` +
      `💡 _Sekarang bot sudah lupa kategori item ini. Silakan input ulang jika ingin mengganti kategorinya._`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('❌ /undo error:', error);
    return ctx.reply('⚠️ Gagal menghapus transaksi.');
  }
});

// ─── /reset (Hapus data bulan ini) ──────────────────────────────
bot.command('reset', async (ctx) => {
  return ctx.reply(
    '❓ *Konfirmasi Reset*\n\n' +
    'Apakah kamu yakin ingin menghapus SEMUA transaksi di bulan ini?\n' +
    '_Tindakan ini tidak bisa dibatalkan._',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Ya, Hapus Semua', 'reset_confirm')],
        [Markup.button.callback('❌ Batal', 'reset_cancel')]
      ])
    }
  );
});

bot.action('reset_confirm', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    await db.resetUserData(telegramId);
    await ctx.editMessageText('✅ *Data transaksimu telah dihapus bersih!* Mari mulai lembaran baru. 🚩', { parse_mode: 'Markdown' });
    return ctx.answerCbQuery('Data berhasil dihapus');
  } catch (error) {
    console.error('❌ Reset error:', error);
    return ctx.answerCbQuery('⚠️ Gagal mereset data.');
  }
});

bot.action('reset_cancel', async (ctx) => {
  await ctx.editMessageText('❌ *Reset dibatalkan.*', { parse_mode: 'Markdown' });
  return ctx.answerCbQuery('Reset dibatalkan');
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

    // ─── Smart Categorization System ──────────────────────
    let category = null;

    // 1. Fetch all user cache for smart matching
    const allCache = await db.listAllCache(telegramId);

    // 2. Exact match first
    const exactMatch = allCache.find(c => c.keyword === item.toLowerCase().trim());
    if (exactMatch) {
      category = exactMatch.category;
    } else {
      // 3. Smart "Word-level" matching
      // If any word in the user's input matches a cached keyword, use that category.
      const inputWords = item.toLowerCase().split(/\s+/);
      const match = allCache.find(c => {
        const cachedWords = c.keyword.split(/\s+/);
        // Check if all words of cached keyword are in the current input
        return cachedWords.every(word => inputWords.includes(word));
      });
      if (match) {
        category = match.category;
      }
    }

    if (category) {
      console.log(`📦 Cache HIT: "${item}" → ${category}`);

      // Save transaction directly
      await db.addTransaction(telegramId, item, amount, category);

      // Send receipt
      const monthlyTotal = await db.getMonthlyTotal(telegramId);
      return ctx.reply(buildReceipt(profile, item, amount, category, monthlyTotal), { parse_mode: 'Markdown' });
    }

    // Cache MISS: Step 2 — Try AI (Groq)
    console.log(`🔍 Cache MISS: "${item}" → asking Groq AI...`);
    category = await ai.classifyCategory(item, categories);

    if (category) {
      console.log(`🤖 AI HIT: "${item}" → ${category}`);

      // Save to transaction + cache (Learning)
      await db.addTransaction(telegramId, item, amount, category);
      await db.setCachedCategory(telegramId, item, category);

      const monthlyTotal = await db.getMonthlyTotal(telegramId);
      return ctx.reply(
        `🤖 _AI Categorization: ${category}_\n\n` +
        buildReceipt(profile, item, amount, category, monthlyTotal),
        { parse_mode: 'Markdown' }
      );
    }

    // Step 3 — Manual Fallback (Buttons)
    console.log(`⚠️ AI UNSURE: "${item}" → showing buttons...`);

    // Telegram callback data limit: 64 bytes.
    // Format: cat:[index]:[amount]:[item_truncated]
    const buttons = categories.map((cat, idx) => {
      const callbackData = `cat:${idx}:${amount}:${item.substring(0, 30)}`;
      return Markup.button.callback(cat, callbackData);
    });

    return ctx.reply(
      `📂 *Pilih Kategori untuk "${item}":*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons, { columns: 2 })
      }
    );
  } catch (error) {
    console.error('❌ Text handler error:', error);
    return ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.');
  }
});

/**
 * Handle category choice from buttons
 */
bot.action(/^cat:(\d+):(\d+):(.+)$/, async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const catIdx = parseInt(ctx.match[1]);
    const amount = parseInt(ctx.match[2]);
    const item = ctx.match[3];

    const profile = await db.getProfile(telegramId);
    const categories = await db.listCategories(telegramId);
    const category = categories[catIdx];

    if (!category) return ctx.answerCbQuery('⚠️ Kategori tidak ditemukan.');

    // Step 1: Save transaction
    await db.addTransaction(telegramId, item, amount, category);

    // Step 2: Learning — save to cache
    await db.setCachedCategory(telegramId, item, category);
    console.log(`🧠 Learned: "${item}" → ${category}`);

    // Step 3: Update message with receipt
    const monthlyTotal = await db.getMonthlyTotal(telegramId);

    await ctx.editMessageText(
      buildReceipt(profile, item, amount, category, monthlyTotal),
      { parse_mode: 'Markdown' }
    );

    return ctx.answerCbQuery('✅ Transaksi tersimpan!');
  } catch (error) {
    console.error('❌ Action handler error:', error);
    return ctx.answerCbQuery('⚠️ Gagal menyimpan transaksi.');
  }
});

/**
 * Helper: Build receipt message
 */
function buildReceipt(profile, item, amount, category, monthlyTotal) {
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
      if (percentage >= 80) reply += `\n⚠️ _Perhatian! Budget hampir habis._`;
    }
  }

  return reply;
}

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
