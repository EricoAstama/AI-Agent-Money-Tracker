const { bot } = require('../src/bot');

/**
 * Vercel Serverless Function entry point for Telegram Webhook.
 */
module.exports = async (req, res) => {
  try {
    // Only handle POST requests from Telegram
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('Money Tracker Bot is alive!');
    }
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};
