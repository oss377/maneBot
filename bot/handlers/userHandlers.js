const User = require('../../models/User');
const langText = require('../../languages/translations');
const { generateMainMenuKeyboard, profileKeyboard } = require('../utils/keyboards');
const { setUserTimeout, clearUserTimeout, displayCurrentStep } = require('../utils/helpers');
const validator = require('validator'); // Keep validator here
const { ADMIN_CHAT_ID, GROUP_LINK } = require('../../config/constants');
const {
  approveUser, declineUser, approveOtherUser, declineOtherUser,
  handleDeleteUser, handleExportUsers, handlePendingPayments, handleStats,
  handleIncomplete, handleFeelings, handleRemindFeelings, handleBroadcastMessage
} = require('./adminHandlers');

async function handleStart(botInstance, msg, match) {
  const chatId = msg.chat.id;
  const payload = match && match[1]; // The claim token from the link

  let user = await User.findOne({ chatId });

  // SCENARIO 1: User clicks a special invitation link
  if (payload) {
    const registrarUser = await User.findOne({ 'other_registrations.claim_token': payload });

    if (registrarUser) {
      const regIndex = registrarUser.other_registrations.findIndex(reg => reg.claim_token === payload);
      const preRegisteredData = registrarUser.other_registrations[regIndex];

      // Check if the registration data actually exists
      if (!preRegisteredData) {
        return botInstance.sendMessage(chatId, 'This invitation link is no longer valid or has already been used.');
      }

      // Ensure the user doesn't already exist with a different chat ID
      const existingClaimedUser = await User.findOne({ phone: preRegisteredData.phone });
      if (existingClaimedUser && existingClaimedUser.chatId !== chatId.toString()) {
        return botInstance.sendMessage(chatId, 'This invitation has already been claimed by another Telegram account.');
      }

      // Create or update the new user's account with the pre-registered data
      const newUser = await User.findOneAndUpdate({ chatId }, {
        name: preRegisteredData.name,
        email: preRegisteredData.email,
        phone: preRegisteredData.phone,
        location: preRegisteredData.location,
        payment: preRegisteredData.payment,
        approved: preRegisteredData.approved,
        lang: registrarUser.lang || 'en', // Inherit language
        step: null,
        invited_by_chatId: registrarUser.chatId, // <-- Link the new user to their inviter
      }, { upsert: true, new: true });

      // Remove the registration from the original registrar's list
      registrarUser.other_registrations.splice(regIndex, 1);
      await registrarUser.save();

      await botInstance.sendMessage(chatId, `Welcome, ${newUser.name}! You were invited by ${registrarUser.name}.`);
      return botInstance.sendMessage(chatId, langText[newUser.lang].welcomeBackPreRegistered, { ...generateMainMenuKeyboard(newUser.lang, newUser), parse_mode: 'Markdown' });
    }
  }

  // Prioritize language selection for new users or users without a language
  if (!user || !user.lang) {
    // If there's a payload, it means they were invited.
    // In this case, we should process the invitation and set their language from the inviter.
    if (payload) {
      const registrarUser = await User.findOne({ 'other_registrations.claim_token': payload });

      if (registrarUser) {
        const regIndex = registrarUser.other_registrations.findIndex(reg => reg.claim_token === payload);
        const preRegisteredData = registrarUser.other_registrations[regIndex];

        if (!preRegisteredData) {
          return botInstance.sendMessage(chatId, 'This invitation link is no longer valid or has already been used.');
        }

        const existingClaimedUser = await User.findOne({ phone: preRegisteredData.phone });
        if (existingClaimedUser && existingClaimedUser.chatId !== chatId.toString()) {
          return botInstance.sendMessage(chatId, 'This invitation has already been claimed by another Telegram account.');
        }

        // Create or update the new user's account with the pre-registered data and language
        user = await User.findOneAndUpdate({ chatId }, { // Reassign 'user' here
          name: preRegisteredData.name,
          email: preRegisteredData.email,
          phone: preRegisteredData.phone,
          location: preRegisteredData.location,
          payment: preRegisteredData.payment,
          approved: preRegisteredData.approved,
          lang: registrarUser.lang || 'en', // Inherit language
          step: null,
          invited_by_chatId: registrarUser.chatId,
        }, { upsert: true, new: true });

        await botInstance.sendMessage(chatId, `Welcome, ${user.name}! You were invited by ${registrarUser.name}.`);
        return botInstance.sendMessage(chatId, langText[user.lang].welcomeBackPreRegistered, { ...generateMainMenuKeyboard(user.lang, user), parse_mode: 'Markdown' });
      } else {
        // Payload exists but no matching registrarUser found, fall through to normal language selection
        // This means the invite link was bad, so treat as a new user needing language.
      }
    }

    // If no payload, or bad payload, and user has no language, prompt for language
    // Ensure user exists before setting step
    user = await User.findOneAndUpdate({ chatId }, { step: 'select_lang' }, { upsert: true, new: true });
    const langKeyboard = {
      reply_markup: {
        keyboard: [[{ text: 'English' }], [{ text: 'አማርኛ' }], [{ text: 'Afaan Oromoo' }]],
        resize_keyboard: true, one_time_keyboard: true
      }
    };
    return botInstance.sendMessage(chatId, 'Please select your language / እባክዎን ቋንቋ ይምረጡ: / Mee afaan filadhu:', langKeyboard);
  }

  // At this point, 'user' is guaranteed to exist and 'user.lang' is guaranteed to be set.
  const userLang = user.lang;

  // If user has an incomplete registration step, prompt to continue
  if (user.step) {
    // Check if all data is registered but payment is pending
    const isPaymentPendingAfterFullData = user.step === 'payment' &&
      user.name && user.email && user.phone && user.location &&
      !user.payment; // Payment is null

    if (isPaymentPendingAfterFullData) {
      // Send welcome back message with main menu (which will include "Continue Registration" button)
      return botInstance.sendMessage(chatId, langText[userLang].welcomeBackFinishPayment, { ...generateMainMenuKeyboard(userLang, user), parse_mode: 'Markdown' });
    } else {
      // For other incomplete steps (name, email, etc.)
      const continueKeyboard = {
        reply_markup: { inline_keyboard: [[{ text: langText[userLang].continueRegistrationButton, callback_data: 'continue_registration' }]] }
      };
      return botInstance.sendMessage(chatId, langText[userLang].continueRegistrationPrompt, continueKeyboard);
    }
  }

  // User is fully registered, has a language, and no pending step. Display welcome.
  return botInstance.sendMessage(chatId, langText[userLang].welcome, { ...generateMainMenuKeyboard(userLang, user), parse_mode: 'Markdown' });
}

