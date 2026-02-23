const User = require('../../models/User');
const langText = require('../../languages/translations');
const { generateMainMenuKeyboard, profileKeyboard } = require('../utils/keyboards');
const { setUserTimeout, clearUserTimeout, displayCurrentStep } = require('../utils/helpers');
const validator = require('validator');
const { ADMIN_CHAT_ID, GROUP_LINK } = require('../../config/constants');
const crypto = require('crypto');
const {
  approveUser, declineUser, approveOtherUser, declineOtherUser,
  handleDeleteUser, handleExportUsers, handlePendingPayments, handleStats,
  handleIncomplete, handleFeelings, handleRemindFeelings, handleBroadcastMessage
} = require('./adminHandlers');

async function handleStart(ctx) {
  // Extract data from Telegraf context
  const chatId = ctx.message.chat.id;
  const payload = ctx.startPayload; // Telegraf stores payload in ctx.startPayload
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  const firstName = ctx.from.first_name || 'User';

  let user = await User.findOne({ chatId });

  // SCENARIO 1: User clicks a special invitation link
  if (payload) {
    const registrarUser = await User.findOne({ 'other_registrations.claim_token': payload });

    if (registrarUser) {
      const regIndex = registrarUser.other_registrations.findIndex(reg => reg.claim_token === payload);
      const preRegisteredData = registrarUser.other_registrations[regIndex];

      // Check if the registration data actually exists
      if (!preRegisteredData) {
        return ctx.reply('This invitation link is no longer valid or has already been used.');
      }

      // Ensure the user doesn't already exist with a different chat ID
      const existingClaimedUser = await User.findOne({ phone: preRegisteredData.phone });
      if (existingClaimedUser && existingClaimedUser.chatId !== chatId.toString()) {
        return ctx.reply('This invitation has already been claimed by another Telegram account.');
      }

      // Create or update the new user's account with the pre-registered data
      const newUser = await User.findOneAndUpdate({ chatId }, {
        name: preRegisteredData.name,
        email: preRegisteredData.email,
        phone: preRegisteredData.phone,
        location: preRegisteredData.location,
        payment: preRegisteredData.payment,
        approved: preRegisteredData.approved,
        lang: registrarUser.lang || 'en',
        step: null,
        invited_by_chatId: registrarUser.chatId,
      }, { upsert: true, new: true });

      // Remove the registration from the original registrar's list
      registrarUser.other_registrations.splice(regIndex, 1);
      await registrarUser.save();

      await ctx.reply(`Welcome, ${newUser.name}! You were invited by ${registrarUser.name}.`);
      return ctx.reply(
        langText[newUser.lang].welcomeBackPreRegistered, 
        { 
          ...generateMainMenuKeyboard(newUser.lang, newUser), 
          parse_mode: 'Markdown' 
        }
      );
    }
  }

  // Prioritize language selection for new users or users without a language
  if (!user || !user.lang) {
    // If there's a payload, it means they were invited
    if (payload) {
      const registrarUser = await User.findOne({ 'other_registrations.claim_token': payload });

      if (registrarUser) {
        const regIndex = registrarUser.other_registrations.findIndex(reg => reg.claim_token === payload);
        const preRegisteredData = registrarUser.other_registrations[regIndex];

        if (!preRegisteredData) {
          return ctx.reply('This invitation link is no longer valid or has already been used.');
        }

        const existingClaimedUser = await User.findOne({ phone: preRegisteredData.phone });
        if (existingClaimedUser && existingClaimedUser.chatId !== chatId.toString()) {
          return ctx.reply('This invitation has already been claimed by another Telegram account.');
        }

        // Create or update the new user's account with the pre-registered data and language
        user = await User.findOneAndUpdate({ chatId }, {
          name: preRegisteredData.name,
          email: preRegisteredData.email,
          phone: preRegisteredData.phone,
          location: preRegisteredData.location,
          payment: preRegisteredData.payment,
          approved: preRegisteredData.approved,
          lang: registrarUser.lang || 'en',
          step: null,
          invited_by_chatId: registrarUser.chatId,
        }, { upsert: true, new: true });

        await ctx.reply(`Welcome, ${user.name}! You were invited by ${registrarUser.name}.`);
        return ctx.reply(
          langText[user.lang].welcomeBackPreRegistered, 
          { 
            ...generateMainMenuKeyboard(user.lang, user), 
            parse_mode: 'Markdown' 
          }
        );
      } else {
        // Payload exists but no matching registrarUser found
      }
    }

    // If no payload, or bad payload, and user has no language, prompt for language
    user = await User.findOneAndUpdate({ chatId }, { step: 'select_lang' }, { upsert: true, new: true });
    const langKeyboard = {
      reply_markup: {
        keyboard: [[{ text: 'English' }], [{ text: 'አማርኛ' }], [{ text: 'Afaan Oromoo' }]],
        resize_keyboard: true, 
        one_time_keyboard: true
      }
    };
    return ctx.reply('Please select your language / እባክዎን ቋንቋ ይምረጡ: / Mee afaan filadhu:', langKeyboard);
  }

  // At this point, 'user' is guaranteed to exist and 'user.lang' is guaranteed to be set
  const userLang = user.lang;

  // If user has an incomplete registration step, prompt to continue
  if (user.step) {
    // Check if all data is registered but payment is pending
    const isPaymentPendingAfterFullData = user.step === 'payment' &&
      user.name && user.email && user.phone && user.location &&
      !user.payment;

    if (isPaymentPendingAfterFullData) {
      return ctx.reply(
        langText[userLang].welcomeBackFinishPayment, 
        { 
          ...generateMainMenuKeyboard(userLang, user), 
          parse_mode: 'Markdown' 
        }
      );
    } else {
      const continueKeyboard = {
        reply_markup: { 
          inline_keyboard: [[{ 
            text: langText[userLang].continueRegistrationButton, 
            callback_data: 'continue_registration' 
          }]] 
        }
      };
      return ctx.reply(langText[userLang].continueRegistrationPrompt, continueKeyboard);
    }
  }

  // User is fully registered, has a language, and no pending step
  return ctx.reply(
    langText[userLang].welcome, 
    { 
      ...generateMainMenuKeyboard(userLang, user), 
      parse_mode: 'Markdown' 
    }
  );
}

