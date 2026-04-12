require('dotenv').config();
const express = require('express');
const { bot } = require('./src/bot');

// ─── Express server (Health Check for other platforms) ───────────
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'polling',
    bot: 'Money Tracker Bot',
    uptime: process.uptime(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ─── Launch (Local Polling Mode) ─────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Start Express (optional for local, but good for parity)
    app.listen(PORT, () => {
      console.log(`🌐 Local server running on port ${PORT}`);
    });

    // Start bot in Polling mode
    console.log('🤖 Starting bot in POLLING mode (Local)...');
    await bot.launch();
    console.log('✅ Bot is running via Polling!');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

start();
