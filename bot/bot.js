const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const { token, PORT, SECRET_TOKEN, ADMIN_CHAT_ID, GROUP_LINK } = require('../config/constants');
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
const { generateMainMenuKeyboard } = require('./utils/keyboards');

if (!token) {
  console.error('BOT_TOKEN not found in .env');
  process.exit(1);
}

// Express app
const app = express();
app.use(bodyParser.json());

// Telegram bot
const bot = new TelegramBot(token);

// Webhook path
const webhookPath = '/webhook';

// Verify Telegram requests
app.post(webhookPath, (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== SECRET_TOKEN) return res.sendStatus(401);
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Telegram bot running. Webhook at /webhook');
});

// Setup bot event handlers
function setupBotHandlers() {
  // /start command
  bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    await handleStart(bot, msg, match);
  });

  // Handle callback queries
  bot.on('callback_query', async (callbackQuery) => {
    await handleCallbackQuery(bot, callbackQuery);
  });

  // Handle messages
  bot.on('message', async (msg) => { // This is the main message handler
    await handleMessage(bot, msg);
  });

}

// --- Scheduled Reminder Job ---
const checkPendingPayments = async () => {
  console.log('Running scheduled job: Checking for pending payments...');
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // Find users with pending payments that are older than 24 hours
    const usersToRemind = await User.find({
      $or: [
        // For their own registration
        { payment: null, approved: false, payment_pending_since: { $lt: twentyFourHoursAgo } },
        // For a registration they made for someone else
        { 'other_registrations.payment': null, 'other_registrations.approved': false, 'other_registrations.payment_pending_since': { $lt: twentyFourHoursAgo } }
      ]
    });

    for (const user of usersToRemind) {
      const lang = user.lang || 'en';

      // Check for self-pending payment
      if (user.payment === null && !user.approved && user.payment_pending_since && user.payment_pending_since < twentyFourHoursAgo) {
        console.log(`Sending reminder to user ${user.chatId} for their own payment.`);
        await bot.sendMessage(user.chatId, `🔔 *Reminder*\n\n${langText[lang].finishPaymentPrompt}`, { parse_mode: 'Markdown' });
        // Reset the timestamp to avoid sending another reminder for the next 24 hours
        user.payment_pending_since = new Date();
        user.last_reminder_sent_at = new Date(); // Track reminder
        await user.save();
      }

      // Check for other pending payments
      let changesMade = false;
      for (const reg of user.other_registrations) {
        if (reg.payment === null && !reg.approved && reg.payment_pending_since && reg.payment_pending_since < twentyFourHoursAgo) {
          console.log(`Sending reminder to user ${user.chatId} for ${reg.name}'s payment.`);
          const reminderMsg = `🔔 *Reminder*\n\nYou still need to upload the payment screenshot for *${reg.name}* to complete their registration.`;
          await bot.sendMessage(user.chatId, reminderMsg, { parse_mode: 'Markdown' });
          // Reset the timestamp
          reg.payment_pending_since = new Date();
          reg.last_reminder_sent_at = new Date(); // Track reminder
          changesMade = true;
        }
      }
      if (changesMade) {
        await user.save();
      }
    }
  } catch (error) {
    console.error('❌ Error in checkPendingPayments job:', error);
  }
};

// Start Express server
async function startServer() {
  await connectDB(); // Connect to the database
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}${webhookPath}`);
  console.log(
    `Set the webhook:\nhttps://api.telegram.org/bot${token}/setWebhook?url=https://YOUR_NGROK_URL${webhookPath}&secret_token=${SECRET_TOKEN}`
  );

  // Setup bot handlers
  setupBotHandlers();

  // Run the reminder job every hour (3600000 milliseconds)
  setInterval(checkPendingPayments, 3600000);
  console.log('✅ Payment reminder job scheduled to run every hour.');
}

function setTelegramWebhook(bot) {
  // Set the webhook programmatically if the Railway URL is provided
  const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL;
  if (RAILWAY_STATIC_URL) {
    const webhookUrl = `${RAILWAY_STATIC_URL}${webhookPath}`;
    console.log(`Setting webhook to ${webhookUrl}`);
    bot.setWebhook(webhookUrl, { secret_token: SECRET_TOKEN }).then(result => {
      console.log('Webhook set successfully:', result);
    }).catch(err => console.error('Failed to set webhook:', err.message));
  }
}

module.exports = {
  bot,
  app,
  startServer,
  PORT,
  setTelegramWebhook
};