async function handleMessage(ctx) {
  const chatId = ctx.message.chat.id;
  const text = ctx.message.text ? ctx.message.text.trim() : undefined;

  // Clear user timeout when a message is received
  clearUserTimeout(chatId);

  let user = await User.findOne({ chatId });

  // Handle language selection
  if (user && user.step === 'select_lang') {
    if (text === 'English') user.lang = 'en';
    else if (text === 'አማርኛ') user.lang = 'am';
    else if (text === 'Afaan Oromoo') user.lang = 'om';
    else return ctx.reply('Please select a valid language / እባክዎን ቋንቋ ይምረጡ: / Mee afaan sirrii filadhu:');
    
    user.step = null;
    await user.save();
    
    await ctx.reply(langText[user.lang].registrationSteps, { parse_mode: 'Markdown' });
    return ctx.reply(
      langText[user.lang].welcome, 
      { 
        ...generateMainMenuKeyboard(user.lang, user), 
        parse_mode: 'Markdown' 
      }
    );
  }

  // If user is not found and they didn't type /start, prompt them to start
  if (!user) {
    return ctx.reply('Please click /start to begin.');
  }

  const lang = user.lang || 'en';

  // Handle non-text messages (photo for payment)
  if (ctx.message.photo) {
    return handlePhotoUpload(ctx, user, lang);
  }

  // Handle text messages
  if (text) {
    return handleTextMessage(ctx, text, chatId, user, lang);
  }
}


