require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const ai = require('./ai');
const { parseExpense, parseAmount } = require('./parser');
const { generateReport, cleanupReport } = require('./report');
const fs = require('fs');

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

    const existing = await db.getProfile(telegramId);
    if (existing) {
      return ctx.reply(
        `👋 Selamat datang kembali, *${firstName}*!\n\n` +
        `📊 Bot Money Tracker-mu sudah aktif.\n` +
        `Kirim pengeluaranmu langsung, misal: _kopi susu 25k_`,
        { parse_mode: 'Markdown' }
      );
    }

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
      `• /deletecategory — Hapus kategori\n` +
      `• /setbudget [Angka] — Atur batas budget\n` +
      `• /deletebudget — Hapus batas budget\n` +
      `• /report — Laporan bulanan (Excel)`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('❌ /start error:', error);
    return ctx.reply('⚠️ Terjadi kesalahan saat registrasi.');
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
    if (error.code === '23505') return ctx.reply('⚠️ Kategori dengan nama tersebut sudah ada.');
    return ctx.reply('⚠️ Gagal menambahkan kategori.');
  }
});

// ─── /listcategory ───────────────────────────────────────────────
bot.command('listcategory', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const categories = await db.listCategories(telegramId);
    const list = categories.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
    return ctx.reply(`📂 *Kategori milik ${profile.first_name}:*\n\n${list}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ /listcategory error:', error);
    return ctx.reply('⚠️ Gagal mengambil daftar kategori.');
  }
});

// ─── /deletecategory ─────────────────────────────────────────────
bot.command('deletecategory', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const args = ctx.message.text.replace('/deletecategory', '').trim();
    if (args) {
      await db.deleteCategory(telegramId, args);
      return ctx.reply(`✅ Kategori *"${args}"* berhasil dihapus.`, { parse_mode: 'Markdown' });
    }

    const categories = await db.listCategories(telegramId);
    if (categories.length === 0) return ctx.reply('📂 Kamu tidak punya kategori untuk dihapus.');

    const buttons = categories.map((cat) => [Markup.button.callback(`🗑 ${cat}`, `del_cat:${cat.substring(0, 30)}`)]);
    return ctx.reply('📂 *Pilih kategori yang ingin dihapus:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
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

// ─── /setbudget ──────────────────────────────────────────────────
bot.command('setbudget', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const args = ctx.message.text.replace('/setbudget', '').trim();
    const amount = parseAmount(args);

    if (!args || !amount || amount <= 0) {
      return ctx.reply('❌ Format: /setbudget [Angka]\nContoh:\n• /setbudget 2000000\n• /setbudget 2jt\n• /setbudget 1.5jt');
    }

    await db.setBudget(telegramId, amount);
    return ctx.reply(`✅ Budget bulanan berhasil diatur ke ${formatRupiah(amount)}, ${profile.first_name}!`);
  } catch (error) {
    console.error('❌ /setbudget error:', error);
    return ctx.reply('⚠️ Gagal mengatur budget.');
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
    if (transactions.length === 0) return ctx.reply(`📊 Belum ada transaksi bulan ini, ${profile.first_name}.`);

    await ctx.reply('⏳ Sedang menyiapkan laporan...');
    const filePath = await generateReport(transactions, profile.first_name);

    const now = new Date();
    await ctx.replyWithDocument(
      { source: fs.createReadStream(filePath), filename: `Laporan_${now.getMonth() + 1}_${now.getFullYear()}.xlsx` },
      {
        caption: `📊 Laporan keuangan ${now.getMonth() + 1}/${now.getFullYear()}\n` +
          `📝 Total transaksi: ${transactions.length}\n` +
          `💰 Total pengeluaran: ${formatRupiah(transactions.reduce((s, t) => s + Number(t.amount), 0))}`,
      }
    );
    cleanupReport(filePath);
  } catch (error) {
    console.error('❌ /report error:', error);
    return ctx.reply('⚠️ Gagal membuat laporan.');
  }
});

// ─── /summary ────────────────────────────────────────────────────
bot.command('summary', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('⚠️ Silakan /start terlebih dahulu.');

    const todayTx = await db.getDailyTransactions(telegramId);
    if (todayTx.length === 0) return ctx.reply(`📋 Belum ada pengeluaran hari ini, ${profile.first_name}.`);

    const byCategory = {};
    let totalToday = 0;
    for (const tx of todayTx) {
      const amt = Number(tx.amount);
      totalToday += amt;
      if (!byCategory[tx.category]) byCategory[tx.category] = { total: 0, items: [] };
      byCategory[tx.category].total += amt;
      byCategory[tx.category].items.push(tx);
    }

    let msg = `📋 *Ringkasan Hari Ini*\n👤 ${profile.first_name}\n\n`;
    for (const [cat, data] of Object.entries(byCategory)) {
      msg += `📂 *${cat}* — ${formatRupiah(data.total)}\n`;
      for (const tx of data.items) {
        msg += `  • ${tx.item} · ${formatRupiah(Number(tx.amount))}\n`;
      }
      msg += `\n`;
    }
    msg += `💰 *Total hari ini:* ${formatRupiah(totalToday)}`;

    const budgetLimit = Number(profile.budget_limit) || 0;
    if (budgetLimit > 0) {
      const monthlyTotal = await db.getMonthlyTotal(telegramId);
      const remaining = budgetLimit - monthlyTotal;
      if (remaining < 0) msg += `\n\n🚨 *OVER BUDGET!*\nLangka: ${formatRupiah(Math.abs(remaining))}`;
      else msg += `\n\n💼 Sisa budget bln ini: ${formatRupiah(remaining)}`;
    }

    return ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('❌ /summary error:', error);
    return ctx.reply('⚠️ Gagal mengambil ringkasan.');
  }
});

// ─── /undo ───────────────────────────────────────────────────────
bot.command('undo', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const deleted = await db.deleteLastTransaction(telegramId);
    if (!deleted) return ctx.reply('📭 Tidak ada transaksi yang bisa dihapus.');

    await db.unlearnKeyword(telegramId, deleted.item);
    return ctx.reply(
      `🗑 *Transaksi Dihapus & "Unlearned"!*\n\n` +
      `📝 ${deleted.item}\n` +
      `💰 ${formatRupiah(deleted.amount)}\n` +
      `📂 ${deleted.category}\n\n` +
      `💡 _Sekarang bot sudah lupa kategori item ini._`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('❌ /undo error:', error);
    return ctx.reply('⚠️ Gagal menghapus transaksi.');
  }
});

// ─── /help ───────────────────────────────────────────────────────
bot.help((ctx) => {
  return ctx.reply(
    `📖 *Panduan Money Tracker*\n\n` +
    `💬 *Mencatat Pengeluaran:*\n` +
    `Kirim saja: _kopi 25k_\n\n` +
    `🛠 *Perintah:*\n` +
    `• /summary — Ringkasan hari ini\n` +
    `• /report — Laporan Excel\n` +
    `• /undo — Hapus transaksi terakhir\n` +
    `• /listcategory — Daftar kategori\n` +
    `• /deletecategory — Hapus kategori\n` +
    `• /setbudget — Atur target budget\n` +
    `• /deletebudget — Hapus target budget`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Text Handler (Main Logic) ──────────────────────────────────
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;
    const telegramId = ctx.from.id;
    const profile = await db.getProfile(telegramId);
    if (!profile) return ctx.reply('👋 Hai! Silakan /start dulu ya.');

    const expense = parseExpense(text);
    if (!expense) return; // Silent ignore or show error

    // 1. Check Cache (Keyword Mapping)
    let category = await db.getCachedCategory(telegramId, expense.item);
    if (category) {
      const tx = await db.addTransaction(telegramId, expense.item, expense.amount, category);
      return ctx.reply(await buildReceipt(tx, profile));
    }

    // 2. Check Groq AI
    const availableCategories = await db.listCategories(telegramId);
    category = await ai.classifyCategory(expense.item, availableCategories);

    if (category && availableCategories.includes(category)) {
      await db.setCachedCategory(telegramId, expense.item, category);
      const tx = await db.addTransaction(telegramId, expense.item, expense.amount, category);
      return ctx.reply(await buildReceipt(tx, profile));
    }

    // 3. Fallback: Manual Buttons
    const buttons = availableCategories.map((cat) => [
      Markup.button.callback(cat, `cat:${cat}:${expense.amount}:${expense.item.substring(0, 30)}`)
    ]);

    return ctx.reply(
      `🧐 *Pilih Kategori untuk:* ${expense.item}\n` +
      `💰 *Jumlah:* ${formatRupiah(expense.amount)}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
  } catch (error) {
    console.error('❌ Text handler error:', error);
    ctx.reply('⚠️ Terjadi kesalahan.');
  }
});

