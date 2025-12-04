const User = require('../../models/User');
const langText = require('../../languages/translations');
const { generateMainMenuKeyboard } = require('../utils/keyboards');
const { clearUserTimeout } = require('../utils/helpers');
const { GROUP_LINK } = require('../../config/constants');
const crypto = require('crypto');

async function approveUser(botInstance, userId, adminChatId) {
  try {
    const targetUser = await User.findOne({ chatId: userId });
    if (targetUser && targetUser.payment && !targetUser.approved) {
      targetUser.approved = true;
      targetUser.step = null;

      await targetUser.save();
      const userLang = targetUser.lang || 'en';
      await botInstance.sendMessage(userId, langText[userLang].paymentSuccess, generateMainMenuKeyboard(userLang, targetUser));
      await botInstance.sendMessage(adminChatId, `✅ Payment for ${targetUser.name} (${userId}) has been approved.`);

      // Send the group invitation link after a 30-second delay
      setTimeout(async () => {
        const joinGroupKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: langText[userLang].joinGroup, url: GROUP_LINK }]
            ]
          }
        };
        await botInstance.sendMessage(userId, langText[userLang].joinGroupSuccess, joinGroupKeyboard);
      }, 30000); // 30 seconds

      // Notify inviter if applicable
      if (targetUser.invited_by_chatId) {
        const inviter = await User.findOne({ chatId: targetUser.invited_by_chatId });
        if (inviter) {
          const inviterLang = inviter.lang || 'en';
          await botInstance.sendMessage(inviter.chatId, langText[inviterLang].friendApproved(targetUser.name));
        }
      }
    } else {
      botInstance.sendMessage(adminChatId, langText.en.invalidApprove);
    }
  } catch (error) {
    console.error('Error in /approve:', error);
    botInstance.sendMessage(adminChatId, 'An error occurred while approving.');
  }
}

async function declineUser(botInstance, userId, adminChatId) {
  try {
    const targetUser = await User.findOne({ chatId: userId });
    if (targetUser && targetUser.payment && !targetUser.approved) {
      targetUser.payment = null; // Clear payment to allow re-upload
      targetUser.step = 'payment'; // Set user back to payment step
      await targetUser.save();

      const userLang = targetUser.lang || 'en';
      await botInstance.sendMessage(userId, langText[userLang].paymentDeclined);
      await botInstance.sendMessage(userId, langText[userLang].accountNumber);
      await botInstance.sendMessage(userId, langText[userLang].askPayment);
      await botInstance.sendMessage(adminChatId, `Payment for ${targetUser.name} (${userId}) declined. User has been asked to re-upload.`);
    } else {
      botInstance.sendMessage(adminChatId, 'Invalid user or no pending payment to decline.');
    }
  } catch (error) {
    console.error('Error in /decline:', error);
    botInstance.sendMessage(adminChatId, 'An error occurred while declining.');
  }
}

async function approveOtherUser(botInstance, userId, regIndex, adminChatId) {
  const targetUser = await User.findOne({ chatId: userId });
  const otherReg = targetUser?.other_registrations?.[regIndex];

  if (otherReg && otherReg.payment && !otherReg.approved) {
    otherReg.approved = true;
    await targetUser.save();

    const userLang = targetUser.lang || 'en';
    await botInstance.sendMessage(userId, langText[userLang].friendApproved(otherReg.name));
    botInstance.sendMessage(adminChatId, `✅ Payment for "${otherReg.name}" (registered by ${targetUser.name}) has been approved.`);

    // Send the group invitation link to the registrar after a 30-second delay
    setTimeout(async () => {
      const joinGroupKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: langText[userLang].joinGroup, url: GROUP_LINK }]
          ]
        }
      };
      await botInstance.sendMessage(userId, `You can now share the group link with *${otherReg.name}*!`, { parse_mode: 'Markdown', ...joinGroupKeyboard });
    }, 30000); // 30 seconds
  } else {
    botInstance.sendMessage(adminChatId, 'Invalid registration or payment already approved.');
  }
}

