require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const { 
  token, PORT, SECRET_TOKEN, CHOREO_PUBLIC_URL 
} = require('../config/constants');
const { connectDB } = require('../db');
const User = require('../models/User');
const { handleStart, handleMessage } = require('./handlers/userHandlers');
const { handleCallbackQuery } = require('./handlers/callbackHandlers');
const {
  approveUser, declineUser, approveOtherUser, declineOtherUser,
  handleDeleteUser, handleExportUsers, handlePendingPayments, handleStats,
  handleIncomplete, handleFeelings, handleRemindFeelings, handleBroadcastMessage
} = require('./handlers/adminHandlers');
const langText = require('../languages/translations');

// --- Check BOT token ---
if (!token) {
  console.error('❌ BOT_TOKEN not found in .env');
  process.exit(1);
}

// --- Express setup ---
const app = express();
app.use(bodyParser.json());

// --- Determine mode ---
const isProduction = process.env.NODE_ENV === 'production';
const usePolling = process.env.USE_POLLING === 'true' || !isProduction;

// --- Initialize Telegraf ---
console.log(`🚀 Starting bot in ${usePolling ? 'POLLING' : 'WEBHOOK'} mode`);
const bot = new Telegraf(token);
bot.use(session());

// --- Express webhook route for Choreo ---
app.post('/webhook', (req, res) => {
  if (usePolling) {
    console.log('⚠️ Received webhook request but bot is in polling mode');
    return res.sendStatus(200);
  }

  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== SECRET_TOKEN) return res.sendStatus(401);

  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: usePolling ? 'polling' : 'webhook',
    timestamp: new Date().toISOString()
  });
});

// --- Telegraf Handlers ---
bot.start(async (ctx) => await handleStart(ctx));
bot.on('message', async (ctx) => await handleMessage(ctx));
bot.on('callback_query', async (ctx) => await handleCallbackQuery(ctx));

bot.command('help', async (ctx) => {
  const lang = ctx.session?.lang || 'en';
  const helpText = `
${langText[lang].helpTitle || 'Help Center'}

${langText[lang].helpText || 'Available commands:\n/start - Start the bot\n/help - Show this help message'}

${langText[lang].adminCommands || ''}`;
  ctx.reply(helpText);
});

// --- Error handling ---
bot.catch((err, ctx) => {
  console.error(`❌ Error for ${ctx.updateType}:`, err);
  ctx.reply('❌ An error occurred. Please try again later.');
});

app.use((err, req, res, next) => {
  console.error('❌ Express error:', err);
  res.status(500).send('Internal Server Error');
});

process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));
process.on('SIGINT', () => bot.stop('SIGINT'));
process.on('SIGTERM', () => bot.stop('SIGTERM'));

// --- Set Telegram Webhook ---
async function setTelegramWebhook() {
  if (usePolling) {
    console.log('🤖 Polling mode active, skipping webhook setup');
    return;
  }

  const webhookUrl = `${CHOREO_PUBLIC_URL}/newbot/newbot/v1.0/webhook`;
  console.log(`🌐 Setting webhook to ${webhookUrl}`);

  try {
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: SECRET_TOKEN,
      max_connections: 40
    });
    console.log('✅ Webhook set successfully');

    const info = await bot.telegram.getWebhookInfo();
    console.log('🔎 Webhook info:', info);
  } catch (error) {
    console.error('❌ Failed to set webhook:', error.message);
  }
}

// --- Scheduled Payment Reminder Job ---
const checkPendingPayments = async () => {
  console.log('⏰ Running scheduled job: Checking for pending payments...');
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const usersToRemind = await User.find({
      $or: [
        { payment: null, approved: false, payment_pending_since: { $lt: twentyFourHoursAgo } },
        { 'other_registrations.payment': null, 'other_registrations.approved': false, 'other_registrations.payment_pending_since': { $lt: twentyFourHoursAgo } }
      ]
    });

    console.log(`🔍 Found ${usersToRemind.length} users to remind`);
    for (const user of usersToRemind) {
      const lang = user.lang || 'en';

      // Self pending payment
      if (user.payment === null && !user.approved && user.payment_pending_since && user.payment_pending_since < twentyFourHoursAgo) {
        try {
          await bot.telegram.sendMessage(user.chatId, `🔔 *Reminder*\n\n${langText[lang].finishPaymentPrompt}`, { parse_mode: 'Markdown' });
          user.payment_pending_since = new Date();
          user.last_reminder_sent_at = new Date();
          await user.save();
        } catch (error) {
          console.error(`❌ Failed to send reminder to user ${user.chatId}:`, error.message);
        }
      }

      // Other registrations
      let changesMade = false;
      for (const reg of user.other_registrations) {
        if (reg.payment === null && !reg.approved && reg.payment_pending_since && reg.payment_pending_since < twentyFourHoursAgo) {
          try {
            const reminderMsg = `🔔 *Reminder*\n\nYou still need to upload the payment screenshot for *${reg.name}* to complete their registration.`;
            await bot.telegram.sendMessage(user.chatId, reminderMsg, { parse_mode: 'Markdown' });
            reg.payment_pending_since = new Date();
            reg.last_reminder_sent_at = new Date();
            changesMade = true;
          } catch (error) {
            console.error(`❌ Failed to send reminder for ${reg.name}:`, error.message);
          }
        }
      }
      if (changesMade) await user.save();
    }
  } catch (error) {
    console.error('❌ Error in checkPendingPayments job:', error);
  }
};

// --- Start Server ---
async function startServer() {
  try {
    await connectDB();
    console.log('✅ MongoDB Connected Successfully');

    app.listen(PORT, async () => {
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`📡 Mode: ${usePolling ? 'POLLING' : 'WEBHOOK'}`);

      if (usePolling) {
        await bot.launch();
        console.log('🤖 Bot is actively polling for updates...');
      } else {
        await setTelegramWebhook();
      }
    });

    setInterval(checkPendingPayments, 3600000); // every hour
    setTimeout(checkPendingPayments, 5000); // run once on startup
    console.log('✅ Payment reminder job scheduled to run every hour.');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// --- Graceful shutdown ---
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  try { await bot.stop(); console.log('✅ Bot stopped gracefully'); } catch (err) { console.error(err.message); }
  try { await mongoose.connection.close(); console.log('✅ MongoDB connection closed'); } catch (err) { console.error(err.message); }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { bot, app, startServer, PORT, setTelegramWebhook };