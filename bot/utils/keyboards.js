const langText = require('../../languages/translations');

const profileKeyboard = (lang, user) => {
  const keyboard = [
    [{ text: langText[lang].editName, callback_data: 'edit_name' }],
    [{ text: langText[lang].editEmail, callback_data: 'edit_email' }],
    [{ text: langText[lang].editPhone, callback_data: 'edit_phone' }],
    [{ text: langText[lang].editLocation, callback_data: 'edit_location' }],
  ];

  // Check if there are any registrations that still require a payment to be uploaded.
  const hasOwnPendingPayment = user.name && !user.approved && !user.payment;
  const hasOtherPendingPayments = user.other_registrations?.some(reg => reg.name && !reg.approved && !reg.payment);

  if (hasOwnPendingPayment || hasOtherPendingPayments) {
    keyboard.push([{ text: '💳 Finish Pending Payments', callback_data: 'finish_payments' }]);
  }

  // Check if the user has an incomplete registration step
  if (user.step && user.step !== 'select_lang') {
    keyboard.push([{ text: langText[lang].continueRegistrationButton, callback_data: 'continue_registration' }]);
  }

  return { inline_keyboard: keyboard };
};

// Main menu keyboard
const generateMainMenuKeyboard = (lang, user) => {
  const keyboard = [
    [{ text: '/start' }],
    [{ text: 'Register / መዝግብ' }, { text: langText[lang].helpButton }, { text: langText[lang].myProfileButton }],
    [{ text: 'Join Group / ቡድኑን ይቀላቀሉ' }, { text: langText[lang].contactUsButton }],
    [{ text: langText.en.preRetreatFeeling }, { text: langText.en.postRetreatFeeling }]
  ];

  // If user is in the middle of a registration step, add a "Continue Registration" button
  if (user && user.step && (user.step.includes('_other') || ['name', 'email', 'location', 'phone', 'payment'].includes(user.step))) {
    keyboard.unshift([{ text: langText[lang].continueRegistrationButton }]);
  }

  // Add the change language button if the user is registered
  keyboard.push([{ text: langText[lang].changeLanguageButton }]);

  return {
    reply_markup: { keyboard, resize_keyboard: true, one_time_keyboard: false }
  };
};

module.exports = {
  profileKeyboard,
  generateMainMenuKeyboard
};