require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');

// Import constants - make sure MONGO_URI is exported from constants
const constants = require('../config/constants');
const { 
  token, PORT, SECRET_TOKEN, CHOREO_PUBLIC_URL, MONGO_URI 
} = constants;

// Debug logging for environment variables
console.log('========== CHOREO DEBUG INFO ==========');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('BOT_TOKEN exists:', !!token);
console.log('MONGO_URI exists:', !!MONGO_URI);
console.log('PORT:', PORT);
console.log('SECRET_TOKEN exists:', !!SECRET_TOKEN);
console.log('CHOREO_PUBLIC_URL exists:', !!CHOREO_PUBLIC_URL);
console.log('USE_POLLING:', process.env.USE_POLLING);
console.log('=======================================');

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

// --- Check BOT token (don't exit, just log error) ---
if (!token) {
  console.error('❌ BOT_TOKEN not found in environment variables');
  console.error('Please add BOT_TOKEN in Choreo Console → Configuration');
  // Don't exit - let the app try to recover
}

// --- Express setup ---
const app = express();
app.use(bodyParser.json());

// --- Determine mode ---
const isProduction = process.env.NODE_ENV === 'production';
const usePolling = process.env.USE_POLLING === 'true' || !isProduction;

// --- Initialize Telegraf (only if token exists) ---
let bot = null;
if (token) {
  console.log(`🚀 Starting bot in ${usePolling ? 'POLLING' : 'WEBHOOK'} mode`);
  bot = new Telegraf(token);
  bot.use(session());
} else {
  console.error('⚠️ Bot not initialized - BOT_TOKEN missing');
}

// --- Express webhook route for Choreo ---
app.post('/webhook', (req, res) => {
  if (!bot) {
    console.log('⚠️ Webhook received but bot not initialized');
    return res.sendStatus(200);
  }
  
  if (usePolling) {
    console.log('⚠️ Received webhook request but bot is in polling mode');
    return res.sendStatus(200);
  }

  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== SECRET_TOKEN) return res.sendStatus(401);

  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// --- Health check endpoints (required for Choreo) ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: usePolling ? 'polling' : 'webhook',
    mongoConnected: mongoose.connection.readyState === 1,
    botInitialized: !!bot,
    timestamp: new Date().toISOString()
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

app.get('/ready', (req, res) => {
  // Check if MongoDB is connected
  if (mongoose.connection.readyState === 1) {
    res.status(200).send('Ready');
  } else {
    res.status(503).send('MongoDB not connected');
  }
});

// --- Telegraf Handlers (only if bot exists) ---
if (bot) {
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

  // --- Error handling for bot ---
  bot.catch((err, ctx) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ An error occurred. Please try again later.');
  });
}

// --- Express error handling ---
app.use((err, req, res, next) => {
  console.error('❌ Express error:', err);
  res.status(500).send('Internal Server Error');
});

// --- Process error handlers ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

// --- Set Telegram Webhook ---
async function setTelegramWebhook() {
  if (!bot) {
    console.log('🤖 Bot not initialized, skipping webhook setup');
    return;
  }
  
  if (usePolling) {
    console.log('🤖 Polling mode active, skipping webhook setup');
    return;
  }

  const webhookUrl = `${CHOREO_PUBLIC_URL}/webhook`; // Fixed path
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
  // Only run if MongoDB is connected
  if (mongoose.connection.readyState !== 1) {
    console.log('⏰ MongoDB not connected, skipping payment reminder job');
    return;
  }
  
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
    
    if (!bot) {
      console.log('🤖 Bot not initialized, skipping reminders');
      return;
    }
    
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

// --- MongoDB connection with retry logic ---
const connectWithRetry = async (retryCount = 0) => {
  try {
    if (!MONGO_URI) {
      console.error('❌ MONGO_URI is not defined in environment variables!');
      console.log('Please add MONGO_URI in Choreo Console → Configuration');
      
      // Retry every 30 seconds to check if URI appears
      setTimeout(() => connectWithRetry(retryCount + 1), 30000);
      return false;
    }

    await connectDB(); // This should use MONGO_URI from constants
    console.log('✅ MongoDB Connected Successfully');
    return true;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error (attempt ${retryCount + 1}):`, error.message);
    
    // Exponential backoff: 5s, 10s, 20s, 40s, etc. (max 5 minutes)
    const delay = Math.min(5000 * Math.pow(2, retryCount), 300000);
    console.log(`🔄 Retrying MongoDB connection in ${delay/1000} seconds...`);
    
    setTimeout(() => connectWithRetry(retryCount + 1), delay);
    return false;
  }
};

// --- Start Server ---
async function startServer() {
  try {
    // Start MongoDB connection in background (don't await)
    connectWithRetry();

    // Start the server immediately (even without MongoDB)
    const server = app.listen(PORT, async () => {
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`📡 Mode: ${usePolling ? 'POLLING' : 'WEBHOOK'}`);

      // Start bot if token exists
      if (bot) {
        if (usePolling) {
          try {
            await bot.launch();
            console.log('🤖 Bot is actively polling for updates...');
          } catch (error) {
            console.error('❌ Failed to launch bot in polling mode:', error.message);
          }
        } else {
          await setTelegramWebhook();
        }
      } else {
        console.log('🤖 Bot not started - waiting for BOT_TOKEN');
      }
    });

    // Set up scheduled jobs
    setInterval(checkPendingPayments, 3600000); // every hour
    setTimeout(checkPendingPayments, 10000); // run once after 10 seconds
    console.log('✅ Payment reminder job scheduled to run every hour.');

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    // Don't exit - let the process continue and retry
    setTimeout(startServer, 10000);
  }
}

// --- Graceful shutdown ---
const shutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  // Stop bot
  if (bot) {
    try { 
      await bot.stop(); 
      console.log('✅ Bot stopped gracefully'); 
    } catch (err) { 
      console.error('Error stopping bot:', err.message); 
    }
  }
  
  // Close MongoDB connection
  try { 
    await mongoose.connection.close(); 
    console.log('✅ MongoDB connection closed'); 
  } catch (err) { 
    console.error('Error closing MongoDB:', err.message); 
  }
  
  // Exit after everything is cleaned up
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 1000);
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Export for testing
module.exports = { bot, app, startServer, PORT, setTelegramWebhook };

// Start the server
startServer();