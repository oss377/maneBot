const User = require('../../models/User');
const langText = require('../../languages/translations');
const { generateMainMenuKeyboard } = require('../utils/keyboards');
const { setUserTimeout, displayCurrentStep } = require('../utils/helpers');
const { ADMIN_CHAT_ID } = require('../../config/constants');
const {
  approveUser,
  declineUser,
  approveOtherUser,
  declineOtherUser
} = require('./adminHandlers');

async function handleCallbackQuery(botInstance, callbackQuery) {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const action = callbackQuery.data;
  const user = await User.findOne({ chatId });
  const lang = user ? (user.lang || 'en') : 'en'; // lang is guaranteed to be set here due to /start logic

  // --- ADMIN CALLBACKS ---
  if (chatId.toString() === ADMIN_CHAT_ID && action.startsWith('/')) {
    const parts = action.split(' ');
    const command = parts[0];
    const targetChatId = parts[1];
    const regIndex = parts[2] ? parseInt(parts[2], 10) : null;

    if (command === '/approve' && targetChatId) {
      await approveUser(botInstance, targetChatId, chatId);
      botInstance.answerCallbackQuery(callbackQuery.id, { text: '✅ User approved!' });
      return botInstance.editMessageCaption(`${msg.caption}\n\n---\n✅ Approved by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
    if (command === '/decline' && targetChatId) {
      await declineUser(botInstance, targetChatId, chatId);
      botInstance.answerCallbackQuery(callbackQuery.id, { text: '❌ User declined.' });
      return botInstance.editMessageCaption(`${msg.caption}\n\n---\n❌ Declined by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
    if (command === '/approve_other' && targetChatId && regIndex !== null) {
      await approveOtherUser(botInstance, targetChatId, regIndex, chatId);
      botInstance.answerCallbackQuery(callbackQuery.id, { text: '✅ User approved!' });
      return botInstance.editMessageCaption(`${msg.caption}\n\n---\n✅ Approved by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
    if (command === '/decline_other' && targetChatId && regIndex !== null) {
      await declineOtherUser(botInstance, targetChatId, regIndex, chatId);
      botInstance.answerCallbackQuery(callbackQuery.id, { text: '❌ User declined.' });
      return botInstance.editMessageCaption(`${msg.caption}\n\n---\n❌ Declined by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
  }
  // --- END ADMIN CALLBACKS ---

  if (!user) {
    return botInstance.answerCallbackQuery(callbackQuery.id, { text: 'User not found!' });
  }

  if (action === 'edit_name') {
    user.step = 'edit_name';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    botInstance.sendMessage(chatId, langText[lang].askNewName);
    return botInstance.answerCallbackQuery(callbackQuery.id);
  } else if (action === 'edit_email') {
    user.step = 'edit_email';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    botInstance.sendMessage(chatId, langText[lang].askNewEmail);
    return botInstance.answerCallbackQuery(callbackQuery.id);
  } else if (action === 'edit_phone') {
    user.step = 'edit_phone';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    botInstance.sendMessage(chatId, langText[lang].askNewPhone);
    return botInstance.answerCallbackQuery(callbackQuery.id);
  } else if (action === 'edit_location') {
    user.step = 'edit_location';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    botInstance.sendMessage(chatId, 'Please enter your new location:');
    return botInstance.answerCallbackQuery(callbackQuery.id);
  } else if (action === 'finish_payments') {
    // Check for user's own pending payment status
    botInstance.answerCallbackQuery(callbackQuery.id);
    if (user.name && !user.approved) { // User has registered but is not yet approved
      if (user.payment) {
        // Payment is uploaded, waiting for approval
        return botInstance.sendMessage(chatId, langText[lang].waitForApproval);
      } else {
        // Payment is not uploaded, prompt to pay
        user.step = 'payment'; // Set the user's step to payment
        await user.save();
        setUserTimeout(botInstance, chatId, lang);
        botInstance.sendMessage(chatId, langText[lang].accountNumber);
        return botInstance.sendMessage(chatId, langText[lang].askPayment);
      }
    }
    // Check for others' pending payments
    if (user.other_registrations && user.other_registrations.length > 0) {
      const pendingRegIndex = user.other_registrations.findIndex(reg => reg.phone && !reg.payment);
      if (pendingRegIndex !== -1) {
        const pendingReg = user.other_registrations[pendingRegIndex];
        user.current_other_reg_index = pendingRegIndex; // Remember which registration we are paying for
        user.step = 'payment_other'; // Set the step to handle the next photo upload
        await user.save();
        setUserTimeout(botInstance, chatId, lang);
        return botInstance.sendMessage(chatId, `Please upload the payment screenshot for ${pendingReg.name}:`);
      }
    }
    // If no pending payments are found
    return botInstance.sendMessage(chatId, '✅ All payments are up to date!');
  } else if (action === 'continue_registration') {
    // Handle "Continue Registration" button click
    const step = user.step;

    if (!step) {
      // Answer the query here and only here if there's no step.
      return botInstance.answerCallbackQuery(callbackQuery.id, { text: 'You have no pending registration steps.', show_alert: true });
    }

    // The `user.step` from the database is the most reliable source of truth for where the user left off.
    const stepToDisplay = user.step;
    console.log(`Continue registration (callback): Displaying step '${stepToDisplay}'`);

    // Now, we use `stepToDisplay` to show the user where they are,
    // but we use the original `step` from the database to get the correct prompt.
    // This ensures we ask for the correct piece of information.
    botInstance.answerCallbackQuery(callbackQuery.id); // Acknowledge the click before proceeding.
    await displayCurrentStep(botInstance, chatId, user, lang, stepToDisplay);
    return; // The displayCurrentStep function handles sending the message.
  } else if (action.startsWith('remind_user:')) {
    // Handle the new reminder callback
    const parts = action.split(':');
    const targetChatId = parts[1];
    const regIndex = parseInt(parts[2], 10);

    try {
      const targetUser = await User.findOne({ chatId: targetChatId });
      if (!targetUser) {
        return botInstance.answerCallbackQuery(callbackQuery.id, { text: 'User not found!' });
      }

      const lang = targetUser.lang || 'en';
      let reminderSent = false;

      // Smart Reminder Logic
      const step = targetUser.step;
      if (!step) {
        return botInstance.answerCallbackQuery(callbackQuery.id, { text: '⚠️ User is not in an active step.' });
      }

      let reminderMsg = `🔔 *Reminder*\n\n`;
      let nextStepPrompt = '';

      switch (step) {
        case 'name':
          nextStepPrompt = langText[lang].askName;
          break;
        case 'email':
          nextStepPrompt = langText[lang].askEmail;
          break;
        case 'location':
          nextStepPrompt = langText[lang].askLocation;
          break;
        case 'phone':
          nextStepPrompt = langText[lang].askPhone;
          break;
        case 'payment':
          nextStepPrompt = langText[lang].finishPaymentPrompt;
          break;
        case 'name_other':
          nextStepPrompt = langText[lang].askName_other;
          break;
        case 'email_other':
          nextStepPrompt = langText[lang].askEmail_other;
          break;
        case 'location_other':
          nextStepPrompt = langText[lang].askLocation_other;
          break;
        case 'phone_other':
          nextStepPrompt = langText[lang].askPhone_other;
          break;
        case 'payment_other':
          const reg = targetUser.other_registrations[targetUser.current_other_reg_index ?? targetUser.other_registrations.length - 1];
          nextStepPrompt = `You still need to upload the payment screenshot for *${reg.name}*.`;
          break;
        default:
          return botInstance.answerCallbackQuery(callbackQuery.id, { text: 'Unknown step.' });
      }

      await botInstance.sendMessage(targetChatId, reminderMsg + nextStepPrompt, { parse_mode: 'Markdown' });
      targetUser.last_reminder_sent_at = new Date(); // Track reminder
      await targetUser.save();
      botInstance.answerCallbackQuery(callbackQuery.id, { text: '✅ Smart reminder sent!' });

    } catch (error) {
      console.error('Error sending reminder:', error);
      botInstance.answerCallbackQuery(callbackQuery.id, { text: '❌ Error sending reminder.' });
    }
  } else if (action.startsWith('remind_feeling:')) {
    // Handle feeling reminder callbacks
    const [, type, targetChatId] = action.split(':');

    try {
      const targetUser = await User.findOne({ chatId: targetChatId });
      if (!targetUser) {
        return botInstance.answerCallbackQuery(callbackQuery.id, { text: 'User not found!' });
      }

      const lang = targetUser.lang || 'en';
      if (type === 'before') {
        targetUser.step = 'feeling_before';
        await targetUser.save();
        await botInstance.sendMessage(targetChatId, langText[lang].remindPreRetreatFeeling, { parse_mode: 'Markdown' });
      } else if (type === 'after') {
        targetUser.step = 'feeling_after';
        await targetUser.save();
        await botInstance.sendMessage(targetChatId, langText[lang].remindPostRetreatFeeling, { parse_mode: 'Markdown' });
      }
      botInstance.answerCallbackQuery(callbackQuery.id, { text: `✅ ${type} feeling reminder sent!` });
    } catch (error) {
      // Improved error handling
      if (error.code === 'ETELEGRAM' && error.response && error.response.statusCode === 403) {
        console.log(`Could not send feeling reminder to ${targetChatId}: Bot was blocked by the user.`);
        botInstance.answerCallbackQuery(callbackQuery.id, { text: 'User has blocked the bot.' });
      } else {
        console.error('Error sending feeling reminder:', error);
        botInstance.answerCallbackQuery(callbackQuery.id, { text: '❌ Error sending reminder.' });
      }
    }
  } else {
    // If no other action was matched, answer the query to prevent a timeout
    botInstance.answerCallbackQuery(callbackQuery.id);
  }

}

module.exports = {
  handleCallbackQuery
};