// ─── Selection Action ───────────────────────────────────────────
bot.action(/^cat:(.+):(\d+):(.+)$/, async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const category = ctx.match[1];
    const amount = Number(ctx.match[2]);
    const item = ctx.match[3];

    const profile = await db.getProfile(telegramId);
    await db.setCachedCategory(telegramId, item, category);
    const tx = await db.addTransaction(telegramId, item, amount, category);

    await ctx.editMessageText(await buildReceipt(tx, profile), { parse_mode: 'Markdown' });
    return ctx.answerCbQuery(`Kategori: ${category}`);
  } catch (error) {
    console.error('❌ Selection action error:', error);
  }
});

// ─── Receipt Builder ───────────────────────────────────────────
async function buildReceipt(tx, profile) {
  let msg = `✅ *Tercatat!*\n\n` +
    `📝 *Item:* ${tx.item}\n` +
    `💰 *Jumlah:* ${formatRupiah(Number(tx.amount))}\n` +
    `📂 *Kategori:* ${tx.category}`;

  const budgetLimit = Number(profile.budget_limit) || 0;
  if (budgetLimit > 0) {
    const monthlyTotal = await db.getMonthlyTotal(profile.telegram_id);
    const remaining = budgetLimit - monthlyTotal;
    msg += `\n\n💼 *Sisa budget bln ini:* ${formatRupiah(remaining)}`;
    if (remaining < 0) msg += `\n🚨 *OVER BUDGET!*`;
  }
  return msg;
}

module.exports = { bot };
