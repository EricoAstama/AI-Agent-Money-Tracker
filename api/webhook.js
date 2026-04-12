const { bot } = require('../src/bot');

/**
 * Vercel Serverless Function entry point for Telegram Webhook.
 */
module.exports = async (req, res) => {
  console.log(`📩 Incoming request: ${req.method} ${req.url}`);
  
  if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is missing in Environment Variables!');
    return res.status(500).send('Configuration Error: BOT_TOKEN is missing');
  }

  try {
    if (req.method === 'POST') {
      console.log('📦 Handling Telegram Update...');
      await bot.handleUpdate(req.body, res);
      // Ensure we send a response if telegraf didn't
      if (!res.writableEnded) {
        res.status(200).send('OK');
      }
    } else {
      res.status(200).send(`Money Tracker Bot is alive! (Mode: Webhook)`);
    }
  } catch (error) {
    console.error('❌ Webhook error:', error);
    if (!res.writableEnded) {
      res.status(500).send('Internal Server Error');
    }
  }
};