async function handleMessage(botInstance, msg) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : undefined;

  // Clear user timeout when a message is received
  clearUserTimeout(chatId);

  let user = await User.findOne({ chatId });

  // Handle language selection
  if (user && user.step === 'select_lang') {
    if (text === 'English') user.lang = 'en';
    else if (text === 'አማርኛ') user.lang = 'am';
    else if (text === 'Afaan Oromoo') user.lang = 'om';
    else return botInstance.sendMessage(chatId, 'Please select a valid language / እባክዎን ቋንቋ ይምረጡ: / Mee afaan sirrii filadhu:');
    user.step = null; // Clear the step after language selection
    await user.save();
    // Show the detailed registration steps and then the main menu
    await botInstance.sendMessage(chatId, langText[user.lang].registrationSteps, { parse_mode: 'Markdown' });
    return botInstance.sendMessage(chatId, langText[user.lang].welcome, { ...generateMainMenuKeyboard(user.lang, user), parse_mode: 'Markdown' });
  }

  // If user is not found and they didn't type /start, prompt them to start.
  if (!user) {
    return botInstance.sendMessage(chatId, 'Please click /start to begin.');
  }

  const lang = user.lang || 'en';

  // Handle non-text messages (photo for payment)
  if (msg.photo) {
    return handlePhotoUpload(botInstance, msg, user, lang);
  }

  // Handle text messages
  if (text) {
    return handleTextMessage(botInstance, text, chatId, user, lang, msg);
  } else {
    // If the message is not text and not a photo (e.g., sticker, document),
    // we can choose to ignore it or send a message. Ignoring is often best
    // to prevent the bot from seeming noisy.
    return;
  }
}