async function handlePhotoUpload(ctx, user, lang) {
  const chatId = ctx.message.chat.id;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  if (user.step === 'payment') {
    user.payment = fileId;
    user.payment_pending_since = null;
    user.step = null;
    await user.save();
    
    ctx.reply(langText[lang].processingPayment, generateMainMenuKeyboard(lang, user));
    ctx.reply(langText[lang].canRegisterOthers);

    // Notify the inviter if this user was invited by someone
    if (user.invited_by_chatId) {
      const inviter = await User.findOne({ chatId: user.invited_by_chatId });
      if (inviter) {
        const inviterLang = inviter.lang || 'en';
        await ctx.telegram.sendMessage(
          inviter.chatId, 
          langText[inviterLang].friendUploadedPayment(user.name)
        );

        const hasMorePending = inviter.other_registrations.some(reg => reg.name && !reg.payment);
        if (!hasMorePending) {
          await ctx.telegram.sendMessage(inviter.chatId, langText[inviterLang].canRegisterOthers);
        }
      }
    }

    // Notify admin for self-registration
    const caption = `User: ${user.name} (${chatId})\nEmail: ${user.email}\nPhone: ${user.phone}\nLocation: ${user.location}`;
    const adminOptions = {
      caption,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `/approve ${chatId}` }, 
            { text: '❌ Decline', callback_data: `/decline ${chatId}` }
          ]
        ]
      }
    };
    ctx.telegram.sendPhoto(ADMIN_CHAT_ID, fileId, adminOptions);

  } else if (user.step === 'payment_other') {
    const regIndex = user.current_other_reg_index ?? (user.other_registrations.length - 1);
    if (regIndex === null || regIndex === undefined || !user.other_registrations[regIndex]) {
      console.error(`Error: Invalid regIndex for payment_other. User: ${chatId}, Index: ${regIndex}`);
      return ctx.reply('An error occurred. Could not find the registration to apply payment to. Please contact support.');
    }
    
    const newReg = user.other_registrations[regIndex];
    newReg.payment = fileId;
    newReg.payment_pending_since = null;
    newReg.approved = false;
    user.step = null;
    user.current_other_reg_index = null;
    await user.save();
    
    ctx.reply(langText[lang].processingPayment, generateMainMenuKeyboard(lang, user));

    // Notify admin about the new registration
    const caption = `New Registration by ${user.name} (${chatId}):\n\n` +
      `New User Name: ${newReg.name}\n` +
      `New User Email: ${newReg.email}\n` +
      `New User Phone: ${newReg.phone}\n` +
      `New User Location: ${newReg.location}`;
    const adminOptions = {
      caption,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `/approve_other ${chatId} ${regIndex}` }, 
            { text: '❌ Decline', callback_data: `/decline_other ${chatId} ${regIndex}` }
          ]
        ]
      }
    };
    ctx.telegram.sendPhoto(ADMIN_CHAT_ID, newReg.payment, adminOptions);
  }
}