async function declineOtherUser(botInstance, userId, regIndex, adminChatId) {
  const targetUser = await User.findOne({ chatId: userId });
  const otherReg = targetUser?.other_registrations?.[regIndex];

  if (otherReg && otherReg.payment && !otherReg.approved) {
    otherReg.payment = null; // Clear the incorrect payment so they can re-upload
    await targetUser.save();
    const userLang = targetUser.lang || 'en';

    // Set user to the correct step to re-upload for the other person
    targetUser.step = 'payment_other';
    targetUser.current_other_reg_index = regIndex;
    await targetUser.save();

    await botInstance.sendMessage(userId, langText[userLang].friendDeclined(otherReg.name));
    await botInstance.sendMessage(userId, `⚠️ The payment for *${otherReg.name}* was declined. Please upload a correct payment screenshot on their behalf.`, { parse_mode: 'Markdown' });
    await botInstance.sendMessage(userId, langText.en.accountNumber);
    await botInstance.sendMessage(userId, `Please upload the payment screenshot for ${otherReg.name}:`);
    botInstance.sendMessage(adminChatId, `Payment for "${otherReg.name}" declined. User ${userId} has been asked to re-upload.`);
  } else {
    botInstance.sendMessage(adminChatId, 'Invalid registration or no pending payment to decline.');
  }
}