async function handlePhotoUpload(botInstance, msg, user, lang) {
  const chatId = msg.chat.id;
  const fileId = msg.photo[msg.photo.length - 1].file_id;

  if (user.step === 'payment') {
    user.payment = fileId;
    user.payment_pending_since = null; // Clear pending timestamp
    user.step = null;
    await user.save();
    botInstance.sendMessage(chatId, langText[lang].processingPayment, generateMainMenuKeyboard(lang, user));

    // Inform the user they can register others
    botInstance.sendMessage(chatId, langText[lang].canRegisterOthers);

    // Notify the inviter if this user was invited by someone
    if (user.invited_by_chatId) {
      const inviter = await User.findOne({ chatId: user.invited_by_chatId });
      if (inviter) {
        const inviterLang = inviter.lang || 'en';
        await botInstance.sendMessage(inviter.chatId, langText[inviterLang].friendUploadedPayment(user.name));

        // Check if the inviter has any other pending registrations
        const hasMorePending = inviter.other_registrations.some(reg => reg.name && !reg.payment);
        if (!hasMorePending) {
          await botInstance.sendMessage(inviter.chatId, langText[inviterLang].canRegisterOthers);
        }
      }
    }

    // Notify admin for self-registration
    const caption = `User: ${user.name} (${chatId})\nEmail: ${user.email}\nPhone: ${user.phone}\nLocation: ${user.location}`;
    const adminOptions = {
      caption,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Approve', callback_data: `/approve ${chatId}` }, { text: '❌ Decline', callback_data: `/decline ${chatId}` }]
        ]
      }
    };
    botInstance.sendPhoto(ADMIN_CHAT_ID, fileId, adminOptions);

  } else if (user.step === 'payment_other') {
    // Use the index we saved when the user clicked "Finish Payments"
    // Fallback to the last one if the index isn't set (for direct registration flow)
    const regIndex = user.current_other_reg_index ?? (user.other_registrations.length - 1);
    if (regIndex === null || regIndex === undefined || !user.other_registrations[regIndex]) {
      console.error(`Error: Invalid regIndex for payment_other. User: ${chatId}, Index: ${regIndex}`);
      return botInstance.sendMessage(chatId, 'An error occurred. Could not find the registration to apply payment to. Please contact support.');
    }
    const newReg = user.other_registrations[regIndex];
    newReg.payment = fileId;
    newReg.payment_pending_since = null; // Clear pending timestamp
    newReg.approved = false; // Set approval status
    user.step = null;
    user.current_other_reg_index = null; // Clear the index after use
    await user.save();
    botInstance.sendMessage(chatId, langText[lang].processingPayment, generateMainMenuKeyboard(lang, user));

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
          [{ text: '✅ Approve', callback_data: `/approve_other ${chatId} ${regIndex}` }, { text: '❌ Decline', callback_data: `/decline_other ${chatId} ${regIndex}` }]
        ]
      }
    };
    botInstance.sendPhoto(ADMIN_CHAT_ID, newReg.payment, adminOptions);
  }
}

