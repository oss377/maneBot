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

// --- DETERMINE RUNNING MODE ---
const isProduction = process.env.NODE_ENV === 'production';
const isRailway = !!process.env.RAILWAY_STATIC_URL;
const usePolling = process.env.USE_POLLING === 'true' || !isProduction || !isRailway;

// Telegram bot - dynamic mode based on environment
console.log(`🚀 Starting in ${usePolling ? 'POLLING' : 'WEBHOOK'} mode`);
const bot = new TelegramBot(token, { 
  polling: usePolling,  // true for local, false for production
  request: {
    // Optional: Proxy for local development if needed
    agent: process.env.HTTPS_PROXY ? 
           new (require('https-proxy-agent'))(process.env.HTTPS_PROXY) : 
           undefined
  }
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
  bot.processUpdate(req.body);
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
  bot.on('message', async (msg) => {
    await handleMessage(bot, msg);
  });
}

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
    await bot.setWebHook(webhookUrl, {
      secret_token: SECRET_TOKEN,
      max_connections: 40
    });
    console.log('✅ Webhook set successfully');
    
    // Get webhook info to verify
    const webhookInfo = await bot.getWebHookInfo();
    console.log('📊 Webhook info:', {
      url: webhookInfo.url,
      has_custom_certificate: webhookInfo.has_custom_certificate,
      pending_update_count: webhookInfo.pending_update_count,
      last_error_date: webhookInfo.last_error_date,
      last_error_message: webhookInfo.last_error_message
    });
  } catch (error) {
    console.error('❌ Failed to set webhook:', error.message);
    
    // Fallback to polling if webhook fails in production
    if (isProduction || isRailway) {
      console.log('🔄 Critical: Webhook failed in production. Trying polling as fallback...');
      // Note: node-telegram-bot-api doesn't support switching from webhook to polling easily
      // This is just for logging - you might need to restart with polling enabled
    }
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
        // For their own registration
        { payment: null, approved: false, payment_pending_since: { $lt: twentyFourHoursAgo } },
        // For a registration they made for someone else
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
          await bot.sendMessage(user.chatId, `🔔 *Reminder*\n\n${langText[lang].finishPaymentPrompt}`, { 
            parse_mode: 'Markdown' 
          });
          // Reset the timestamp to avoid sending another reminder for the next 24 hours
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
            await bot.sendMessage(user.chatId, reminderMsg, { parse_mode: 'Markdown' });
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
    
    // Setup bot handlers
    setupBotHandlers();
    console.log('✅ Bot handlers registered');
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`📡 Mode: ${usePolling ? 'POLLING' : 'WEBHOOK'}`);
      
      if (usePolling) {
        console.log('🤖 Bot is actively polling for updates...');
        console.log('💡 Send /start to your bot to test locally');
      } else {
        console.log(`🔗 Webhook endpoint: https://${process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`}${webhookPath}`);
        
        // Set webhook for production
        if (isProduction || isRailway) {
          setTelegramWebhook();
        } else {
          console.log('\n⚠️  Local Webhook Setup:');
          console.log('1. Use ngrok: ngrok http ' + PORT);
          console.log('2. Set webhook manually:');
          console.log(`https://api.telegram.org/bot${token}/setWebhook?url=YOUR_NGROK_URL${webhookPath}&secret_token=${SECRET_TOKEN}`);
        }
      }
    });

    // Run the reminder job every hour (3600000 milliseconds)
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
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
  
  if (usePolling) {
    console.log('🛑 Stopping bot polling...');
    bot.stopPolling();
  } else {
    console.log('🛑 Deleting webhook...');
    try {
      await bot.deleteWebHook();
      console.log('✅ Webhook deleted');
    } catch (error) {
      console.error('❌ Failed to delete webhook:', error.message);
    }
  }
  
  console.log('👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM. Shutting down...');
  process.exit(0);
});

module.exports = {
  bot,
  app,
  startServer,
  PORT,
  setTelegramWebhook
};