async function handleTextMessage(ctx, text, chatId, user, lang) {
  // --- ADMIN COMMAND ROUTER ---
  if (text.startsWith('/') && chatId.toString() === ADMIN_CHAT_ID) {
    const commandMatch = text.match(/^\/(\w+)/);
    if (commandMatch) {
      const command = commandMatch[1];
      const adminCommands = [
        'approve', 'decline', 'approve_other', 'decline_other',
        'deleteuser', 'broadcast', 'exportusers', 'pendingpayments',
        'stats', 'incomplete', 'feelings', 'remindfeelings'
      ];

      if (adminCommands.includes(command)) {
        if (text.startsWith('/approve ') && !text.includes('_other')) {
          const parts = text.split(' ');
          const userId = parts[1];
          return await approveUser(ctx.telegram, userId, chatId);
        }
        if (text.startsWith('/approve_other ')) {
          const parts = text.split(' ');
          const userId = parts[1];
          const regIndex = parseInt(parts[2], 10);
          return await approveOtherUser(ctx.telegram, userId, regIndex, chatId);
        }
        if (text.startsWith('/decline ') && !text.includes('_other')) {
          const parts = text.split(' ');
          const userId = parts[1];
          return await declineUser(ctx.telegram, userId, chatId);
        }
        if (text.startsWith('/decline_other ')) {
          const parts = text.split(' ');
          const userId = parts[1];
          const regIndex = parseInt(parts[2], 10);
          return await declineOtherUser(ctx.telegram, userId, regIndex, chatId);
        }
        if (text.startsWith('/deleteuser ')) {
          const parts = text.split(' ');
          const userIdToDelete = parts[1];
          return await handleDeleteUser(ctx.telegram, userIdToDelete, chatId);
        }
        if (text === '/broadcast') {
          user.step = 'broadcast_message';
          await user.save();
          return ctx.reply('Please send the message you want to broadcast to all users. Send /cancel to abort.');
        }
        if (text === '/exportusers') {
          return await handleExportUsers(ctx.telegram, chatId);
        }
        if (text === '/pendingpayments') {
          return await handlePendingPayments(ctx.telegram, chatId);
        }
        if (text === '/stats') {
          return await handleStats(ctx.telegram, chatId);
        }
        if (text === '/incomplete') {
          return await handleIncomplete(ctx.telegram, chatId);
        }
        if (text === '/feelings') {
          return await handleFeelings(ctx.telegram, chatId);
        }
        if (text === '/remindfeelings') {
          return await handleRemindFeelings(ctx.telegram, chatId);
        }
      }
    }
  }

  // Handle broadcast message step for admin
  if (user && user.step === 'broadcast_message' && chatId.toString() === ADMIN_CHAT_ID) {
    if (text === '/cancel') {
      user.step = null;
      await user.save();
      return ctx.reply('Broadcast cancelled.', generateMainMenuKeyboard(lang, user));
    }
    await handleBroadcastMessage(ctx.telegram, text, chatId);
    user.step = null;
    await user.save();
    return;
  }

  // Main menu buttons
  if (text === langText[lang].helpButton) {
    let helpMessage = langText[lang].help;
    if (chatId.toString() === ADMIN_CHAT_ID) {
      helpMessage += `\n\n${langText[lang].help_admin_commands}`;
    }
    return ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  }

  if (text === langText[lang].contactUsButton) {
    return ctx.reply(langText[lang].contactUs, { 
      parse_mode: 'Markdown', 
      disable_web_page_preview: true 
    });
  }

  if (text === 'Register / መዝግብ') {
    // Check for an incomplete step first
    if (user.step) {
      const continueKeyboard = {
        reply_markup: { 
          inline_keyboard: [[{ 
            text: langText[lang].continueRegistrationButton, 
            callback_data: 'continue_registration' 
          }]] 
        }
      };
      return ctx.reply(langText[lang].continueRegistrationPrompt, continueKeyboard);
    } else if (user.name) {
      const registerAnotherKeyboard = {
        reply_markup: {
          keyboard: [
            [{ text: langText[lang].registerAnother }], 
            [{ text: 'Cancel' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };
      return ctx.reply(langText[lang].alreadyRegistered, registerAnotherKeyboard);
    }
    
    user.step = 'name';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askName, { reply_markup: { remove_keyboard: true } });
  }

  if (text === langText.en.preRetreatFeeling) {
    user.step = 'feeling_before';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askPreRetreatFeeling, { reply_markup: { remove_keyboard: true } });
  }

  if (text === langText.en.postRetreatFeeling) {
    user.step = 'feeling_after';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askPostRetreatFeeling, { reply_markup: { remove_keyboard: true } });
  }

  // Handle 'Back' button
  if (text === 'Back') {
    return displayCurrentStep(ctx.telegram, chatId, user, lang);
  }

  if (text === langText[lang].changeLanguageButton) {
    user.step = 'select_lang';
    await user.save();
    const langKeyboard = {
      reply_markup: {
        keyboard: [
          [{ text: 'English' }], 
          [{ text: 'አማርኛ' }], 
          [{ text: 'Afaan Oromoo' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
    return ctx.reply(langText[lang].selectLanguagePrompt, langKeyboard);
  }

  if (text === langText[lang].myProfileButton) {
    if (user?.name) {
      let ownStatus = '';
      if (user.approved) {
        ownStatus = langText[lang].statusApproved;
      } else if (user.payment) {
        ownStatus = langText[lang].statusPending;
      } else if (user.name) {
        ownStatus = langText[lang].statusAwaitingPayment;
      }

      const profileInfo = `${langText[lang].profileTitle}\n\n` +
        `${langText[lang].profileDetails(user)}\n` +
        `*${langText[lang].statusLabel}:* ${ownStatus}`;
      const options = {
        parse_mode: 'Markdown',
        reply_markup: profileKeyboard(lang, user)
      };
      ctx.reply(profileInfo, options);

      // Display profiles of other registered users
      if (user.other_registrations && user.other_registrations.length > 0) {
        user.other_registrations.forEach(reg => {
          let status = '❓ Unknown';
          if (reg.approved) {
            status = '✅ Approved & Joined';
          } else if (reg.payment) {
            status = '⏳ Pending Approval';
          } else if (reg.phone) {
            status = '⚠️ Awaiting Payment';
          }
          const otherProfileInfo = `${langText[lang].otherProfileTitle}\n\n${langText[lang].profileDetails(reg)}`;
          ctx.reply(`${otherProfileInfo}\n*Status:* ${status}`, { parse_mode: 'Markdown' });
        });
      }
      return;
    } else {
      return ctx.reply(langText[lang].notRegistered, generateMainMenuKeyboard(lang, user));
    }
  }

  if (text === 'Join Group / ቡድኑን ይቀላቀሉ') {
    if (user.approved) {
      const joinGroupKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: langText[lang].joinGroup, 
              url: GROUP_LINK || 'https://t.me/your_group_link' 
            }]
          ]
        }
      };
      return ctx.reply(langText[lang].joinGroupSuccess, joinGroupKeyboard);
    } else if (user.name && !user.payment) {
      user.step = 'payment';
      await user.save();
      setUserTimeout(ctx.telegram, chatId, lang);
      ctx.reply(langText[lang].accountNumber);
      return ctx.reply(langText[lang].askPayment);
    } else if (user.payment && !user.approved) {
      return ctx.reply(langText[lang].waitForApproval, generateMainMenuKeyboard(lang, user));
    } else {
      return ctx.reply(langText[lang].joinGroupNotApproved, generateMainMenuKeyboard(lang, user));
    }
  }

  if (text === langText[lang].registerAnother) {
    user.step = 'name_other';
    if (!user.other_registrations) {
      user.other_registrations = [];
    }
    user.other_registrations.push({});
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askName_other, { reply_markup: { remove_keyboard: true } });
  }

  // Handle "Continue Registration" from the main menu keyboard
  if (text === langText[lang].continueRegistrationButton) {
    const step = user.step;
    if (!step) {
      return ctx.reply('You have no pending registration steps.', generateMainMenuKeyboard(lang, user));
    }

    const stepToDisplay = user.step;
    console.log(`Continue registration (main menu): Displaying step '${stepToDisplay}'`);
    return displayCurrentStep(ctx.telegram, chatId, user, lang, stepToDisplay);
  }

  // Registration steps
  if (user.step === 'name') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return ctx.reply(langText[lang].invalidName);
    }
    user.name = text;
    user.step = 'email';
    await user.save();
    const emailPromptOptions = {
      reply_markup: {
        input_field_placeholder: 'example@email.com'
      }
    };
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askEmail, emailPromptOptions);
  }

  if (user.step === 'email') {
    let finalEmail = text;

    if (text.startsWith('@') && user.partial_email) {
      finalEmail = user.partial_email + text;
    }

    if (!validator.isEmail(finalEmail)) {
      user.partial_email = text.split('@')[0];
      const emailReplyKeyboard = {
        reply_markup: {
          keyboard: [
            ['@gmail.com', '@yahoo.com', '@outlook.com'],
            ['Cancel']
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
          input_field_placeholder: 'example@email.com'
        },
      };
      setUserTimeout(ctx.telegram, chatId, lang);
      return ctx.reply(langText[lang].invalidEmail, emailReplyKeyboard);
    }
    user.email = finalEmail;
    await user.save();
    delete user.partial_email;
    user.step = 'location';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askLocation, { reply_markup: { remove_keyboard: true } });
  }

  if (user.step === 'location') {
    user.location = text;
    user.step = 'phone';
    await user.save();
    const phonePromptOptions = {
      reply_markup: {
        remove_keyboard: true,
        input_field_placeholder: '0987209020'
      }
    };
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askPhone, phonePromptOptions);
  }

  if (user.step === 'phone') {
    if (!/^09\d{8}$/.test(text)) {
      return ctx.reply(langText[lang].invalidPhone);
    }
    user.phone = text;
    await user.save();
    user.step = 'payment';
    user.payment_pending_since = new Date();
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    ctx.reply(langText[lang].accountNumber);
    return ctx.reply(langText[lang].askPayment);
  }

  // "Register Another" Steps
  if (user.step === 'name_other') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return ctx.reply(langText[lang].invalidName);
    }
    user.other_registrations[user.other_registrations.length - 1].name = text;
    user.current_other_reg_index = user.other_registrations.length - 1;
    await user.save();
    user.step = 'email_other';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askEmail_other);
  }

  if (user.step === 'email_other') {
    if (!validator.isEmail(text)) {
      return ctx.reply(langText[lang].invalidEmail);
    }
    user.other_registrations[user.other_registrations.length - 1].email = text;
    await user.save();
    user.step = 'location_other';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askLocation_other);
  }

  if (user.step === 'location_other') {
    user.other_registrations[user.other_registrations.length - 1].location = text;
    await user.save();
    user.step = 'phone_other';
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    return ctx.reply(langText[lang].askPhone_other);
  }

  if (user.step === 'phone_other') {
    if (!/^09\d{8}$/.test(text)) {
      return ctx.reply(langText[lang].invalidPhone);
    }
    user.other_registrations[user.other_registrations.length - 1].phone = text;

    // Generate and send invite link immediately
    const newReg = user.other_registrations[user.other_registrations.length - 1];
    const claimToken = crypto.randomBytes(16).toString('hex');
    newReg.claim_token = claimToken;
    await user.save();

    // Delay sending the invite link by 2 minutes
    setTimeout(async () => {
      const botInfo = await ctx.telegram.getMe();
      const inviteLink = `https://t.me/${botInfo.username}?start=${claimToken}`;
      const inviteMessage = `✅ Registration details for *${newReg.name}* are saved!\n\nPlease forward this special invitation link to them so they can join the bot:\n\n${inviteLink}`;
      await ctx.reply(inviteMessage, { parse_mode: 'Markdown' });
    }, 120000);

    user.step = 'payment_other';
    user.other_registrations[user.other_registrations.length - 1].payment_pending_since = new Date();
    await user.save();
    setUserTimeout(ctx.telegram, chatId, lang);
    ctx.reply(langText[lang].accountNumber);
    return ctx.reply(langText[lang].askPayment);
  }

  // Feeling Steps
  if (user.step === 'feeling_before') {
    user.feeling_before = text;
    user.step = null;
    await user.save();
    return ctx.reply(langText[lang].feelingSaved, generateMainMenuKeyboard(lang, user));
  }

  if (user.step === 'feeling_after') {
    user.feeling_after = text;
    user.step = null;
    await user.save();
    return ctx.reply(langText[lang].feelingSaved, generateMainMenuKeyboard(lang, user));
  }

  if (text === 'Cancel') {
    user.step = null;
    if (user.other_registrations && user.other_registrations.length > 0) {
      const lastReg = user.other_registrations[user.other_registrations.length - 1];
      if (!lastReg.phone) {
        user.other_registrations.pop();
      }
    }
    await user.save();
    return ctx.reply(
      langText[lang].welcome, 
      { 
        ...generateMainMenuKeyboard(lang, user), 
        parse_mode: 'Markdown' 
      }
    );
  }

  // Handle profile edits
  if (user.step === 'edit_name') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return ctx.reply(langText[lang].invalidName);
    }
    user.name = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return ctx.reply(updatedProfileInfo, { 
      parse_mode: 'Markdown', 
      reply_markup: profileKeyboard(lang, user) 
    });
  }

  if (user.step === 'edit_email') {
    if (!validator.isEmail(text)) {
      return ctx.reply(langText[lang].invalidEmail);
    }
    user.email = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return ctx.reply(updatedProfileInfo, { 
      parse_mode: 'Markdown', 
      reply_markup: profileKeyboard(lang, user) 
    });
  }

  if (user.step === 'edit_phone') {
    if (!/^09\d{8}$/.test(text)) {
      return ctx.reply(langText[lang].invalidPhone);
    }
    user.phone = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return ctx.reply(updatedProfileInfo, { 
      parse_mode: 'Markdown', 
      reply_markup: profileKeyboard(lang, user) 
    });
  }

  if (user.step === 'edit_location') {
    user.location = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return ctx.reply(updatedProfileInfo, { 
      parse_mode: 'Markdown', 
      reply_markup: profileKeyboard(lang, user) 
    });
  }

  // Default response
  ctx.reply(
    langText[lang].welcome, 
    { 
      ...generateMainMenuKeyboard(lang, user), 
      parse_mode: 'Markdown' 
    }
  );
}

module.exports = {
  handleStart,
  handleMessage
};