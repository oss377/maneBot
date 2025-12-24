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

async function handleCallbackQuery(ctx) {
  // Extract data from Telegraf context
  const action = ctx.callbackQuery.data;
  const msg = ctx.callbackQuery.message;
  const chatId = msg ? msg.chat.id : ctx.callbackQuery.from.id;
  const callbackQueryId = ctx.callbackQuery.id;
  
  // Find user - try by chatId first, then by callbackQuery.from.id
  let user = await User.findOne({ chatId: chatId });
  if (!user && ctx.callbackQuery.from) {
    user = await User.findOne({ chatId: ctx.callbackQuery.from.id });
  }
  
  const lang = user ? (user.lang || 'en') : 'en';

  // --- ADMIN CALLBACKS ---
  if (chatId.toString() === ADMIN_CHAT_ID && action.startsWith('/')) {
    const parts = action.split(' ');
    const command = parts[0];
    const targetChatId = parts[1];
    const regIndex = parts[2] ? parseInt(parts[2], 10) : null;

    try {
      if (command === '/approve' && targetChatId) {
        await approveUser(ctx.telegram, targetChatId, chatId);
        await ctx.answerCbQuery({ text: '✅ User approved!' });
        
        if (msg && msg.caption) {
          return ctx.editMessageCaption(
            `${msg.caption}\n\n---\n✅ Approved by admin.`,
            { message_id: msg.message_id }
          );
        }
        return;
      }
      
      if (command === '/decline' && targetChatId) {
        await declineUser(ctx.telegram, targetChatId, chatId);
        await ctx.answerCbQuery({ text: '❌ User declined.' });
        
        if (msg && msg.caption) {
          return ctx.editMessageCaption(
            `${msg.caption}\n\n---\n❌ Declined by admin.`,
            { message_id: msg.message_id }
          );
        }
        return;
      }
      
      if (command === '/approve_other' && targetChatId && regIndex !== null) {
        await approveOtherUser(ctx.telegram, targetChatId, regIndex, chatId);
        await ctx.answerCbQuery({ text: '✅ User approved!' });
        
        if (msg && msg.caption) {
          return ctx.editMessageCaption(
            `${msg.caption}\n\n---\n✅ Approved by admin.`,
            { message_id: msg.message_id }
          );
        }
        return;
      }
      
      if (command === '/decline_other' && targetChatId && regIndex !== null) {
        await declineOtherUser(ctx.telegram, targetChatId, regIndex, chatId);
        await ctx.answerCbQuery({ text: '❌ User declined.' });
        
        if (msg && msg.caption) {
          return ctx.editMessageCaption(
            `${msg.caption}\n\n---\n❌ Declined by admin.`,
            { message_id: msg.message_id }
          );
        }
        return;
      }
    } catch (error) {
      console.error('Admin callback error:', error);
      await ctx.answerCbQuery({ text: '❌ Error processing request' });
    }
    // In the admin command section of handleTextMessage (around line 30-100)
if (text.startsWith('/') && chatId.toString() === ADMIN_CHAT_ID) {
  const commandMatch = text.match(/^\/(\w+)/);
  if (commandMatch) {
    const command = commandMatch[1];
    const adminCommands = [
      'approve', 'decline', 'approve_other', 'decline_other',
      'deleteuser', 'broadcast', 'exportusers', 'pendingpayments',
      'stats', 'incomplete', 'feelings', 'remindfeelings',
      'registrars' // ← ADD THIS
    ];

    if (adminCommands.includes(command)) {
      // ... existing commands ...
      
      if (text === '/registrars') {
        return await handleRegistrarsList(botInstance, chatId);
      }
    }
  }
}
  }
  








  // --- END ADMIN CALLBACKS ---

  // Always answer callback query to prevent timeout
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error answering callback query:', error);
  }

  if (!user) {
    await ctx.reply('User not found! Please start with /start');
    return;
  }

  // Handle different callback actions
  if (action === 'edit_name') {
    user.step = 'edit_name';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    await ctx.reply(langText[lang].askNewName);
    
  } else if (action === 'edit_email') {
    user.step = 'edit_email';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    await ctx.reply(langText[lang].askNewEmail);
    
  } else if (action === 'edit_phone') {
    user.step = 'edit_phone';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    await ctx.reply(langText[lang].askNewPhone);
    
  } else if (action === 'edit_location') {
    user.step = 'edit_location';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    await ctx.reply('Please enter your new location:');
    
  } else if (action === 'finish_payments') {
    // Check for user's own pending payment status
    if (user.name && !user.approved) {
      if (user.payment) {
        // Payment is uploaded, waiting for approval
        await ctx.reply(langText[lang].waitForApproval);
      } else {
        // Payment is not uploaded, prompt to pay
        user.step = 'payment';
        await user.save();
        setUserTimeout(ctx.telegram, chatId, lang);
        await ctx.reply(langText[lang].accountNumber);
        await ctx.reply(langText[lang].askPayment);
      }
      return;
    }
    
    // Check for others' pending payments
    if (user.other_registrations && user.other_registrations.length > 0) {
      const pendingRegIndex = user.other_registrations.findIndex(reg => reg.phone && !reg.payment);
      if (pendingRegIndex !== -1) {
        const pendingReg = user.other_registrations[pendingRegIndex];
        user.current_other_reg_index = pendingRegIndex;
        user.step = 'payment_other';
        await user.save();
        setUserTimeout(ctx.telegram, chatId, lang);
        await ctx.reply(`Please upload the payment screenshot for ${pendingReg.name}:`);
        return;
      }
    }
    
    // If no pending payments are found
    await ctx.reply('✅ All payments are up to date!');
    
  } else if (action === 'continue_registration') {
    // Handle "Continue Registration" button click
    const step = user.step;

    if (!step) {
      await ctx.reply('You have no pending registration steps.');
      return;
    }

    const stepToDisplay = user.step;
    console.log(`Continue registration (callback): Displaying step '${stepToDisplay}'`);
    
    // Call displayCurrentStep WITHOUT parse_mode for edit_location step
    if (stepToDisplay === 'edit_location') {
      await ctx.reply('Please enter your new location:', {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Cancel', callback_data: 'cancel_edit' }
          ]]
        }
      });
    } else {
      await displayCurrentStep(ctx.telegram, chatId, user, lang, stepToDisplay);
    }
    
  } else if (action.startsWith('remind_user:')) {
    // Handle the new reminder callback
    const parts = action.split(':');
    const targetChatId = parts[1];
    const regIndex = parseInt(parts[2], 10);

    try {
      const targetUser = await User.findOne({ chatId: targetChatId });
      if (!targetUser) {
        await ctx.reply('User not found!');
        return;
      }

      const targetLang = targetUser.lang || 'en';
      const step = targetUser.step;
      
      if (!step) {
        await ctx.reply('⚠️ User is not in an active step.');
        return;
      }

      let reminderMsg = `🔔 Reminder\n\n`;
      let nextStepPrompt = '';

      switch (step) {
        case 'name':
          nextStepPrompt = langText[targetLang].askName;
          break;
        case 'email':
          nextStepPrompt = langText[targetLang].askEmail;
          break;
        case 'location':
          nextStepPrompt = langText[targetLang].askLocation;
          break;
        case 'phone':
          nextStepPrompt = langText[targetLang].askPhone;
          break;
        case 'payment':
          nextStepPrompt = langText[targetLang].finishPaymentPrompt;
          break;
        case 'name_other':
          nextStepPrompt = langText[targetLang].askName_other;
          break;
        case 'email_other':
          nextStepPrompt = langText[targetLang].askEmail_other;
          break;
        case 'location_other':
          nextStepPrompt = langText[targetLang].askLocation_other;
          break;
        case 'phone_other':
          nextStepPrompt = langText[targetLang].askPhone_other;
          break;
        case 'payment_other':
          const reg = targetUser.other_registrations[targetUser.current_other_reg_index ?? targetUser.other_registrations.length - 1];
          nextStepPrompt = `You still need to upload the payment screenshot for ${reg.name}.`;
          break;
        default:
          await ctx.reply('Unknown step.');
          return;
      }

      // Send without parse_mode for safety
      await ctx.telegram.sendMessage(targetChatId, reminderMsg + nextStepPrompt);
      targetUser.last_reminder_sent_at = new Date();
      await targetUser.save();
      await ctx.reply('✅ Smart reminder sent!');

    } catch (error) {
      console.error('Error sending reminder:', error);
      await ctx.reply('❌ Error sending reminder.');
    }
    
  } else if (action.startsWith('remind_feeling:')) {
    // Handle feeling reminder callbacks
    const [, type, targetChatId] = action.split(':');

    try {
      const targetUser = await User.findOne({ chatId: targetChatId });
      if (!targetUser) {
        await ctx.reply('User not found!');
        return;
      }

      const targetLang = targetUser.lang || 'en';
      if (type === 'before') {
        targetUser.step = 'feeling_before';
        await targetUser.save();
        await ctx.telegram.sendMessage(targetChatId, langText[targetLang].remindPreRetreatFeeling);
      } else if (type === 'after') {
        targetUser.step = 'feeling_after';
        await targetUser.save();
        await ctx.telegram.sendMessage(targetChatId, langText[targetLang].remindPostRetreatFeeling);
      }
      
      await ctx.reply(`✅ ${type} feeling reminder sent!`);
      
    } catch (error) {
      if (error.response && error.response.error_code === 403) {
        console.log(`Could not send feeling reminder to ${targetChatId}: Bot was blocked by the user.`);
        await ctx.reply('User has blocked the bot.');
      } else {
        console.error('Error sending feeling reminder:', error);
        await ctx.reply('❌ Error sending reminder.');
      }
    }
    
  } else if (action === 'cancel_edit') {
    // Handle cancel edit callback
    if (user) {
      user.step = null;
      await user.save();
      await ctx.reply('Edit cancelled. Returning to main menu.');
      await ctx.reply(
        langText[lang].welcome || 'Welcome!',
        generateMainMenuKeyboard(lang, user)
      );
    }
    
  } else {
    // Default response for unhandled callbacks - send WITHOUT parse_mode
    await ctx.reply('Action processed.');
  }
}

module.exports = {
  handleCallbackQuery
};