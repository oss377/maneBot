const User = require('../../models/User');
const langText = require('../../languages/translations');
const { generateMainMenuKeyboard } = require('./keyboards');
const userTimeouts = {}; // Keep this here as it's specific to timeouts

// Helper function to ensure message text is never empty
function getSafeMessage(text, defaultText = 'Are you stuck? You can go back to the main menu by clicking the button below.') {
  if (!text || text.trim() === '') {
    console.warn('Empty message text detected, using default');
    return defaultText;
  }
  return text;
}

function setUserTimeout(botInstance, chatId, lang) {
  // Clear any existing timeout for this user to avoid multiple messages
  if (userTimeouts[chatId]) {
    clearTimeout(userTimeouts[chatId]);
    delete userTimeouts[chatId];
  }

  // Set a new timeout (30 seconds = 30000 ms)
  userTimeouts[chatId] = setTimeout(async () => {
    try {
      const user = await User.findOne({ chatId });
      
      // Only send if the user is still in an active step
      if (user && user.step) {
        console.log(`User ${chatId} has been idle. Sending a restart prompt.`);
        
        // Use safe message text
        const messageText = getSafeMessage(
          'Are you stuck? You can go back to the main menu by clicking the button below.',
          'You have been idle. Click /start to restart.'
        );
        
        const startKeyboard = {
          reply_markup: {
            keyboard: [[{ text: '/start' }]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        };
        
        // Send the message with safety check
        await botInstance.sendMessage(chatId, messageText, startKeyboard);
      }
    } catch (error) {
      // Don't crash on errors - user might have blocked the bot
      if (error.response?.error_code === 403) {
        console.log(`User ${chatId} has blocked the bot`);
      } else if (error.response?.description?.includes('message text is empty')) {
        console.error(`Empty text error for user ${chatId}:`, error.message);
        // Send a default message if the first one failed
        try {
          await botInstance.sendMessage(chatId, 'Please click /start to continue.', {
            reply_markup: {
              keyboard: [[{ text: '/start' }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          });
        } catch (retryError) {
          console.error(`Failed to send retry message to ${chatId}:`, retryError.message);
        }
      } else {
        console.error(`Error sending idle prompt to ${chatId}:`, error.message);
      }
    } finally {
      // Always clean up the timeout
      delete userTimeouts[chatId];
    }
  }, 30000); // 30 seconds
}

// In helpers.js, update the displayCurrentStep function
async function displayCurrentStep(bot, chatId, user, lang, stepOverride = null) {
  const botInstance = bot;
  const step = user.step;
  
  if (!step) {
    return bot.sendMessage(chatId, langText[lang]?.welcome || 'Welcome!', { 
      ...generateMainMenuKeyboard(lang, user)
      // REMOVED: parse_mode: 'Markdown' 
    });
  }

  let promptMessage = '';
  const displayStep = stepOverride || step;

  switch (displayStep) {
    case 'edit_location':
      promptMessage = 'Please enter your new location:';
      break;
    case 'name':
      promptMessage = langText[lang]?.askName || 'Please enter your full name:';
      break;
    case 'email':
      promptMessage = langText[lang]?.askEmail || 'Please enter your email address:';
      break;
    case 'location':
      promptMessage = langText[lang]?.askLocation || 'Please enter your location:';
      break;
    case 'phone':
      promptMessage = langText[lang]?.askPhone || 'Please enter your phone number (09XXXXXXXX):';
      break;
    case 'payment':
      const accountText = langText[lang]?.accountNumber || 'Account number: XXXXXXXXXX';
      const paymentText = langText[lang]?.askPayment || 'Please upload payment screenshot:';
      
      await botInstance.sendMessage(chatId, accountText);
      setUserTimeout(botInstance, chatId, lang);
      return botInstance.sendMessage(chatId, paymentText, generateMainMenuKeyboard(lang, user));
    
    // ... other cases
    default:
      // Send without parse_mode for safety
      promptMessage = `Please continue with: ${displayStep}`;
      break;
  }
  
  setUserTimeout(botInstance, chatId, lang);
  
  // Send WITHOUT parse_mode for edit_location and other unknown steps
  return botInstance.sendMessage(chatId, promptMessage, { 
    ...generateMainMenuKeyboard(lang, user)
    // NO parse_mode here - it causes the error
  });
}

// Clear user timeout
function clearUserTimeout(chatId) {
  if (userTimeouts[chatId]) {
    clearTimeout(userTimeouts[chatId]);
    delete userTimeouts[chatId];
  }
}

module.exports = {
  setUserTimeout,
  clearUserTimeout,
  displayCurrentStep
};