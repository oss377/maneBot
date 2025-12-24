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

// IMPORTANT: Increase payload limit for Telegram updates
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Add request logging middleware for debugging
app.use((req, res, next) => {
  if (req.path === webhookPath) {
    console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log(`🔑 Secret Token Header: ${req.headers['x-telegram-bot-api-secret-token'] || 'Not provided'}`);
    console.log(`📦 Body size: ${JSON.stringify(req.body).length} bytes`);
  }
  next();
});

// Verify Telegram requests (only for webhook mode)
app.post(webhookPath, async (req, res) => {
  console.log('📩 Webhook request received');
  
  if (usePolling) {
    console.log('⚠️  Running in polling mode, ignoring webhook request');
    return res.sendStatus(200);
  }
  
  // Check secret token
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!secret || secret !== SECRET_TOKEN) {
    console.log('❌ Invalid or missing secret token');
    console.log(`Expected: ${SECRET_TOKEN?.substring(0, 5)}..., Received: ${secret?.substring(0, 5)}...`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('✅ Secret token verified');
  
  // Validate request body
  if (!req.body || !req.body.update_id) {
    console.log('❌ Invalid Telegram update - missing update_id');
    return res.status(400).json({ error: 'Invalid Telegram update' });
  }
  
  console.log(`🔄 Processing update ID: ${req.body.update_id}`);
  
  try {
    // IMPORTANT: Use await to ensure the update is fully processed
    await bot.handleUpdate(req.body);
    console.log(`✅ Successfully processed update ID: ${req.body.update_id}`);
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error processing update:', error);
    console.error('Update body:', JSON.stringify(req.body, null, 2));
    
    // Still return 200 to prevent Telegram from retrying too much
    // But log the error for debugging
    res.sendStatus(200);
  }
});

// Basic routes for health checks
app.get('/', (req, res) => {
  res.send(`
    <h1>Telegram Bot</h1>
    <p>Mode: ${usePolling ? 'POLLING' : 'WEBHOOK'}</p>
    <p>Status: ✅ Running</p>
    <p>Webhook URL: https://${process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`}${webhookPath}</p>
    <p>Timestamp: ${new Date().toISOString()}</p>
  `);
});

// Health check endpoint (Railway needs this)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: usePolling ? 'polling' : 'webhook',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    webhook_url: `https://${process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`}${webhookPath}`
  });
});

// --- TELEGRAF BOT HANDLERS ---

// /start command
bot.start(async (ctx) => {
  console.log(`🤖 /start command from ${ctx.from.id}`);
  await handleStart(ctx);
});

// Handle callback queries
bot.on('callback_query', async (ctx) => {
  console.log(`🔄 Callback query from ${ctx.from.id}: ${ctx.callbackQuery.data}`);
  await handleCallbackQuery(ctx);
});