async function handleDeleteUser(botInstance, userIdToDelete, adminChatId) {
  try {
    const userToDelete = await User.findOne({ chatId: userIdToDelete });

    if (!userToDelete) {
      return botInstance.sendMessage(adminChatId, `❌ User with ID \`${userIdToDelete}\` not found.`, { parse_mode: 'Markdown' });
    }

    // Notify the user their data is being deleted.
    try {
      const userLang = userToDelete.lang || 'en';
      await botInstance.sendMessage(userIdToDelete, langText[userLang].dataDeletedNotification);
    } catch (error) {
      console.log(`Could not notify user ${userIdToDelete} about data deletion. They may have blocked the bot.`);
    }

    // Delete the user's document from the database
    await User.deleteOne({ chatId: userIdToDelete });

    return botInstance.sendMessage(adminChatId, `✅ Successfully deleted all data for user \`${userIdToDelete}\`.`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return botInstance.sendMessage(adminChatId, '❌ An error occurred while trying to delete the user.', { parse_mode: 'Markdown' });
  }
}

async function handleExportUsers(botInstance, adminChatId) {
  botInstance.sendMessage(adminChatId, '🔄 Generating user export... Please wait.');

  try {
    // Find all users who have at least started registration
    const allUsers = await User.find({ name: { $ne: null } });

    if (allUsers.length === 0) {
      return botInstance.sendMessage(adminChatId, 'No registered users found to export.');
    }

    const csvHeaders = [
      'UserID', 'Name', 'Email', 'Phone', 'Location', 'Status', 'RegisteredBy_ID', 'RegisteredBy_Name', 'FeelingBefore', 'FeelingAfter'
    ];

    const escapeCsv = (field) => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      // If the string contains a comma, double quote, or newline, wrap it in double quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        // Also, double up any existing double quotes
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const getStatus = (reg) => {
      if (reg.approved) return 'Approved';
      if (reg.payment) return 'Pending Approval';
      if (reg.phone) return 'Pending Payment';
      return 'Incomplete';
    };

    const userRows = allUsers.flatMap(user => {
      // Row for the primary user
      const primaryUserRow = [
        user.chatId, user.name, user.email, user.phone, user.location, getStatus(user), 'self', 'self', user.feeling_before, user.feeling_after
      ].map(escapeCsv).join(',');

      // Rows for other people they registered
      const otherUserRows = (user.other_registrations || []).map(otherReg => {
        return [
          otherReg.phone || 'N/A', otherReg.name, otherReg.email, otherReg.phone, otherReg.location, getStatus(otherReg), user.chatId, user.name
        ].map(escapeCsv).join(',');
      });

      return [primaryUserRow, ...otherUserRows];
    });

    const csvContent = [csvHeaders.join(','), ...userRows].join('\n');
    const fileBuffer = Buffer.from(csvContent, 'utf8');

            botInstance.sendDocument(adminChatId, fileBuffer, {}, {
      filename: `user_export_${new Date().toISOString().split('T')[0]}.csv`,
      contentType: 'text/csv'
    });
  } catch (error) {
    console.error('Failed to export users:', error);
            botInstance.sendMessage(adminChatId, '❌ An error occurred while generating the user export.');
          }
}

async function handlePendingPayments(botInstance, adminChatId) {
  botInstance.sendMessage(adminChatId, '🔍 Searching for pending payments...');

  try {
    // Find users with pending payments (for themselves or for others)
    const usersWithPending = await User.find({
      $or: [
        { payment: { $ne: null }, approved: false },
        { 'other_registrations.payment': { $ne: null }, 'other_registrations.approved': false }
      ]
    });

    if (usersWithPending.length === 0) {
      return botInstance.sendMessage(adminChatId, '✅ No pending payments found.');
    }

    let pendingList = [];
    usersWithPending.forEach(user => {
      // Check the main user's payment
      if (user.payment && !user.approved) {
        pendingList.push(`*User:* ${user.name} (ID: \`${user.chatId}\`)\n  - To approve, send: \`/approve ${user.chatId}\``);
      }

      // Check payments for others registered by this user
      user.other_registrations.forEach((reg, index) => {
        if (reg.payment && !reg.approved) {
          pendingList.push(`*For:* ${reg.name} (Registered by ${user.name})\n  - To approve, send: \`/approve_other ${user.chatId} ${index}\``);
        }
      });
    });

    const message = `*⏳ Pending Payment Approvals*\n\n${pendingList.join('\n\n')}`;
    return botInstance.sendMessage(adminChatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Failed to get pending payments:', error);
    return botInstance.sendMessage(adminChatId, '❌ An error occurred while fetching the pending payments list.');
  }
}

async function handleStats(botInstance, adminChatId) {
  botInstance.sendMessage(adminChatId, '📊 Calculating statistics... Please wait.');

  try {
    const allUsers = await User.find({});

    let totalRegistrations = 0;
    let totalApproved = 0;
    let pendingApproval = 0;
    let incompleteRegistrations = 0;
    const languageCount = { en: 0, am: 0, om: 0, unknown: 0 };

    // --- Calculate Reminders Sent Today ---
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const remindedTodayCount = await User.countDocuments({
      $or: [
        { last_reminder_sent_at: { $gte: startOfToday } },
        { 'other_registrations.last_reminder_sent_at': { $gte: startOfToday } }
      ]
    });
    allUsers.forEach(user => {
      // Count language for primary users
      if (user.lang) languageCount[user.lang]++;
      else if (user.name) languageCount.unknown++;

      // Process primary user registration
      if (user.name) {
        totalRegistrations++;
        if (user.approved) totalApproved++;
        else if (user.payment) pendingApproval++;
        else incompleteRegistrations++;
      }

      // Process other registrations
      if (user.other_registrations) {
        user.other_registrations.forEach(reg => {
          if (reg.name) { // Only count if registration was started
            totalRegistrations++;
            if (reg.approved) totalApproved++;
            else if (reg.payment) pendingApproval++;
            else incompleteRegistrations++;
          }
        });
      }
    });

    const statsMessage = `*📊 Bot Usage Statistics*\n\n` +
      `*Total Registrations:* ${totalRegistrations}\n` +
      `*Approved Users:* ${totalApproved}\n` +
      `*Pending Approval:* ${pendingApproval}\n` +
      `*Reminders Sent Today:* ${remindedTodayCount}\n` +
      `*Incomplete (No Payment):* ${incompleteRegistrations}\n\n` +
      `*Language Breakdown (Primary Users):*\n  - English: ${languageCount.en}\n  - አማርኛ: ${languageCount.am}\n  - Afaan Oromoo: ${languageCount.om}`;

    return botInstance.sendMessage(adminChatId, statsMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Failed to generate stats:', error);
    return botInstance.sendMessage(adminChatId, '❌ An error occurred while generating statistics.');
  }
}

async function handleIncomplete(botInstance, adminChatId) {
  botInstance.sendMessage(adminChatId, '🔍 Searching for incomplete registrations (payment not uploaded)...');

  try {
    // Find any user who is currently in a registration step
    const usersWithIncomplete = await User.find({ step: { $ne: null } });

    if (usersWithIncomplete.length === 0) {
      return botInstance.sendMessage(adminChatId, '✅ No incomplete registrations found.');
    }

    const keyboardButtons = [];
    usersWithIncomplete.forEach(user => {
      let userName = user.name || `User ID: ${user.chatId}`;
      let stepInfo = user.step.replace('_other', ' (for other)');

      // If registering for someone else, identify who
      if (user.step.endsWith('_other')) {
        const regIndex = user.current_other_reg_index ?? user.other_registrations.length - 1;
        const reg = user.other_registrations[regIndex];
        if (reg && reg.name) {
          userName = `${user.name} (for ${reg.name})`;
        }
      }

      keyboardButtons.push([{
        text: `👤 ${userName} | Stuck on: ${stepInfo}`,
        callback_data: `remind_user:${user.chatId}:-1` // Index is no longer needed here
      }]);
    });

    const message = `*📝 Incomplete Registrations*\n\nClick a user to send them a reminder for their current step.`;
    return botInstance.sendMessage(adminChatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboardButtons }
    });
  } catch (error) {
    console.error('Failed to get incomplete registrations:', error);
    return botInstance.sendMessage(adminChatId, '❌ An error occurred while fetching the incomplete registrations list.');
  }
}

async function handleFeelings(botInstance, adminChatId) {
  botInstance.sendMessage(adminChatId, '📝 Generating summary of user feelings...');

  try {
    const usersWithFeelings = await User.find({
      $or: [
        { feeling_before: { $ne: null, $ne: '' } },
        { feeling_after: { $ne: null, $ne: '' } }
      ]
    });

    if (usersWithFeelings.length === 0) {
      return botInstance.sendMessage(adminChatId, 'No user feelings have been submitted yet.');
    }

    const messages = [];
    let currentMessage = '*📝 Summary of User Feelings*\n\n';

    for (const user of usersWithFeelings) {
      const entry = `*User:* ${user.name} (\`${user.chatId}\`)\n` +
        (user.feeling_before ? `*Before:* ${user.feeling_before}\n` : '') +
        (user.feeling_after ? `*After:* ${user.feeling_after}\n` : '') +
        '--------------------\n\n';

      if (currentMessage.length + entry.length > 4096) {
        messages.push(currentMessage);
        currentMessage = '';
      }
      currentMessage += entry;
    }
    messages.push(currentMessage);

    for (const message of messages) {
      await botInstance.sendMessage(adminChatId, message, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Failed to get feelings summary:', error);
    return botInstance.sendMessage(adminChatId, '❌ An error occurred while fetching the feelings summary.');
  }
}

async function handleRemindFeelings(botInstance, adminChatId) {
  botInstance.sendMessage(adminChatId, '🔍 Finding users who need a feeling reminder...');

  try {
    // Find approved users who are missing at least one feeling
    const usersToRemind = await User.find({
      approved: true,
      $or: [
        { feeling_before: null },
        { feeling_after: null }
      ]
    });

    if (usersToRemind.length === 0) {
      return botInstance.sendMessage(adminChatId, '✅ All approved users have submitted their feelings.');
    }

    for (const user of usersToRemind) {
      const buttons = [];
      if (!user.feeling_before) {
        buttons.push({ text: 'Remind Before', callback_data: `remind_feeling:before:${user.chatId}` });
      }
      if (!user.feeling_after) {
        buttons.push({ text: 'Remind After', callback_data: `remind_feeling:after:${user.chatId}` });
      }

      if (buttons.length > 0) {
        await botInstance.sendMessage(adminChatId, `*User:* ${user.name} (\`${user.chatId}\`)`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [buttons] }
        });
      }
    }
  } catch (error) {
    console.error('Failed to get users for feeling reminders:', error);
    return botInstance.sendMessage(adminChatId, '❌ An error occurred while fetching the user list.');
  }
}

async function handleBroadcastMessage(botInstance, messageToSend, adminChatId) {
  // Find all users who have completed at least the name step
  const allUsers = await User.find({ name: { $ne: null } });
  if (allUsers.length === 0) {
    return botInstance.sendMessage(adminChatId, 'No registered users found to broadcast to.');
  }

  botInstance.sendMessage(adminChatId, `🚀 Starting broadcast to ${allUsers.length} users...`);
  let successCount = 0;
  let errorCount = 0;

  for (const target of allUsers) {
    try {
      await botInstance.sendMessage(target.chatId, messageToSend);
      successCount++;
    } catch (error) {
      console.error(`Failed to send message to user ${target.chatId}:`, error.message);
      errorCount++;
    }
  }
  return botInstance.sendMessage(adminChatId, `Broadcast finished.\n\n✅ Successfully sent to: ${successCount} users.\n❌ Failed to send to: ${errorCount} users.`);
}

module.exports = {
  approveUser,
  declineUser,
  approveOtherUser,
  declineOtherUser,
  handleDeleteUser,
  handleExportUsers,
  handlePendingPayments,
  handleStats,
  handleIncomplete,
  handleFeelings,
  handleRemindFeelings,
  handleBroadcastMessage
};