async function handleTextMessage(botInstance, text, chatId, user, lang, msg) {
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
          return await approveUser(botInstance, userId, chatId);
        }
        if (text.startsWith('/approve_other ')) {
          const parts = text.split(' ');
          const userId = parts[1];
          const regIndex = parseInt(parts[2], 10);
          return await approveOtherUser(botInstance, userId, regIndex, chatId);
        }
        if (text.startsWith('/decline ') && !text.includes('_other')) {
          const parts = text.split(' ');
          const userId = parts[1];
          return await declineUser(botInstance, userId, chatId);
        }
        if (text.startsWith('/decline_other ')) {
          const parts = text.split(' ');
          const userId = parts[1];
          const regIndex = parseInt(parts[2], 10);
          return await declineOtherUser(botInstance, userId, regIndex, chatId);
        }
        if (text.startsWith('/deleteuser ')) {
          const parts = text.split(' ');
          const userIdToDelete = parts[1];
          return await handleDeleteUser(botInstance, userIdToDelete, chatId);
        }
        if (text === '/broadcast') {
          user.step = 'broadcast_message';
          await user.save();
          return botInstance.sendMessage(chatId, 'Please send the message you want to broadcast to all users. Send /cancel to abort.');
        }
        if (text === '/exportusers') {
          return await handleExportUsers(botInstance, chatId);
        }
        if (text === '/pendingpayments') {
          return await handlePendingPayments(botInstance, chatId);
        }
        if (text === '/stats') {
          return await handleStats(botInstance, chatId);
        }
        if (text === '/incomplete') {
          return await handleIncomplete(botInstance, chatId);
        }
        if (text === '/feelings') {
          return await handleFeelings(botInstance, chatId);
        }
        if (text === '/remindfeelings') {
          return await handleRemindFeelings(botInstance, chatId);
        }
      }
    }
  }

  // Handle broadcast message step for admin
  if (user && user.step === 'broadcast_message' && chatId.toString() === ADMIN_CHAT_ID) {
    if (text === '/cancel') {
      user.step = null;
      await user.save();
      return botInstance.sendMessage(chatId, 'Broadcast cancelled.', generateMainMenuKeyboard(lang, user));
    }
    await handleBroadcastMessage(botInstance, text, chatId);
    user.step = null;
    await user.save();
    return; // Explicitly return to stop further processing
  }

  // Main menu buttons
  if (text === langText[lang].helpButton) {
    let helpMessage = langText[lang].help;
    if (chatId.toString() === ADMIN_CHAT_ID) {
      // The old admin help text was removed, so we'll use the new one.
      helpMessage += `\n\n${langText[lang].help_admin_commands}`;
    }
    return botInstance.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  if (text === langText[lang].contactUsButton) {
    return botInstance.sendMessage(chatId, langText[lang].contactUs, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }

  if (text === 'Register / መዝግብ') {
    // Check for an incomplete step first
    if (user.step) {
      // If the user is in the middle of a step, prompt them to continue.
      const continueKeyboard = {
        reply_markup: { inline_keyboard: [[{ text: langText[lang].continueRegistrationButton, callback_data: 'continue_registration' }]] }
      };
      return botInstance.sendMessage(chatId, langText[lang].continueRegistrationPrompt, continueKeyboard);
    } else if (user.name) {
      // If they are not in a step but are already registered, ask to register another.
      const registerAnotherKeyboard = {
        reply_markup: {
          keyboard: [[{ text: langText[lang].registerAnother }], [{ text: 'Cancel' }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };
      return botInstance.sendMessage(chatId, langText[lang].alreadyRegistered, registerAnotherKeyboard);
    }
    // If they have no step and no name, start a new registration.
    user.step = 'name';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askName, { reply_markup: { remove_keyboard: true } });
  }

  if (text === langText.en.preRetreatFeeling) {
    user.step = 'feeling_before';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askPreRetreatFeeling, { reply_markup: { remove_keyboard: true } });
  }

  if (text === langText.en.postRetreatFeeling) {
    user.step = 'feeling_after';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askPostRetreatFeeling, { reply_markup: { remove_keyboard: true } });
  }

  // Handle 'Back' button when user is stuck
  if (text === 'Back') {
    // Re-display the current step instead of just going to the main menu
    return displayCurrentStep(botInstance, chatId, user, lang);
  }

  if (text === langText[lang].changeLanguageButton) {
    user.step = 'select_lang';
    await user.save();
    const langKeyboard = {
      reply_markup: {
        keyboard: [[{ text: 'English' }], [{ text: 'አማርኛ' }], [{ text: 'Afaan Oromoo' }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
    return botInstance.sendMessage(chatId, langText[lang].selectLanguagePrompt, langKeyboard);
  }


  if (text === langText[lang].myProfileButton) {
    if (user?.name) {
      // Determine user's own payment status and add it to the profile message
      let ownStatus = '';
      if (user.approved) {
        ownStatus = langText[lang].statusApproved;
      } else if (user.payment) {
        ownStatus = langText[lang].statusPending;
      } else if (user.name) { // They have started registration but not paid
        ownStatus = langText[lang].statusAwaitingPayment;
      }

      const profileInfo = `${langText[lang].profileTitle}\n\n` +
        `${langText[lang].profileDetails(user)}\n` +
        `*${langText[lang].statusLabel}:* ${ownStatus}`;
      const options = {
        parse_mode: 'Markdown',
        reply_markup: profileKeyboard(lang, user)
      };
      botInstance.sendMessage(chatId, profileInfo, options);

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
          botInstance.sendMessage(chatId, `${otherProfileInfo}\n*Status:* ${status}`, { parse_mode: 'Markdown' });
        });
      }
      return; // <-- This was the fix. It stops the function from falling through to the default welcome message.
    } else {
      return botInstance.sendMessage(chatId, langText[lang].notRegistered, generateMainMenuKeyboard(lang, user));
    }
  }

  if (text === 'Join Group / ቡድኑን ይቀላቀሉ') {
    if (user.approved) {
      const joinGroupKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: langText[lang].joinGroup, url: GROUP_LINK || 'https://t.me/your_group_link' }]
          ]
        }
      };
      return botInstance.sendMessage(chatId, langText[lang].joinGroupSuccess, joinGroupKeyboard);
    } else if (user.name && !user.payment) { // Registered but hasn't uploaded payment
      user.step = 'payment'; // Ensure the user is in the correct step
      await user.save();
      setUserTimeout(botInstance, chatId, lang);
      botInstance.sendMessage(chatId, langText[lang].accountNumber);
      return botInstance.sendMessage(chatId, langText[lang].askPayment);
    } else if (user.payment && !user.approved) {
      return botInstance.sendMessage(chatId, langText[lang].waitForApproval, generateMainMenuKeyboard(lang, user));
    } else {
      return botInstance.sendMessage(chatId, langText[lang].joinGroupNotApproved, generateMainMenuKeyboard(lang, user));
    }
  }

  if (text === langText[lang].registerAnother) {
    user.step = 'name_other';
    if (!user.other_registrations) {
      user.other_registrations = [];
    }
    // This just adds an empty object to start the process. It will be saved later.
    user.other_registrations.push({}); // Add a new empty object for the new registration
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askName_other, { reply_markup: { remove_keyboard: true } });
  }

  // Handle "Continue Registration" from the main menu keyboard
  if (text === langText[lang].continueRegistrationButton) {
    const step = user.step;
    if (!step) {
      // This case should be rare since the button only shows when user.step exists, but it's good practice.
      return botInstance.sendMessage(chatId, 'You have no pending registration steps.', generateMainMenuKeyboard(lang, user));
    }

    // The `user.step` from the database is the most reliable source of truth.
    const stepToDisplay = user.step;
    console.log(`Continue registration (main menu): Displaying step '${stepToDisplay}'`);
    return displayCurrentStep(botInstance, chatId, user, lang, stepToDisplay);
  }

  // Registration steps
  if (user.step === 'name') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return botInstance.sendMessage(chatId, langText[lang].invalidName);
    }
    user.name = text;
    user.step = 'email';
    await user.save();
    const emailPromptOptions = {
      reply_markup: {
        input_field_placeholder: 'example@email.com'
      }
    };
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askEmail, emailPromptOptions);
  }

  if (user.step === 'email') {
    let finalEmail = text;

    // If user clicks a suggestion (e.g., '@gmail.com') and we have a partial email stored
    if (text.startsWith('@') && user.partial_email) {
      finalEmail = user.partial_email + text;
    }

    if (!validator.isEmail(finalEmail)) {
      // If it's still not a valid email, store it as a partial and re-prompt with a reply keyboard
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
      setUserTimeout(botInstance, chatId, lang);
      return botInstance.sendMessage(chatId, langText[lang].invalidEmail, emailReplyKeyboard);
    }
    user.email = finalEmail;
    await user.save();
    // The user.partial_email is a temporary field in the live object, not in the schema, so we just delete it.
    delete user.partial_email; // Clean up temporary storage
    user.step = 'location';
    await user.save(); // <-- This was the missing line
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askLocation, { reply_markup: { remove_keyboard: true } });
  }

  if (user.step === 'location') {
    user.location = text;
    user.step = 'phone';
    await user.save();
    const phonePromptOptions = {
      reply_markup: {
        remove_keyboard: true,
        input_field_placeholder: '0911223344'
      }
    };
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askPhone, phonePromptOptions);
  }

  if (user.step === 'phone') {
    if (!/^09\d{8}$/.test(text)) {
      return botInstance.sendMessage(chatId, langText[lang].invalidPhone);
    }
    user.phone = text;
    await user.save();
    user.step = 'payment';
    user.payment_pending_since = new Date(); // Set timestamp for reminder
    await user.save(); // <-- This was the missing line
    setUserTimeout(botInstance, chatId, lang);
    botInstance.sendMessage(chatId, langText[lang].accountNumber);
    return botInstance.sendMessage(chatId, langText[lang].askPayment);
  }

  // "Register Another" Steps
  if (user.step === 'name_other') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return botInstance.sendMessage(chatId, langText[lang].invalidName);
    }
    user.other_registrations[user.other_registrations.length - 1].name = text;
    user.current_other_reg_index = user.other_registrations.length - 1; // Set the index for the current registration
    await user.save();
    user.step = 'email_other';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askEmail_other);
  }

  if (user.step === 'email_other') {
    if (!validator.isEmail(text)) {
      return botInstance.sendMessage(chatId, langText[lang].invalidEmail);
    }
    user.other_registrations[user.other_registrations.length - 1].email = text;
    await user.save();
    user.step = 'location_other';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askLocation_other);
  }

  if (user.step === 'location_other') {
    user.other_registrations[user.other_registrations.length - 1].location = text;
    await user.save();
    user.step = 'phone_other';
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    return botInstance.sendMessage(chatId, langText[lang].askPhone_other);
  }

  if (user.step === 'phone_other') {
    if (!/^09\d{8}$/.test(text)) {
      return botInstance.sendMessage(chatId, langText[lang].invalidPhone);
    }
    user.other_registrations[user.other_registrations.length - 1].phone = text;

    // Generate and send invite link immediately
    const newReg = user.other_registrations[user.other_registrations.length - 1];
    const claimToken = require('crypto').randomBytes(16).toString('hex');
    newReg.claim_token = claimToken;
    await user.save(); // Save the token first

    // Delay sending the invite link by 2 minutes
    setTimeout(async () => {
      const botInfo = await botInstance.getMe();
      const inviteLink = `https://t.me/${botInfo.username}?start=${claimToken}`;
      const inviteMessage = `✅ Registration details for *${newReg.name}* are saved!\n\nPlease forward this special invitation link to them so they can join the bot:\n\n${inviteLink}`;
      await botInstance.sendMessage(chatId, inviteMessage, { parse_mode: 'Markdown' });
    }, 120000); // 120,000 milliseconds = 2 minutes

    user.step = 'payment_other';
    user.other_registrations[user.other_registrations.length - 1].payment_pending_since = new Date(); // Set timestamp
    await user.save();
    setUserTimeout(botInstance, chatId, lang);
    botInstance.sendMessage(chatId, langText[lang].accountNumber);
    return botInstance.sendMessage(chatId, langText[lang].askPayment);
  }

  // Feeling Steps
  if (user.step === 'feeling_before') {
    user.feeling_before = text;
    user.step = null;
    await user.save();
    return botInstance.sendMessage(chatId, langText[lang].feelingSaved, generateMainMenuKeyboard(lang, user));
  }

  if (user.step === 'feeling_after') {
    user.feeling_after = text;
    user.step = null;
    await user.save();
    return botInstance.sendMessage(chatId, langText[lang].feelingSaved, generateMainMenuKeyboard(lang, user));
  }

  if (text === 'Cancel') {
    user.step = null;
    // If the cancel happens during an "other" registration, remove the incomplete entry
    if (user.other_registrations && user.other_registrations.length > 0) {
      const lastReg = user.other_registrations[user.other_registrations.length - 1];
      // If the last entry is incomplete (e.g., missing a phone number), remove it
      if (!lastReg.phone) {
        user.other_registrations.pop();
      }
    }
    await user.save();
    return botInstance.sendMessage(chatId, langText[lang].welcome, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });
  }

  // Handle profile edits
  if (user.step === 'edit_name') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return botInstance.sendMessage(chatId, langText[lang].invalidName);
    }
    user.name = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return botInstance.sendMessage(chatId, updatedProfileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }

  if (user.step === 'edit_email') {
    if (!validator.isEmail(text)) {
      return botInstance.sendMessage(chatId, langText[lang].invalidEmail);
    }
    user.email = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return botInstance.sendMessage(chatId, updatedProfileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }

  if (user.step === 'edit_phone') {
    if (!/^09\d{8}$/.test(text)) {
      return botInstance.sendMessage(chatId, langText[lang].invalidPhone);
    }
    user.phone = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return botInstance.sendMessage(chatId, updatedProfileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }

  if (user.step === 'edit_location') {
    user.location = text;
    user.step = null;
    await user.save();
    const updatedProfileInfo = `✅ ${langText[lang].updateSuccess}\n\n${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return botInstance.sendMessage(chatId, updatedProfileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }

  // Default response
  botInstance.sendMessage(chatId, langText[lang].welcome, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });
}

module.exports = {
  handleStart,
  handleMessage
};