// Handle messages
bot.on('message', async (ctx) => {
  console.log(`💬 Message from ${ctx.from.id}: ${ctx.message.text?.substring(0, 50) || 'Photo/Media'}`);
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

// Error handling middleware for Telegraf
bot.catch((err, ctx) => {
  console.error(`❌ Telegraf Error for ${ctx.updateType}:`, err);
  console.error(`Update ID: ${ctx.update.update_id}`);
  
  try {
    ctx.reply('❌ An error occurred. Please try again later.');
  } catch (e) {
    console.error('Could not send error message to user:', e);
  }
});

// Handle webhook errors
bot.on('webhook_error', (err) => {
  console.error('🔌 Webhook error:', err);
});

// Handle polling errors
bot.on('polling_error', (err) => {
  console.error('📡 Polling error:', err);
});

// --- WEBHOOK SETUP FUNCTION ---
async function setTelegramWebhook() {
  // Don't set webhook if we're using polling
  if (usePolling) {
    console.log('🤖 Skipping webhook setup (polling mode active)');
    return;
  }
  
  // Get the correct URL for Railway or local
  let webhookUrl;
  if (process.env.RAILWAY_STATIC_URL) {
    webhookUrl = `https://${process.env.RAILWAY_STATIC_URL}${webhookPath}`;
  } else {
    webhookUrl = `https://localhost:${PORT}${webhookPath}`;
  }
  
  console.log(`🌐 Setting webhook to ${webhookUrl}`);
  
  try {
    // Delete any existing webhook first (clean start)
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    console.log('🧹 Cleared existing webhook');
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Set new webhook with all required parameters
    const result = await bot.telegram.setWebhook(webhookUrl, {
      secret_token: SECRET_TOKEN,
      max_connections: 100,
      allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member']
    });
    
    console.log('✅ Webhook set successfully');
    console.log('📦 Result:', result);
    
    // Get webhook info to verify
    const webhookInfo = await bot.telegram.getWebhookInfo();
    console.log('📊 Webhook info:', {
      url: webhookInfo.url,
      has_custom_certificate: webhookInfo.has_custom_certificate,
      pending_update_count: webhookInfo.pending_update_count,
      last_error_date: webhookInfo.last_error_date ? new Date(webhookInfo.last_error_date * 1000).toISOString() : null,
      last_error_message: webhookInfo.last_error_message,
      max_connections: webhookInfo.max_connections
    });
    
    // If there are pending updates, log them
    if (webhookInfo.pending_update_count > 0) {
      console.log(`📬 There are ${webhookInfo.pending_update_count} pending updates from Telegram`);
    }
    
  } catch (error) {
    console.error('❌ Failed to set webhook:', error.message);
    console.error('Full error:', error);
    
    // Try one more time with a simpler configuration
    try {
      console.log('🔄 Retrying webhook setup with simpler config...');
      await bot.telegram.setWebhook(webhookUrl, { secret_token: SECRET_TOKEN });
      console.log('✅ Webhook set on retry');
    } catch (retryError) {
      console.error('❌ Failed on retry too:', retryError.message);
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
          // Check if it's a "chat not found" error
          if (error.description && error.description.includes('chat not found')) {
            console.log(`🗑️  User ${user.chatId} might have blocked the bot or deleted their account`);
          }
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
    const server = app.listen(PORT, '0.0.0.0', async () => {
      const address = server.address();
      console.log(`🌐 Server running on ${address.address}:${address.port}`);
      console.log(`📡 Mode: ${usePolling ? 'POLLING' : 'WEBHOOK'}`);
      
      if (usePolling) {
        // Start polling with Telegraf
        await bot.launch({
          dropPendingUpdates: true,
          allowedUpdates: ['message', 'callback_query']
        });
        console.log('🤖 Bot is actively polling for updates...');
        console.log('💡 Send /start to your bot to test locally');
      } else {
        const webhookFullUrl = `https://${process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`}${webhookPath}`;
        console.log(`🔗 Webhook endpoint: ${webhookFullUrl}`);
        
        // Set webhook for production
        if (isProduction || isRailway) {
          await setTelegramWebhook();
        } else {
          console.log('\n⚠️  Local Webhook Setup:');
          console.log('1. Use ngrok: ngrok http ' + PORT);
          console.log('2. Set webhook manually:');
          console.log(`https://api.telegram.org/bot${token}/setWebhook?url=YOUR_NGROK_URL${webhookPath}&secret_token=${SECRET_TOKEN}&drop_pending_updates=true`);
        }
        
        // Test the webhook endpoint internally
        console.log('🧪 Testing webhook endpoint internally...');
        try {
          const testResponse = await fetch(`http://localhost:${PORT}/health`);
          const testData = await testResponse.json();
          console.log('✅ Internal health check:', testData.status);
        } catch (err) {
          console.log('⚠️  Could not perform internal health check (this might be normal)');
        }
      }
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use!`);
        process.exit(1);
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
    // Delete webhook when shutting down (clean exit)
    if (!usePolling) {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('🗑️  Webhook deleted');
    }
    
    // Stop the bot
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