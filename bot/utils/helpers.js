const User = require('../../models/User');
const langText = require('../../languages/translations');
const { generateMainMenuKeyboard } = require('./keyboards');
const userTimeouts = {}; // Keep this here as it's specific to timeouts

function setUserTimeout(botInstance, chatId, lang) {
  // Clear any existing timeout for this user to avoid multiple messages
  if (userTimeouts[chatId]) {
    clearTimeout(userTimeouts[chatId]);
  }

  // The bot instance is now passed explicitly
  // Set a new timeout
  userTimeouts[chatId] = setTimeout(async () => {
    const user = await User.findOne({ chatId });
    // Only send if the user is still in an active step
    if (user && user.step) {
      console.log(`User ${chatId} has been idle. Sending a restart prompt.`);
      const startKeyboard = {
        reply_markup: {
          keyboard: [[{ text: 'Back' }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      };
      botInstance.sendMessage(chatId, 'Are you stuck? You can go back to the main menu by clicking the button below.', startKeyboard);
    }
    delete userTimeouts[chatId];
  }, 30000); // 30 seconds
}

async function displayCurrentStep(bot, chatId, user, lang, stepOverride = null) {
  const botInstance = bot; // Use botInstance for clarity
  const step = user.step;
  if (!step) {
    // This can be called from a callback or a message, so we avoid answering a query that might not exist.
    // Simply show the main menu if there's no step.
    return bot.sendMessage(chatId, langText[lang].welcome, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });
  }

  let stepFriendlyName = '';
  let promptMessage = '';
  const displayStep = stepOverride || step; // Use override if provided

  // Dynamically get the friendly name to avoid large switch cases
  const stepKey = `step${displayStep.charAt(0).toUpperCase() + displayStep.slice(1).replace('_o', 'O')}`;
  stepFriendlyName = langText[lang][stepKey] || displayStep;

  switch (displayStep) {
    case 'name':
      promptMessage = langText[lang].askName;
      break;
    case 'email':
      promptMessage = langText[lang].askEmail;
      break;
    case 'location':
      promptMessage = langText[lang].askLocation;
      break;
    case 'phone':
      promptMessage = langText[lang].askPhone;
      break;
    case 'payment':
      await botInstance.sendMessage(chatId, langText[lang].accountNumber);
      return botInstance.sendMessage(chatId, langText[lang].askPayment, generateMainMenuKeyboard(lang, user));
    case 'name_other':
      promptMessage = langText[lang].askName_other;
      break;
    case 'email_other':
      promptMessage = langText[lang].askEmail_other;
      break;
    case 'location_other':
      promptMessage = langText[lang].askLocation_other;
      break;
    case 'phone_other':
      promptMessage = langText[lang].askPhone_other;
      break;
    case 'payment_other':
      promptMessage = langText[lang].askPayment;
      botInstance.sendMessage(chatId, langText[lang].accountNumber);
      break;
  }
  setUserTimeout(botInstance, chatId, lang); // Pass botInstance
  return botInstance.sendMessage(chatId, promptMessage, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });
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