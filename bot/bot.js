const { Telegraf, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
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

// --- DETERMINE RUNNING MODE ---
const isProduction = process.env.NODE_ENV === 'production';
const isRailway = !!process.env.RAILWAY_STATIC_URL;
const usePolling = process.env.USE_POLLING === 'true' || !isProduction || !isRailway;

// Initialize Telegraf bot
console.log(`🚀 Starting in ${usePolling ? 'POLLING' : 'WEBHOOK'} mode`);
const bot = new Telegraf(token);

// Session middleware
bot.use(session());

// Handle unhandled rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// Webhook path
const webhookPath = '/webhook';

// Verify Telegram requests (only for webhook mode)
app.post(webhookPath, (req, res) => {
  if (usePolling) {
    console.log('⚠️  Received webhook request but running in polling mode');
    return res.sendStatus(200);
  }
  
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== SECRET_TOKEN) return res.sendStatus(401);
  
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send(`Telegram bot running in ${usePolling ? 'POLLING' : 'WEBHOOK'} mode`);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: usePolling ? 'polling' : 'webhook',
    timestamp: new Date().toISOString()
  });
});

// --- TELEGRAF BOT HANDLERS ---

// /start command
bot.start(async (ctx) => {
  await handleStart(ctx);
});

// Handle callback queries
bot.on('callback_query', async (ctx) => {
  await handleCallbackQuery(ctx);
});

// Handle messages
bot.on('message', async (ctx) => {
  await handleMessage(ctx);
});

// Handle text commands
bot.command('help', async (ctx) => {
  const lang = ctx.session?.lang || 'en';
  const helpText = `
${langText[lang].helpTitle || 'Help Center'}

${langText[lang].helpText || 'Available commands:\n/start - Start the bot\n/help - Show this help message'}

${langText[lang].adminCommands || ''}`;
  
  ctx.reply(helpText);
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`❌ Error for ${ctx.updateType}:`, err);
  ctx.reply('❌ An error occurred. Please try again later.');
});

// CORRECTED: Handle polling/webhook errors in Telegraf
// Telegraf doesn't have bot.telegram.on, use bot.on instead
bot.on('webhook_error', (err) => {
  console.error('🔌 Webhook error:', err);
});

// The polling_error event is handled automatically by Telegraf
// But we can listen to connection issues
process.on('SIGINT', () => bot.stop('SIGINT'));
process.on('SIGTERM', () => bot.stop('SIGTERM'));

// --- WEBHOOK SETUP FUNCTION ---
async function setTelegramWebhook() {
  // Don't set webhook if we're using polling
  if (usePolling) {
    console.log('🤖 Skipping webhook setup (polling mode active)');
    return;
  }
  
  const webhookUrl = `https://${process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`}${webhookPath}`;
  
  console.log(`🌐 Setting webhook to ${webhookUrl}`);
  
  try {
    // Telegraf uses bot.telegram.setWebhook
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: SECRET_TOKEN,
      max_connections: 40
    });
    console.log('✅ Webhook set successfully');
    
    // Get webhook info to verify
    const webhookInfo = await bot.telegram.getWebhookInfo();
    console.log('📊 Webhook info:', {
      url: webhookInfo.url,
      has_custom_certificate: webhookInfo.has_custom_certificate,
      pending_update_count: webhookInfo.pending_update_count,
      last_error_date: webhookInfo.last_error_date,
      last_error_message: webhookInfo.last_error_message
    });
  } catch (error) {
    console.error('❌ Failed to set webhook:', error.message);
  }
}

// --- SCHEDULED REMINDER JOB ---
const checkPendingPayments = async () => {
  console.log('⏰ Running scheduled job: Checking for pending payments...');
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // Find users with pending payments that are older than 24 hours
    const usersToRemind = await User.find({
      $or: [
        { payment: null, approved: false, payment_pending_since: { $lt: twentyFourHoursAgo } },
        { 'other_registrations.payment': null, 'other_registrations.approved': false, 'other_registrations.payment_pending_since': { $lt: twentyFourHoursAgo } }
      ]
    });

    console.log(`🔍 Found ${usersToRemind.length} users to remind`);

    for (const user of usersToRemind) {
      const lang = user.lang || 'en';

      // Check for self-pending payment
      if (user.payment === null && !user.approved && user.payment_pending_since && user.payment_pending_since < twentyFourHoursAgo) {
        console.log(`📨 Sending reminder to user ${user.chatId} for their own payment.`);
        try {
          await bot.telegram.sendMessage(user.chatId, `🔔 *Reminder*\n\n${langText[lang].finishPaymentPrompt}`, { 
            parse_mode: 'Markdown' 
          });
          // Reset the timestamp
          user.payment_pending_since = new Date();
          user.last_reminder_sent_at = new Date();
          await user.save();
        } catch (error) {
          console.error(`❌ Failed to send reminder to user ${user.chatId}:`, error.message);
        }
      }

      // Check for other pending payments
      let changesMade = false;
      for (const reg of user.other_registrations) {
        if (reg.payment === null && !reg.approved && reg.payment_pending_since && reg.payment_pending_since < twentyFourHoursAgo) {
          console.log(`📨 Sending reminder to user ${user.chatId} for ${reg.name}'s payment.`);
          try {
            const reminderMsg = `🔔 *Reminder*\n\nYou still need to upload the payment screenshot for *${reg.name}* to complete their registration.`;
            await bot.telegram.sendMessage(user.chatId, reminderMsg, { parse_mode: 'Markdown' });
            // Reset the timestamp
            reg.payment_pending_since = new Date();
            reg.last_reminder_sent_at = new Date();
            changesMade = true;
          } catch (error) {
            console.error(`❌ Failed to send reminder for ${reg.name}:`, error.message);
          }
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

// --- START SERVER FUNCTION ---
async function startServer() {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ MongoDB Connected Successfully');
    
    // Start the server
    app.listen(PORT, async () => {
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`📡 Mode: ${usePolling ? 'POLLING' : 'WEBHOOK'}`);
      
      if (usePolling) {
        // Start polling with Telegraf
        await bot.launch();
        console.log('🤖 Bot is actively polling for updates...');
        console.log('💡 Send /start to your bot to test locally');
      } else {
        console.log(`🔗 Webhook endpoint: https://${process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`}${webhookPath}`);
        
        // Set webhook for production
        if (isProduction || isRailway) {
          await setTelegramWebhook();
        } else {
          console.log('\n⚠️  Local Webhook Setup:');
          console.log('1. Use ngrok: ngrok http ' + PORT);
          console.log('2. Set webhook manually:');
          console.log(`https://api.telegram.org/bot${token}/setWebhook?url=YOUR_NGROK_URL${webhookPath}&secret_token=${SECRET_TOKEN}`);
        }
      }
    });

    // Run the reminder job every hour
    setInterval(checkPendingPayments, 3600000);
    console.log('✅ Payment reminder job scheduled to run every hour.');
    
    // Run immediately on startup (optional)
    setTimeout(checkPendingPayments, 5000);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  try {
    // Telegraf handles its own graceful shutdown
    await bot.stop();
    console.log('✅ Bot stopped gracefully');
  } catch (error) {
    console.error('❌ Error stopping bot:', error.message);
  }

  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (err) {
    console.error('❌ Error closing MongoDB connection:', err.message);
  }
  
  console.log('👋 Goodbye!');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = {
  bot,
  app,
  startServer,
  PORT,
  setTelegramWebhook
};