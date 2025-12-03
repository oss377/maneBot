require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const validator = require('validator');
const { connectDB } = require('./db.js');
const User = require('./models/User.js');

const token = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 8000;
const SECRET_TOKEN = process.env.SECRET_TOKEN || 'mySecret123';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'YOUR_ADMIN_CHAT_ID';
const GROUP_LINK = process.env.GROUP_LINK || 'https://t.me/your_group_link';

if (!token) {
  console.error('BOT_TOKEN not found in .env');
  process.exit(1);
}

// Express app
const app = express();
app.use(bodyParser.json());

// Telegram bot
const bot = new TelegramBot(token);

// Webhook path
const webhookPath = '/webhook';

const langText = {
  en: {
    welcome: `*Welcome!* ✨

This bot helps you register and join our exclusive group. Please select an option from the menu below to begin.`,
    help: `*Welcome to the Help Center!*
*User Commands:*
➡️ */start*: Restarts the bot and allows you to re-select your language.
➡️ *Register / መዝግብ*: Begin the registration process to join our group.
➡️ *Join Group / ቡድኑን ይቀላቀሉ*: Access the group link after your registration is approved.
➡️ *Help / እገዛ*: Shows this help message.
➡️ *Contact Us*: Displays our contact information.`,
    help_admin: `
*Admin Commands:*
➡️ */approve <userId>*: Approves a user's payment.
➡️ */approve_other <userId> <index>*: Approves a payment for a user registered by another.
➡️ */decline <userId>*: Declines a user's payment.
➡️ */decline_other <userId> <index>*: Declines a payment for a user registered by another.
➡️ */broadcast <message>*: Sends a message to all registered users.
➡️ */exportusers*: Exports a CSV file of all registered users.
➡️ */pendingpayments*: Lists all users with pending payment approvals.
➡️ */incomplete*: Lists all registrations that are missing a payment screenshot.
➡️ */stats*: Shows bot usage statistics.
➡️ */deleteuser <userId>*: Deletes all data for a specific user.
➡️ */feelings*: Shows a summary of all submitted user feelings.
➡️ */remindfeelings*: Remind users to submit their feelings.`,
    askName: 'Enter your full name:',
    askEmail: 'Enter your email address:',
    askLocation: 'Please enter your current location (e.g., city, country):',
    askPhone: 'Enter your 10-digit phone number starting with 09 (e.g., 0911223344):',
    registrationComplete: '✅ Registration complete!',
    askPayment: 'Please upload your payment screenshot now:',
    accountNumber: 'Please transfer to this account number: 1000592847366',
    processingPayment: 'We are processing your payment. Waiting for admin approval...',
    paymentSuccess: '✅ Your payment is successfully approved!',
    invalidApprove: 'Invalid user or payment already approved',
    joinGroup: 'Join Group',
    joinGroupSuccess: 'Click the button below to join the group:',
    joinGroupNotApproved: 'Your registration is not yet complete or approved. Please complete the payment or wait for approval.',
    myProfile: 'My Profile / የእኔ መገለጫ',
    profileTitle: '👤 *Your Profile Information*',
    profileDetails: (user) => `*Name:* ${user.name}\n*Email:* ${user.email}\n*Phone:* ${user.phone}\n*Location:* ${user.location}`,
    notRegistered: 'You have not registered yet. Please click "Register / መዝግብ" to begin.',
    editName: '✏️ Edit Name',
    editEmail: '✏️ Edit Email',
    editPhone: '✏️ Edit Phone',
    editLocation: '✏️ Edit Location',
    askNewName: 'Please enter your new full name:',
    askNewEmail: 'Please enter your new email address:',
    askNewPhone: 'Please enter your new phone number:',
    updateSuccess: '✅ Your profile has been updated successfully!',
    invalidName: 'Invalid name. Please enter your full name including your father\'s name (e.g., John Doe).',
    invalidEmail: 'Invalid email. Please enter a valid email address (e.g., user@example.com).',
    invalidPhone: 'Invalid phone number. Please enter a 10-digit number starting with 09 (e.g., 0911223344).',
    otherProfileTitle: '👤 *Registered Friend\'s Profile*',
    statusLabel: 'Status',
    statusApproved: '✅ Approved',
    statusPending: '⏳ Pending Approval',
    statusAwaitingPayment: '⚠️ Awaiting Payment',
    paymentDeclined: '⚠️ Your payment was declined. Please upload the correct payment screenshot after you pay to this number: 1000592847366',
    finishPaymentPrompt: 'You still need to upload your payment screenshot. Please upload it now to complete your registration.',
    waitForApproval: '⏳ Your payment has been submitted and is waiting for admin approval. Please wait.',
    alreadyRegistered: 'You are already registered. You can now register another person if you wish.',
    registerAnother: 'Register Another Person',
    askName_other: 'Enter the full name of the person you want to register:',
    askEmail_other: 'Enter the email address of the person you want to register:',
    askLocation_other: 'Enter the current location of the person you want to register (e.g., city, country):',
    askPhone_other: 'Enter the 10-digit phone number of the person you want to register (e.g., 0911223344):',
    preRetreatFeeling: 'Pre-Retreat Feeling',
    postRetreatFeeling: 'Post-Retreat Feeling',
    askPreRetreatFeeling: 'How are you feeling before the retreat? Please share your thoughts.',
    askPostRetreatFeeling: 'How are you feeling after the retreat? Please share your thoughts.',
    feelingSaved: '✅ Thank you for sharing! Your feedback has been saved.',
    dataDeletedNotification: 'Your data has been permanently deleted from our system by an administrator.',
    canRegisterOthers: 'You can now register family, friends, and others you want to invite by clicking the "Register / መዝግብ" button again.',
    // askToSharePhone: 'Welcome! To get started, please share your phone number so we can check if you have been pre-registered by a friend. You can also skip this step.',
    // phoneNotFound: 'Your phone number was not found in our pre-registration list. Let\'s start a new registration.',
    welcomeBackPreRegistered: 'Welcome! We found your pre-registration from your friend. Your account is now active.',
    friendUploadedPayment: (name) => `🙏 Thank you! Your friend, ${name}, has successfully uploaded their payment.`,
    friendApproved: (name) => `🎉 Great news! The registration for your friend, ${name}, has been approved. They can now join the group.`,
    friendDeclined: (name) => `⚠️ Attention: The payment for your friend, ${name}, was declined. Please coordinate with them to upload a correct payment screenshot.`,
    remindPreRetreatFeeling: '🔔 *Reminder!*\n\nWe would love to hear from you. How are you feeling before the retreat? Please share your thoughts.',
    remindPostRetreatFeeling: '🔔 *Reminder!*\n\nWe hope you had a great time. How are you feeling after the retreat? Please share your thoughts.',
    contactUsButton: '📞 Contact Us',
    contactUs: `*Get in Touch!*\n\nYou can reach us through any of the following channels:\n\n*Phone:* \`+251911223344\`\n*Email:* contact@example.com\n*Telegram Channel:* @YourChannelLink\n*Facebook:* Our Facebook Page`,
    continueRegistrationPrompt: '👋 Welcome back! It looks like you didn\'t finish your registration. Click the button below to continue where you left off.',
    continueRegistrationButton: '➡️ Continue Registration',
    welcomeBackFinishPayment: 'Welcome back! It looks like you\'ve completed your registration details. Please upload your payment to finalize.',
    continueAtStep: (step) => `You left off at the *${step}* step. Let's continue.`,
    stepName: 'Full Name',
    stepEmail: 'Email Address',
    stepLocation: 'Location',
    stepPhone: 'Phone Number',
    stepPayment: 'Payment Screenshot',
    stepNameOther: 'Friend\'s Full Name',
    stepEmailOther: 'Friend\'s Email Address',
    stepLocationOther: 'Friend\'s Location',
    stepPhoneOther: 'Friend\'s Phone Number',
    stepPaymentOther: 'Friend\'s Payment Screenshot',
    registrationSteps: `*How to Register* 📝

Here are the simple steps to complete your registration:

1️⃣ *Enter Your Details*: We'll ask for your full name, email, location, and phone number.
2️⃣ *Submit Payment*: You'll be asked to upload a screenshot of your payment.
3️⃣ *Admin Approval*: Our admin will review your payment.
4️⃣ *Join the Group*: Once approved, you can join the exclusive group!

Click the "Register / መዝግብ" button below to start.`
  },
  am: {
    welcome: `*እንኳን ደህና መጡ!* ✨

ይህ ቦት ለልዩ ቡድናችን እንዲመዘገቡ እና እንዲቀላቀሉ ይረዳዎታል። ለመጀመር እባክዎ ከታች ካለው ምናሌ ውስጥ አንድ አማራጭ ይምረጡ።`,
    help: `*እንኳን ወደ የእገዛ ማዕከል በደህና መጡ!*
*የተጠቃሚ ትዕዛዞች:*
➡️ */start*: ቦቱን እንደገና ያስጀምረዋል እና ቋንቋዎን እንደገና እንዲመርጡ ያስችልዎታል።
➡️ *Register / መዝግብ*: ቡድናችንን ለመቀላቀል የምዝገባ ሂደቱን ይጀምሩ።
➡️ *Join Group / ቡድኑን ይቀላቀሉ*: ምዝገባዎ ከጸደቀ በኋላ የቡድኑን ሊንክ ያግኙ።
➡️ *Help / እገዛ*: ይህን የእገዛ መልእክት ያሳያል።
➡️ *Contact Us*: የእኛን አድራሻ መረጃ ያሳያል።`,
    help_admin: `
*የአስተዳዳሪ ትዕዛዞች:*
➡️ */approve <userId>*: የተጠቃሚን ክፍያ ያጸድቃል።
➡️ */approve_other <userId> <index>*: በሌላ ሰው የተመዘገበን ተጠቃሚ ክፍያ ያጸድቃል።
➡️ */decline <userId>*: የተጠቃሚን ክፍያ ውድቅ ያደርጋል።
➡️ */decline_other <userId> <index>*: በሌላ ሰው የተመዘገበን ተጠቃሚ ክፍያ ውድቅ ያደርጋል።
➡️ */broadcast <message>*: ለሁሉም የተመዘገቡ ተጠቃሚዎች መልእክት ይልካል።
➡️ */exportusers*: የሁሉንም የተመዘገቡ ተጠቃሚዎች የCSV ፋይል ይልካል።
➡️ */pendingpayments*: ክፍያቸው ማጽደቅ የሚጠይቁ ተጠቃሚዎችን ይዘረዝራል።
➡️ */incomplete*: የክፍያ ማስረጃ ያላያያዙ ምዝገባዎችን ይዘረዝራል።
➡️ */stats*: የቦት አጠቃቀም ስታቲስቲክስን ያሳያል።
➡️ */deleteuser <userId>*: የአንድን ተጠቃሚ ሁሉንም መረጃ ሙሉ በሙሉ ይሰርዛል።
➡️ */feelings*: የሁሉንም የገባ የተጠቃሚ ስሜቶች ማጠቃለያ ያሳያል።
➡️ */remindfeelings*: ተጠቃሚዎች ስሜታቸውን እንዲያስገቡ አስታውስ።`,
    askName: 'ሙሉ ስምዎን ያስገቡ፡',
    askEmail: 'ኢሜይል አድራሻዎን ያስገቡ፡',
    askLocation: 'እባክዎ አሁን ያሉበትን ቦታ ያስገቡ (ለምሳሌ፡ ከተማ፣ ሀገር)፡',
    askPhone: 'በ09 የሚጀምር ባለ 10-አሃዝ ስልክ ቁጥርዎን ያስገቡ (ለምሳሌ፡ 0911223344)፡',
    registrationComplete: '✅ የመዝግብ ሂደት ተጠናቋል!',
    askPayment: 'እባክዎን የክፍያ ማስረጃዎን አሁን ይጫኑ፡',
    accountNumber: 'እባክዎን ወደ ዚህ ቁጥር ይከፍሉ: 1000592847366',
    processingPayment: 'ክፍያዎ በማስተካከል ላይ ነው። እባክዎን እስካለ አስተዳደር ማረጋገጫ ይጠብቁ።',
    paymentSuccess: '✅ ክፍያዎ በተሳካ ሁኔታ ጸድቋል!',
    invalidApprove: 'የተሳሳተ ተጠቃሚ ወይም ክፍያ ከዚህ በፊት ተፈቅዷል',
    joinGroup: 'ቡድኑን ይቀላቀሉ',
    joinGroupSuccess: 'ቡድኑን ለመቀላቀል ከታች ያለውን ቁልፍ ይጫኑ፡',
    joinGroupNotApproved: 'ምዝገባዎ ገና አልተጠናቀቀም ወይም አልጸደቀም። እባክዎ ክፍያውን ያጠናቅቁ ወይም ይሁንታን ይጠብቁ።',
    myProfile: 'My Profile / የእኔ መገለጫ',
    profileTitle: '👤 *የእርስዎ መገለጫ መረጃ*',
    profileDetails: (user) => `*ስም:* ${user.name}\n*ኢሜል:* ${user.email}\n*ስልክ:* ${user.phone}\n*ቦታ:* ${user.location}`,
    notRegistered: 'እስካሁን አልተመዘገቡም። ለመጀመር እባክዎ "Register / መዝግብ" የሚለውን ይጫኑ።',
    editName: '✏️ ስም ይቀይሩ',
    editEmail: '✏️ ኢሜል ይቀይሩ',
    editPhone: '✏️ ስልክ ይቀይሩ',
    editLocation: '✏️ ቦታ ይቀይሩ',
    askNewName: 'እባክዎ አዲሱን ሙሉ ስምዎን ያስገቡ፡',
    askNewEmail: 'እባክዎ አዲሱን ኢሜል አድራሻዎን ያስገቡ፡',
    askNewPhone: 'እባክዎ አዲሱን ስልክ ቁጥርዎን ያስገቡ፡',
    updateSuccess: '✅ የእርስዎ መገለጫ በተሳካ ሁኔታ ተዘምኗል!',
    invalidName: 'የተሳሳተ ስም። እባክዎ የአባትዎን ስም ጨምሮ ሙሉ ስምዎን ያስገቡ (ለምሳሌ፡ አለሙ ከበደ)።',
    invalidEmail: 'የተሳሳተ ኢሜል። እባкዎ ትክክለኛ የኢሜል አድራሻ ያስገቡ (ለምሳሌ፡ user@example.com)።',
    invalidPhone: 'የተሳሳተ ስልክ ቁጥር። እባክዎ በ09 የሚጀምር ባለ 10-አሃዝ ቁጥር ያስገቡ (ለምሳሌ፡ 0911223344)።',
    otherProfileTitle: '👤 *የጓደኛ መገለጫ*',
    statusLabel: 'ሁኔታ',
    statusApproved: '✅ ጸድቋል',
    statusPending: '⏳ ይሁንታ በመጠባበቅ ላይ',
    statusAwaitingPayment: '⚠️ ክፍያ በመጠባበቅ ላይ',
    paymentDeclined: '⚠️ ክፍያዎ ተቀባይነት አላገኘም። እባክዎ ወደዚህ ቁጥር ከከፈሉ በኋላ ትክክለኛውን የክፍያ ማስረጃ ይጫኑ: 1000592847366',
    finishPaymentPrompt: 'ምዝገባዎን ለማጠናቀቅ አሁንም የክፍያ ቅጽበታዊ ገጽ እይታዎን መስቀል ያስፈልግዎታል። እባክዎ አሁን ይስቀሉት።',
    waitForApproval: '⏳ ክፍያዎ ገብቷል እና የአስተዳዳሪ ይሁንታ በመጠባበቅ ላይ ነው። እባክዎ ይጠብቁ።',
    alreadyRegistered: 'እርስዎ አስቀድመው ተመዝግበዋል። አሁን ከፈለጉ ሌላ ሰው መመዝገብ ይችላሉ።',
    registerAnother: 'ሌላ ሰው ይመዝግቡ',
    askName_other: 'ሊመዘግቡት የሚፈልጉትን ሰው ሙሉ ስም ያስገቡ፡',
    askEmail_other: 'ሊመዘግቡት የሚፈልጉትን ሰው የኢሜል አድራሻ ያስገቡ፡',
    askLocation_other: 'ሊመዘግቡት የሚፈልጉትን ሰው አሁን ያለበትን ቦታ ያስገቡ (ለምሳሌ፡ ከተማ፣ ሀገር)፡',
    askPhone_other: 'ሊመዘግቡት የሚፈልጉትን ሰው በ09 የሚጀምር ባለ 10-አሃዝ ስልክ ቁጥር ያስገቡ (ለምሳሌ፡ 0911223344)፡',
    preRetreatFeeling: 'ከስልጠናው በፊት ያለ ስሜት',
    postRetreatFeeling: 'ከስልጠናው በኋላ ያለ ስሜት',
    askPreRetreatFeeling: 'ከስልጠናው በፊት ምን ይሰማዎታል? እባክዎ ሀሳብዎን ያካፍሉ።',
    askPostRetreatFeeling: 'ከስልጠናው በኋላ ምን ይሰማዎታል? እባክዎ ሀሳብዎን ያካፍሉ።',
    feelingSaved: '✅ ስላካፈሉን እናመሰግናለን! አስተያየትዎ ተመዝግቧል።',
    dataDeletedNotification: 'የእርስዎ መረጃ በአስተዳዳሪ ከሲስተማችን በቋሚነት ተሰርዟል።',
    canRegisterOthers: 'አሁን "Register / መዝግብ" የሚለውን ቁልፍ እንደገና በመጫን ቤተሰብዎን፣ ጓደኞችዎን እና ሌሎች ሊጋብዟቸው የሚፈልጓቸውን ሰዎች መመዝገብ ይችላሉ።',
    // askToSharePhone: 'እንኳን ደህና መጡ! ለመጀመር፣ እባክዎ በጓደኛዎ አስቀድመው መመዝገብዎን ለማረጋገጥ ስልክ ቁጥርዎን ያጋሩ። ይህን ደረጃ መዝለልም ይችላሉ።',
    // phoneNotFound: 'ስልክ ቁጥርዎ በቅድመ-ምዝገባ ዝርዝራችን ውስጥ አልተገኘም። አዲስ ምዝገባ እንጀምር።',
    welcomeBackPreRegistered: 'እንኳን ደህና መጡ! ከጓደኛዎ የተላከውን ምዝገባዎን አግኝተናል። መለያዎ አሁን ገቢር ሆኗል።',
    friendUploadedPayment: (name) => `🙏 እናመሰግናለን! ጓደኛዎ, ${name}, ክፍያቸውን በተሳካ ሁኔታ ልከዋል።`,
    friendApproved: (name) => `🎉 ታላቅ ዜና! የጓደኛዎ, ${name}, ምዝገባ ጸድቋል። አሁን ቡድኑን መቀላቀል ይችላሉ።`,
    friendDeclined: (name) => `⚠️ ማሳሰቢያ: የጓደኛዎ, ${name}, ክፍያ ተቀባይነት አላገኘም። እባክዎ ትክክለኛውን የክፍያ ማስረጃ እንዲልኩ ከእነሱ ጋር ይነጋገሩ።`,
    remindPreRetreatFeeling: '🔔 *ማሳሰቢያ!*\n\nከእርስዎ መስማት እንፈልጋለን። ከስልጠናው በፊት ምን ይሰማዎታል? እባክዎ ሀሳብዎን ያካፍሉ።',
    remindPostRetreatFeeling: '🔔 *ማሳሰቢያ!*\n\nጥሩ ጊዜ እንዳሳለፉ ተስፋ እናደርጋለን። ከስልጠናው በኋላ ምን ይሰማዎታል? እባክዎ ሀሳብዎን ያካፍሉ።',
    contactUsButton: '📞 ያግኙን',
    contactUs: `*ሊያገኙን የሚችሉበት መንገድ!*\n\nበሚከተሉት መንገዶች ሊያገኙን ይችላሉ:\n\n*ስልክ:* \`+251911223344\`\n*ኢሜል:* contact@example.com\n*ቴሌግራም ቻናል:* @YourChannelLink\n*ፌስቡክ:* የፌስቡክ ገጻችን`,
    continueRegistrationPrompt: '👋 እንኳን ደህና መጡ! ምዝገባዎን ያላጠናቀቁ ይመስላል። ካቆሙበት ለመቀጠል ከታች ያለውን ቁልፍ ይጫኑ።',
    continueRegistrationButton: '➡️ ምዝገባ ይቀጥሉ',
    welcomeBackFinishPayment: 'እንኳን ደህና መጡ! የምዝገባ ዝርዝሮችዎን ያጠናቀቁ ይመስላል። እባክዎ ምዝገባዎን ለማጠናቀቅ ክፍያዎን ይጫኑ።',
    continueAtStep: (step) => `*${step}* ደረጃ ላይ አቁመዋል። እንቀጥል።`,
    stepName: 'ሙሉ ስም',
    stepEmail: 'ኢሜይል አድራሻ',
    stepLocation: 'ቦታ',
    stepPhone: 'ስልክ ቁጥር',
    stepPayment: 'የክፍያ ማስረጃ',
    stepNameOther: 'የጓደኛ ሙሉ ስም',
    stepEmailOther: 'የጓደኛ ኢሜይል አድራሻ',
    stepLocationOther: 'የጓደኛ ቦታ',
    stepPhoneOther: 'የጓደኛ ስልክ ቁጥር',
    stepPaymentOther: 'የጓደኛ የክፍያ ማስረጃ',
    registrationSteps: `*እንዴት መመዝገብ እንደሚችሉ* 📝

ምዝገባዎን ለማጠናቀቅ ቀላል ደረጃዎች እነሆ፡-

1️⃣ *ዝርዝሮችዎን ያስገቡ*፡ ሙሉ ስምዎን፣ ኢሜልዎን፣ አካባቢዎን እና ስልክ ቁጥርዎን እንጠይቃለን።
2️⃣ *ክፍያ ያስገቡ*፡ የክፍያዎን ቅጽበታዊ ገጽ እይታ እንዲሰቅሉ ይጠየቃሉ።
3️⃣ *የአስተዳዳሪ ማረጋገጫ*፡ አስተዳዳሪያችን ክፍያዎን ይገመግመዋል።
4️⃣ *ቡድኑን ይቀላቀሉ*፡ አንዴ ከጸደቀ፣ ልዩ ቡድኑን መቀላቀል ይችላሉ!

ለመጀመር ከታች ያለውን "Register / መዝግብ" የሚለውን ቁልፍ ይጫኑ።`
  }
,
  om: {
    welcome: `*Baga Nagaan Dhuftan!* ✨

Boottiin kun garee addaa keenyatti akka galmooftanii fi makamtan isin gargaara. Jalqabuuf, mee menuu gadii irraa filannoo tokko filadhaa.`,
    help: `*Gara Giddugala Gargaarsaatti Baga Nagaan Dhuftan!*
*Ajajoota Fayyadamtootaa:*
➡️ */start*: Boottii haaromsa, afaan keessan irra deebiin akka filattan isin taasisa.
➡️ *Register / Galmeessi*: Garee keenyatti makamuuf adeemsa galmee jalqabaa.
➡️ *Join Group / Gareetti Makami*: Erga galmeen keessan mirkanaa'ee booda, linkii garee argadhaa.
➡️ *Help / Gargaarsa*: Ergaa gargaarsaa kana agarsiisa.
➡️ *Contact Us*: Odeeffannoo qunnamtii keenyaa agarsiisa.`,
    help_admin: `
*Ajajoota Adminii:*
➡️ */approve <userId>*: Kaffaltii fayyadamaa mirkaneessa.
➡️ */approve_other <userId> <index>*: Kaffaltii fayyadamaa nama biraan galmaa'eef mirkaneessa.
➡️ */decline <userId>*: Kaffaltii fayyadamaa ni dide.
➡️ */decline_other <userId> <index>*: Kaffaltii fayyadamaa nama biraan galmaa'eef ni dide.
➡️ */broadcast <message>*: Fayyadamtoota galmaa'an hundaaf ergaa erga.
➡️ */exportusers*: Faayilii CSV fayyadamtoota galmaa'an hunda ibsu erga.
➡️ */pendingpayments*: Fayyadamtoota kaffaltii mirkaneessuu barbaadan tarreessa.
➡️ */incomplete*: Galmeewwan ragaa kaffaltii hin qabne tarreessa.
➡️ */stats*: Istaatiksii fayyadama boottichaa agarsiisa.
➡️ */deleteuser <userId>*: Odeeffannoo fayyadamaa tokkoo guutummaatti ni haqa.
➡️ */feelings*: Cuunfaa miira fayyadamtoota galmaa'e hunda agarsiisa.
➡️ */remindfeelings*: Fayyadamtoonni miira isaanii akka galchan yaadachiisi.`,
    askName: 'Maqaa keessan guutuu galchaa:',
    askEmail: 'Teessoo email keessan galchaa:',
    askLocation: 'Mee iddoo amma jirtan galchaa (fkn. magaalaa, biyya):',
    askPhone: 'Lakkofsa bilbilaa keessan kan 10-dijitii fi 09n jalqabu galchaa (fkn. 0911223344):',
    registrationComplete: '✅ Galmeen xumurameera!',
    askPayment: 'Mee amma ragaa kaffaltii keessanii suuraa kaaftanii ergaa:',
    accountNumber: 'Mee lakkofsa herregaa kana irratti kafalaa: 1000592847366',
    processingPayment: 'Kaffaltiin keessan hojjetamaa jira. Mirkanneessa adminii eegaa...',
    paymentSuccess: '✅ Kaffaltiin keessan milkaainaan mirkanaaeera!.',
    invalidApprove: 'Fayyadamaa sirrii hin taane yookiin kaffaltii duraan mirkanaae.',
    joinGroup: 'Gareetti Makami',
    joinGroupSuccess: 'Gareetti makamuuf, linkii armaan gadii cuqaasaa:',
    joinGroupNotApproved: 'Galmeen keessan henüz hin xumuramne yookiin hin mirkanoofne. Mee kaffaltii xumuraa yookiin mirkaneeffama eegaa.',
    myProfile: 'My Profile / Profaayilii Koo',
    profileTitle: '👤 *Odeeffannoo Profaayilii Keessanii*',
    profileDetails: (user) => `*Maqaa:* ${user.name}\n*Email:* ${user.email}\n*Bilbila:* ${user.phone}\n*Iddoo:* ${user.location}`,
    notRegistered: 'Galgmeen hin jiru. Jalqabuuf, mee "Register / Galmeessi" cuqaasaa.',
    editName: '✏️ Maqaa Jijjiiri',
    editEmail: '✏️ Email Jijjiiri',
    editPhone: '✏️ Bilbila Jijjiiri',
    editLocation: '✏️ Iddoo Jijjiiri',
    askNewName: 'Mee maqaa keessan haaraa guutuu galchaa:',
    askNewEmail: 'Mee teessoo email keessan haaraa galchaa:',
    askNewPhone: 'Mee lakkofsa bilbilaa keessan haaraa galchaa:',
    updateSuccess: '✅ Profaayiliin keessan milkaainaan haaromfameera!',
    invalidName: 'Maqaa sirrii hin taane. Mee maqaa abbaa keessanii dabalatee maqaa guutuu galchaa (fkn. Tolasaa Fayisaa).',
    invalidEmail: 'Email sirrii hin taane. Mee teessoo email sirrii galchaa (fkn. user@example.com).',
    invalidPhone: 'Lakkofsa bilbilaa sirrii hin taane. Mee lakkofsa 10 kan 09n jalqabu galchaa (fkn. 0911223344).',
    otherProfileTitle: '👤 *Profaayilii Hiriyyaa Galmaa',
    statusLabel: 'Haala',
    statusApproved: '✅ Mirkanaa eera',
    statusPending: '⏳ Mirkanneessa Eeggachaa Jira',
    statusAwaitingPayment: '⚠️ Kaffaltii Eeggachaa Jira',
    paymentDeclined: '⚠️ Kaffaltiin keessan fudhatama hin arganne. Mee lakkofsa kanatti erga kaffaltan booda ragaa kaffaltii sirrii taeolkaa: 1000592847366',
    finishPaymentPrompt: 'Ammallee suuraa kaffaltii keessanii olkaauu qabdu. Mee galmee keessan xumuruuf amma olkaaaa.',
    waitForApproval: '⏳ Kaffaltiin keessan galmaa ee mirkaneessa adminii eeggachaa jira. Mee eegaa.',
    alreadyRegistered: 'Duraan galmooftaniirtu. Amma yoo barbaaddan nama biraa galmeessuu dandeessu.',
    registerAnother: 'Nama Biraa Galmeessi',
    askName_other: 'Maqaa nama galmeessuu barbaaddanii guutuu galchaa:',
    askEmail_other: 'Teessoo email nama galmeessuu barbaaddanii galchaa:',
    askLocation_other: 'Iddoo amma nama galmeessuu barbaaddanii jiruu galchaa (fkn. magaalaa, biyya):',
    askPhone_other: 'Lakkofsa bilbilaa nama galmeessuu barbaaddanii kan 10-dijitii fi 09n jalqabu galchaa (fkn. 0911223344):',
    preRetreatFeeling: 'Leenjii Dura Miira',
    postRetreatFeeling: 'Leenjii Booda Miira',
    askPreRetreatFeeling: 'Leenjii dura maaltu isinitti dhagaama? Mee yaada keessan nuuf qoodaa.',
    askPostRetreatFeeling: 'Leenjii booda maaltu isinitti dhagaama? Mee yaada keessan nuuf qoodaa.',
    feelingSaved: '✅ Waan nuuf qooddaniif galatoomaa! Yaanni keessan galmaaeera.',
    dataDeletedNotification: 'Odeeffannoon keessan sirna keenya keessaa adminiin yeroo hundumaaf haqameera.',
    canRegisterOthers: 'Amma, maatii, hiriyoota, fi namoota biroo affeeruu barbaaddan galmeessuuf, irra deebiin "Register / Galmeessi" kan jedhu cuqaasuu dandeessu.',
    // askToSharePhone: 'Baga nagaan dhuftan! Jalqabuuf, hiriyaa keessaniin duraan galmaa'uu keessan mirkaneessuuf mee lakkofsa bilbilaa keessan nuuf qoodaa. Tarkaanfii kana bira darbuus ni dandeessu.',
    // phoneNotFound: 'Lakkofsi bilbilaa keessan tarree galmee duraa keenya keessatti hin argamne. Galmee haaraa haa jalqabnu.',
    welcomeBackPreRegistered: 'Baga nagaan dhuftan! Galmee keessan kan hiriyaa keessan irraa arganneerra. Akaawuntiin keessan amma hojiirra ooleera.',
    friendUploadedPayment: (name) => `🙏 Galatoomaa! Hiriyyaan keessan, ${name}, kaffaltii isaanii milkaa'inaan erganiiru.`,
    friendApproved: (name) => `🎉 Oduu gammachiisaa! Galmeen hiriyyaa keessanii, ${name}, mirkanaa'eera. Amma garee keenyatti makamuu danda'u.`,
    friendDeclined: (name) => `⚠️ Hubachiisa: Kaffaltiin hiriyyaa keessanii, ${name}, fudhatama hin arganne. Mee suuraa kaffaltii sirrii ta'e akka ergan isaan waliin mari'adhaa.`,
    remindPreRetreatFeeling: '🔔 *Yaadachiisa!*\n\nYaada keessan dhagauu ni feena. Leenjii dura maaltu isinitti dhagaama? Mee yaada keessan nuuf qoodaa.',
    remindPostRetreatFeeling: '🔔 *Yaadachiisa!*\n\nYeroo gaarii akka dabarsitan abdii qabna. Leenjii booda maaltu isinitti dhagaama? Mee yaada keessan nuuf qoodaa.',
    contactUsButton: '📞 Nu Qunnamaa',
    contactUs: `*Akkaataa Ittiin Nu Qunnamtan!*\n\nKaraalee armaan gadiitiin nu qunnamuu dandeessu:\n\n*Bilbila:* \`+251911223344\`\n*Email:* contact@example.com\n*Chaanaalii Telegramii:* @YourChannelLink\n*Facebook:* Fuula Facebook Keenyaa`,
    continueRegistrationPrompt: '👋 Baga nagaan deebitan! Akkaataa galmee keessanii hin xumurre fakkaata. Bakka dhaabdan irraa itti fufuuf, mee mallattoo armaan gadii tuqaa.',
    continueRegistrationButton: '➡️ Galmee Itti Fufi',
    welcomeBackFinishPayment: 'Baga nagaan deebitan! Odeeffannoo galmee keessanii xumurtaniirtu fakkaata. Mee kaffaltii keessan olkaa.',
    continueAtStep: (step) => `Sadarkaa *${step}* irratti dhaabbatte. Itti fufnaa.`,
    stepName: 'Maqaa Guutuu',
    stepEmail: 'Teessoo Email',
    stepLocation: 'Iddoo',
    stepPhone: 'Lakkofsa Bilbilaa',
    stepPayment: 'Ragaa Kaffaltii',
    stepNameOther: 'Maqaa Guutuu Hiriyyaa',
    stepEmailOther: 'Teessoo Email Hiriyyaa',
    stepLocationOther: 'Iddoo Hiriyyaa',
    stepPhoneOther: 'Lakkofsa Bilbilaa Hiriyyaa',
    stepPaymentOther: 'Ragaa Kaffaltii Hiriyyaa',
    registrationSteps: `*Akkaataa Itti Galmooftan* 📝

Galmee keessan xumuruuf tarkaanfiilee salphaa ta'an kunooti:

1️⃣ *Odeeffannoo Keessan Galchaa*: Maqaa guutuu, email, iddoo, fi lakkoofsa bilbilaa keessan isin gaafanna.
2️⃣ *Kaffaltii Galchaa*: Suuraa ragaa kaffaltii keessanii akka olkaaftan ni gaafatamtu.
3️⃣ *Mirkaneessa Adminii*: Adminiin keenya kaffaltii keessan ni ilaala.
4️⃣ *Gareetti Makami*: Erga mirkanaa'ee booda, garee addaa keenyatti makamuu dandeessu!

Jalqabuuf, mee tuqa "Register / Galmeessi" jedhu cuqaasaa.`
  }
};

const profileKeyboard = (lang, user) => {
  const keyboard = [
    [{ text: langText[lang].editName, callback_data: 'edit_name' }], [{ text: langText[lang].editEmail, callback_data: 'edit_email' }],
    [{ text: langText[lang].editPhone, callback_data: 'edit_phone' }], [{ text: langText[lang].editLocation, callback_data: 'edit_location' }],
  ];

  // Check if there are any registrations that still require a payment to be uploaded.
  const hasOwnPendingPayment = user.name && !user.approved && !user.payment;
  const hasOtherPendingPayments = user.other_registrations?.some(reg => reg.name && !reg.approved && !reg.payment);

  if (hasOwnPendingPayment || hasOtherPendingPayments) {
    keyboard.push([{ text: '💳 Finish Pending Payments', callback_data: 'finish_payments' }]);
  }

  // --- NEW: Check if the user has an incomplete registration step ---
  if (user.step) {
    keyboard.push([{ text: langText[lang].continueRegistrationButton, callback_data: 'continue_registration' }]);
  }

  return { inline_keyboard: keyboard };
};

// Main menu keyboard
const generateMainMenuKeyboard = (lang, user) => {
  const keyboard = [
    [{ text: '/start' }],
    [{ text: 'Register / መዝግብ' }, { text: 'Help / እገዛ' }, { text: 'My Profile / የእኔ መገለጫ' }],
    [{ text: 'Join Group / ቡድኑን ይቀላቀሉ' }, { text: langText[lang].contactUsButton }],
    [{ text: langText.en.preRetreatFeeling }, { text: langText.en.postRetreatFeeling }]
  ];

  // If user is in the middle of a registration step, add a "Continue Registration" button
  if (user && user.step && (user.step.includes('_other') || ['name', 'email', 'location', 'phone', 'payment'].includes(user.step))) {
    keyboard.unshift([{ text: langText[lang].continueRegistrationButton }]);
  }

  return {
    reply_markup: { keyboard, resize_keyboard: true, one_time_keyboard: false }
  };
};

// --- Idle User Timeout Management ---
const userTimeouts = {};

function setUserTimeout(chatId, lang) {
  // Clear any existing timeout for this user to avoid multiple messages
  if (userTimeouts[chatId]) {
    clearTimeout(userTimeouts[chatId]);
  }

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
      // A generic message that fits all languages
      bot.sendMessage(chatId, 'Are you stuck? You can go back to the main menu by clicking the button below.', startKeyboard);
    }
    delete userTimeouts[chatId];
  }, 30000); // 30 seconds
}

// Verify Telegram requests
app.post(webhookPath, (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== SECRET_TOKEN) return res.sendStatus(401);
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Telegram bot hhhhhhh running. Webhook at /webhook');
});

// /start command - language selection
bot.onText(/\/start(?: (.+))?/, async (msg, match) => { // Handles /start and /start <payload>
  const chatId = msg.chat.id;
  const payload = match && match[1]; // The claim token from the link

  let user = await User.findOne({ chatId });

  // SCENARIO 1: User clicks a special invitation link
  if (payload) {
    const registrarUser = await User.findOne({ 'other_registrations.claim_token': payload });

    if (registrarUser) {
      const regIndex = registrarUser.other_registrations.findIndex(reg => reg.claim_token === payload);
      const preRegisteredData = registrarUser.other_registrations[regIndex];

      // --- NEW: Check if the registration data actually exists ---
      if (!preRegisteredData) {
        return bot.sendMessage(chatId, 'This invitation link is no longer valid or has already been used.');
      }

      // Ensure the user doesn't already exist with a different chat ID
      const existingClaimedUser = await User.findOne({ phone: preRegisteredData.phone });
      if (existingClaimedUser && existingClaimedUser.chatId !== chatId.toString()) {
        return bot.sendMessage(chatId, 'This invitation has already been claimed by another Telegram account.');
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

      await bot.sendMessage(chatId, `Welcome, ${newUser.name}! You were invited by ${registrarUser.name}.`);
      return bot.sendMessage(chatId, langText[newUser.lang].welcomeBackPreRegistered, { ...generateMainMenuKeyboard(newUser.lang, newUser), parse_mode: 'Markdown' });
    }
  }

  // --- NEW LOGIC: Prioritize language selection for new users or users without a language ---
  // If user is truly new OR user exists but has no language set
  if (!user || !user.lang) { 
    // If there's a payload, it means they were invited.
    // In this case, we should process the invitation and set their language from the inviter.
    if (payload) {
      const registrarUser = await User.findOne({ 'other_registrations.claim_token': payload });

      if (registrarUser) {
        const regIndex = registrarUser.other_registrations.findIndex(reg => reg.claim_token === payload);
        const preRegisteredData = registrarUser.other_registrations[regIndex];

        if (!preRegisteredData) {
          return bot.sendMessage(chatId, 'This invitation link is no longer valid or has already been used.');
        }

        const existingClaimedUser = await User.findOne({ phone: preRegisteredData.phone });
        if (existingClaimedUser && existingClaimedUser.chatId !== chatId.toString()) {
          return bot.sendMessage(chatId, 'This invitation has already been claimed by another Telegram account.');
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

        await bot.sendMessage(chatId, `Welcome, ${user.name}! You were invited by ${registrarUser.name}.`);
        return bot.sendMessage(chatId, langText[user.lang].welcomeBackPreRegistered, { ...generateMainMenuKeyboard(user.lang, user), parse_mode: 'Markdown' });
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
    return bot.sendMessage(chatId, 'Please select your language / እባክዎን ቋንቋ ይምረጡ: / Mee afaan filadhu:', langKeyboard);
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
      return bot.sendMessage(chatId, langText[userLang].welcomeBackFinishPayment, { ...generateMainMenuKeyboard(userLang, user), parse_mode: 'Markdown' });
    } else {
      // For other incomplete steps (name, email, etc.)
      const continueKeyboard = {
        reply_markup: { inline_keyboard: [[{ text: langText[userLang].continueRegistrationButton, callback_data: 'continue_registration' }]] }
      };
      return bot.sendMessage(chatId, langText[userLang].continueRegistrationPrompt, continueKeyboard);
    }
  }

  // User is fully registered, has a language, and no pending step. Display welcome.
  return bot.sendMessage(chatId, langText[userLang].welcome, { ...generateMainMenuKeyboard(userLang, user), parse_mode: 'Markdown' });
});

// --- HELPER FUNCTION ---
async function displayCurrentStep(bot, chatId, user, lang, stepOverride = null) {
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
      await bot.sendMessage(chatId, langText[lang].accountNumber);
      return bot.sendMessage(chatId, langText[lang].askPayment, generateMainMenuKeyboard(lang, user));
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
      bot.sendMessage(chatId, langText[lang].accountNumber);
      break;
  }
  setUserTimeout(chatId, lang);
  return bot.sendMessage(chatId, promptMessage, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });
}

// --- HELPER FUNCTIONS FOR ADMIN ACTIONS ---
async function approveUser(userId, adminChatId) {
  try {
    const targetUser = await User.findOne({ chatId: userId });
    if (targetUser && targetUser.payment && !targetUser.approved) {
      targetUser.approved = true;
      targetUser.step = null;

      await targetUser.save();
      const userLang = targetUser.lang || 'en'; // Get target user's language
      await bot.sendMessage(userId, langText[userLang].paymentSuccess, generateMainMenuKeyboard(userLang, targetUser));
      await bot.sendMessage(adminChatId, `✅ Payment for ${targetUser.name} (${userId}) has been approved.`); // Confirm to admin

      // Notify inviter if applicable
      if (targetUser.invited_by_chatId) {
        const inviter = await User.findOne({ chatId: targetUser.invited_by_chatId });
        if (inviter) {
          const inviterLang = inviter.lang || 'en';
          await bot.sendMessage(inviter.chatId, langText[inviterLang].friendApproved(targetUser.name));
        }
      }
    } else {
      bot.sendMessage(adminChatId, langText.en.invalidApprove);
    }
  } catch (error) {
    console.error('Error in /approve:', error);
    bot.sendMessage(adminChatId, 'An error occurred while approving.');
  }
}

async function declineUser(userId, adminChatId) {
  try {
    const targetUser = await User.findOne({ chatId: userId });
    if (targetUser && targetUser.payment && !targetUser.approved) {
      targetUser.payment = null; // Clear payment to allow re-upload
      targetUser.step = 'payment'; // Set user back to payment step
      await targetUser.save();

      const userLang = targetUser.lang || 'en';
      await bot.sendMessage(userId, langText[userLang].paymentDeclined);
      await bot.sendMessage(userId, langText[userLang].accountNumber);
      await bot.sendMessage(userId, langText[userLang].askPayment);
      await bot.sendMessage(adminChatId, `Payment for ${targetUser.name} (${userId}) declined. User has been asked to re-upload.`); // Confirm to admin
    } else {
      bot.sendMessage(adminChatId, 'Invalid user or no pending payment to decline.');
    }
  } catch (error) {
    console.error('Error in /decline:', error);
    bot.sendMessage(adminChatId, 'An error occurred while declining.');
  }
}

async function approveOtherUser(userId, regIndex, adminChatId) {
  const targetUser = await User.findOne({ chatId: userId });
  const otherReg = targetUser?.other_registrations?.[regIndex];

  if (otherReg && otherReg.payment && !otherReg.approved) {
    otherReg.approved = true;
    await targetUser.save();

    const userLang = targetUser.lang || 'en';
    // Notify the registrar about the approval
    await bot.sendMessage(userId, langText[userLang].friendApproved(otherReg.name));
    bot.sendMessage(adminChatId, `✅ Payment for "${otherReg.name}" (registered by ${targetUser.name}) has been approved.`);
  } else {
    bot.sendMessage(adminChatId, 'Invalid registration or payment already approved.');
  }
}

async function declineOtherUser(userId, regIndex, adminChatId) {
  // This function is called but not defined in the original code.
  // We'll add a basic implementation based on the approveOtherUser logic.
  // You may need to expand this based on your exact requirements.
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

    // Notify the registrar about the decline
    await bot.sendMessage(userId, langText[userLang].friendDeclined(otherReg.name));
    await bot.sendMessage(userId, `⚠️ The payment for *${otherReg.name}* was declined. Please upload a correct payment screenshot on their behalf.`, { parse_mode: 'Markdown' });
    await bot.sendMessage(userId, langText[lang].accountNumber);
    await bot.sendMessage(userId, `Please upload the payment screenshot for ${otherReg.name}:`);
    bot.sendMessage(adminChatId, `Payment for "${otherReg.name}" declined. User ${userId} has been asked to re-upload.`);
  } else {
    bot.sendMessage(adminChatId, 'Invalid registration or no pending payment to decline.');
  }
}

// Handle callback queries for editing profile
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const action = callbackQuery.data;
  const user = await User.findOne({ chatId });
  const lang = user.lang || 'en'; // lang is guaranteed to be set here due to /start logic

  // --- ADMIN CALLBACKS ---
  if (chatId.toString() === ADMIN_CHAT_ID) {
    const parts = action.split(' ');
    const command = parts[0];
    const targetChatId = parts[1];
    const regIndex = parts[2] ? parseInt(parts[2], 10) : null;

    if (command === '/approve' && targetChatId) {
      await approveUser(targetChatId, chatId);
      bot.answerCallbackQuery(callbackQuery.id, { text: '✅ User approved!' });
      return bot.editMessageCaption(`${msg.caption}\n\n---\n✅ Approved by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
    if (command === '/decline' && targetChatId) {
      await declineUser(targetChatId, chatId);
      bot.answerCallbackQuery(callbackQuery.id, { text: '❌ User declined.' });
      return bot.editMessageCaption(`${msg.caption}\n\n---\n❌ Declined by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
    if (command === '/approve_other' && targetChatId && regIndex !== null) {
      await approveOtherUser(targetChatId, regIndex, chatId);
      bot.answerCallbackQuery(callbackQuery.id, { text: '✅ User approved!' });
      return bot.editMessageCaption(`${msg.caption}\n\n---\n✅ Approved by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
    if (command === '/decline_other' && targetChatId && regIndex !== null) {
      await declineOtherUser(targetChatId, regIndex, chatId);
      bot.answerCallbackQuery(callbackQuery.id, { text: '❌ User declined.' });
      return bot.editMessageCaption(`${msg.caption}\n\n---\n❌ Declined by admin.`, { chat_id: chatId, message_id: msg.message_id });
    }
  }
  // --- END ADMIN CALLBACKS ---

  // If the callback is from an admin but wasn't an approval/decline button,
  // it might be a different admin action (like from /incomplete).
  // We let those pass through to the logic below, but we stop regular user logic from running for admins.
  if (chatId.toString() === ADMIN_CHAT_ID && !action.startsWith('remind_')) {
     return bot.answerCallbackQuery(callbackQuery.id);
  }

  if (action === 'edit_name') {
    user.step = 'edit_name';
    setUserTimeout(chatId, lang);
    bot.sendMessage(chatId, langText[lang].askNewName);
  } else if (action === 'edit_email') {
    user.step = 'edit_email';
    setUserTimeout(chatId, lang);
    bot.sendMessage(chatId, langText[lang].askNewEmail);
  } else if (action === 'edit_phone') {
    user.step = 'edit_phone';
    setUserTimeout(chatId, lang);
    bot.sendMessage(chatId, langText[lang].askNewPhone);
  } else if (action === 'edit_location') {
    user.step = 'edit_location';
    setUserTimeout(chatId, lang);
    bot.sendMessage(chatId, langText[lang].askNewLocation);
  } else if (action === 'finish_payments') {
    // Check for user's own pending payment status
    bot.answerCallbackQuery(callbackQuery.id);
    if (user.name && !user.approved) { // User has registered but is not yet approved
      if (user.payment) {
        // Payment is uploaded, waiting for approval
        return bot.sendMessage(chatId, langText[lang].waitForApproval);
      } else {
        // Payment is not uploaded, prompt to pay
        setUserTimeout(chatId, lang);
        bot.sendMessage(chatId, langText[lang].accountNumber);
        return bot.sendMessage(chatId, langText[lang].askPayment);
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
        setUserTimeout(chatId, lang);
        return bot.sendMessage(chatId, `Please upload the payment screenshot for ${pendingReg.name}:`);
      }
    }
    // If no pending payments are found
    return bot.sendMessage(chatId, '✅ All payments are up to date!');
  } else if (action === 'continue_registration') {
    // Handle "Continue Registration" button click
    const step = user.step;
       if (!step) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: 'You have no pending registration steps.' });
    }

    // The `user.step` from the database is the most reliable source of truth for where the user left off.
    const stepToDisplay = user.step;
    console.log(`Continue registration (callback): Displaying step '${stepToDisplay}'`);

    // Now, we use `stepToDisplay` to show the user where they are,
    // but we use the original `step` from the database to get the correct prompt.
    // This ensures we ask for the correct piece of information.
    await displayCurrentStep(bot, chatId, user, lang, stepToDisplay);
    return; // The displayCurrentStep function handles sending the message.
  } else if (action.startsWith('remind_user:')) {
    // Handle the new reminder callback
    const parts = action.split(':'); // eslint-disable-line
    const targetChatId = parts[1];
    const regIndex = parseInt(parts[2], 10);

    try {
      const targetUser = await User.findOne({ chatId: targetChatId });
      if (!targetUser) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: 'User not found!' });
      }

      const lang = targetUser.lang || 'en';
      let reminderSent = false;

      // --- NEW: Smart Reminder Logic ---
      const step = targetUser.step;
      if (!step) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ User is not in an active step.' });
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
          return bot.answerCallbackQuery(callbackQuery.id, { text: 'Unknown step.' });
      }

      await bot.sendMessage(targetChatId, reminderMsg + nextStepPrompt, { parse_mode: 'Markdown' });
      targetUser.last_reminder_sent_at = new Date(); // Track reminder
      await targetUser.save();
      bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Smart reminder sent!' });

    } catch (error) {
      console.error('Error sending reminder:', error);
      bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error sending reminder.' });
    }
  } else if (action.startsWith('remind_feeling:')) {
    // Handle feeling reminder callbacks
    const [, type, targetChatId] = action.split(':');

    try {
      const targetUser = await User.findOne({ chatId: targetChatId });
      if (!targetUser) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: 'User not found!' });
      }

      const lang = targetUser.lang || 'en';
      if (type === 'before') {
        targetUser.step = 'feeling_before';
        await targetUser.save();
        await bot.sendMessage(targetChatId, langText[lang].remindPreRetreatFeeling, { parse_mode: 'Markdown' });
      } else if (type === 'after') {
        targetUser.step = 'feeling_after';
        await targetUser.save();
        await bot.sendMessage(targetChatId, langText[lang].remindPostRetreatFeeling, { parse_mode: 'Markdown' });
      }
      bot.answerCallbackQuery(callbackQuery.id, { text: `✅ ${type} feeling reminder sent!` });
    } catch (error) {
      // --- IMPROVED ERROR HANDLING ---
      if (error.code === 'ETELEGRAM' && error.response && error.response.statusCode === 403) {
        console.log(`Could not send feeling reminder to ${targetChatId}: Bot was blocked by the user.`);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'User has blocked the bot.' });
      } else {
        console.error('Error sending feeling reminder:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error sending reminder.' });
      }
    }
  } else {
    // If no other action was matched, answer the query to prevent a timeout
    bot.answerCallbackQuery(callbackQuery.id);
  }

  await user.save();
});


// Handle messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : undefined; // can be undefined, trim whitespace
  
  // --- FIX: Check if it's an admin command BEFORE the general slash command check ---
  // First check if this is an admin trying to use an admin command
  if (text && text.startsWith('/')) {
    // Extract the command
    const commandMatch = text.match(/^\/(\w+)/);
    if (commandMatch) {
      const command = commandMatch[1];
      const adminCommands = ['approve', 'decline', 'approve_other', 'decline_other', 
                            'deleteuser', 'broadcast', 'exportusers', 'pendingpayments', 
                            'stats', 'incomplete', 'feelings', 'remindfeelings'];
      
      // If it's an admin command, check if user is admin
      if (adminCommands.includes(command)) {
        // Check if ADMIN_CHAT_ID is still the placeholder
        if (ADMIN_CHAT_ID === 'YOUR_ADMIN_CHAT_ID') {
          return bot.sendMessage(chatId, '⚠️ Admin commands are not configured. Please set the `ADMIN_CHAT_ID` environment variable in your .env file to your Telegram Chat ID.');
        }
        
        // Check if user is authorized
        if (chatId.toString() !== ADMIN_CHAT_ID) {
          return bot.sendMessage(chatId, '🚫 You are not authorized to use this command.');
        }
        
        // Let the admin command logic continue - don't return early
        // The command will be processed in the code below
      } else {
        // It's a regular user command (like /start), skip the general handler
        return;
      }
    }
  }
  
  // If a message is received, the user is not idle, so clear any pending timeout.
  if (userTimeouts[chatId]) {
    clearTimeout(userTimeouts[chatId]);
    delete userTimeouts[chatId];
  }

  let user = await User.findOne({ chatId });
  // Handle language selection
  if (user && user.step === 'select_lang') {
    if (text === 'English') user.lang = 'en';
    else if (text === 'አማርኛ') user.lang = 'am';
    else if (text === 'Afaan Oromoo') user.lang = 'om';
    else return bot.sendMessage(chatId, 'Please select a valid language / እባክዎን ቋንቋ ይምረጡ: / Mee afaan sirrii filadhu:');
    user.step = null; // Clear the step after language selection
    await user.save();
    // --- NEW: Show registration steps to new users ---
    await bot.sendMessage(chatId, langText[user.lang].registrationSteps, { parse_mode: 'Markdown' });
    return bot.sendMessage(chatId, langText[user.lang].welcome, { ...generateMainMenuKeyboard(user.lang, user), parse_mode: 'Markdown' }); // Then show the main menu
  }

  // If user is not found and they didn't type /start, prompt them to start.
  if (!user) {
    return bot.sendMessage(chatId, 'Please click /start to begin.');
  }

  const lang = user.lang || 'en';

  // Handle non-text messages (photo for payment)
  if (msg.photo) {
    if (user.step === 'payment') {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      user.payment = fileId;
      user.payment_pending_since = null; // Clear pending timestamp
      user.step = null;
      await user.save();
      bot.sendMessage(chatId, langText[lang].processingPayment, generateMainMenuKeyboard(lang, user));

      // Inform the user they can register others
      bot.sendMessage(chatId, langText[lang].canRegisterOthers);

      // --- NEW: Notify the inviter if this user was invited by someone ---
      if (user.invited_by_chatId) {
        const inviter = await User.findOne({ chatId: user.invited_by_chatId });
        if (inviter) {
          const inviterLang = inviter.lang || 'en';
          await bot.sendMessage(inviter.chatId, langText[inviterLang].friendUploadedPayment(user.name));

          // Check if the inviter has any other pending registrations
          const hasMorePending = inviter.other_registrations.some(reg => reg.name && !reg.payment);
          if (!hasMorePending) {
            await bot.sendMessage(inviter.chatId, langText[inviterLang].canRegisterOthers);
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
      bot.sendPhoto(ADMIN_CHAT_ID, fileId, adminOptions);

    } else if (user.step === 'payment_other') {
      // Use the index we saved when the user clicked "Finish Payments"
      // Fallback to the last one if the index isn't set (for direct registration flow)
      const regIndex = user.current_other_reg_index ?? (user.other_registrations.length - 1);
      if (regIndex === null || regIndex === undefined || !user.other_registrations[regIndex]) {
        console.error(`Error: Invalid regIndex for payment_other. User: ${chatId}, Index: ${regIndex}`);
        return bot.sendMessage(chatId, 'An error occurred. Could not find the registration to apply payment to. Please contact support.');
      }
      const newReg = user.other_registrations[regIndex];
      newReg.payment = msg.photo[msg.photo.length - 1].file_id;
      newReg.payment_pending_since = null; // Clear pending timestamp
      newReg.approved = false; // Set approval status
      user.step = null;
      user.current_other_reg_index = null; // Clear the index after use
      await user.save();
      bot.sendMessage(chatId, langText[lang].processingPayment, generateMainMenuKeyboard(lang, user));

      // Notify admin about the new registration
      const caption = `New Registration by ${user.name} (${chatId}):\n\n` +
                      `New User Name: ${newReg.name}\n`+
                      `New User Email: ${newReg.email}\n`+
                      `New User Phone: ${newReg.phone}\n`+
                      `New User Location: ${newReg.location}`;
      const adminOptions = {
        caption,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Approve', callback_data: `/approve_other ${chatId} ${regIndex}` }, { text: '❌ Decline', callback_data: `/decline_other ${chatId} ${regIndex}` }]
          ]
        }
      };
      bot.sendPhoto(ADMIN_CHAT_ID, newReg.payment, adminOptions);
    }
    return; // Exit after handling the photo
  }

  // --- Admin Commands Logic ---
  // This section should handle admin commands after the photo handling check
  if (text && text.startsWith('/')) {
    // Check if it's an admin command
    const commandMatch = text.match(/^\/(\w+)/);
    if (commandMatch) {
      const command = commandMatch[1];
      const adminCommands = ['approve', 'decline', 'approve_other', 'decline_other', 
                            'deleteuser', 'broadcast', 'exportusers', 'pendingpayments', 
                            'stats', 'incomplete', 'feelings', 'remindfeelings'];
      
      if (adminCommands.includes(command)) {
        // The authorization check was already done at the beginning
        // Now execute the specific admin command
        
        if (text.startsWith('/approve ')) {
          const parts = text.split(' ');
          const userId = parts[1];
          await approveUser(userId, chatId);
          return;
        }

        if (text.startsWith('/approve_other ')) {
          const parts = text.split(' ');
          const userId = parts[1];
          const regIndex = parseInt(parts[2], 10);
          await approveOtherUser(userId, regIndex, chatId);
          return;
        } // End of /approve_other

        if (text.startsWith('/decline_other ')) {
          const parts = text.split(' ');
          const userId = parts[1];
          const regIndex = parseInt(parts[2], 10);
          await declineOtherUser(userId, regIndex, chatId);
          return;
        } // End of /decline_other

        if (text.startsWith('/deleteuser ')) {
          const parts = text.split(' ');
          if (parts.length < 2) {
            return bot.sendMessage(chatId, 'Please provide a User ID.\nUsage: `/deleteuser <userId>`', { parse_mode: 'Markdown' });
          }
          const userIdToDelete = parts[1];

          try {
            const userToDelete = await User.findOne({ chatId: userIdToDelete });

            if (!userToDelete) {
              return bot.sendMessage(chatId, `❌ User with ID \`${userIdToDelete}\` not found.`, { parse_mode: 'Markdown' });
            }

            // Notify the user their data is being deleted.
            try {
              const userLang = userToDelete.lang || 'en';
              await bot.sendMessage(userIdToDelete, langText[userLang].dataDeletedNotification);
            } catch (error) {
              console.log(`Could not notify user ${userIdToDelete} about data deletion. They may have blocked the bot.`);
            }

            // Delete the user's document from the database
            await User.deleteOne({ chatId: userIdToDelete });

            return bot.sendMessage(chatId, `✅ Successfully deleted all data for user \`${userIdToDelete}\`.`, { parse_mode: 'Markdown' });
          } catch (error) {
            console.error('Error deleting user:', error);
            return bot.sendMessage(chatId, '❌ An error occurred while trying to delete the user.', { parse_mode: 'Markdown' });
          }
        } // End of /deleteuser

        if (text === '/broadcast') {
          user.step = 'broadcast_message';
          await user.save();
          return bot.sendMessage(chatId, 'Please send the message you want to broadcast to all users. Send /cancel to abort.');
        } // End of /broadcast

        if (text === '/exportusers') {
          bot.sendMessage(chatId, '🔄 Generating user export... Please wait.');

          try {
            // Find all users who have at least started registration
            const allUsers = await User.find({ name: { $ne: null } });

            if (allUsers.length === 0) {
              return bot.sendMessage(chatId, 'No registered users found to export.');
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

            bot.sendDocument(chatId, fileBuffer, {}, {
              filename: `user_export_${new Date().toISOString().split('T')[0]}.csv`,
              contentType: 'text/csv'
            });
          } catch (error) {
            console.error('Failed to export users:', error);
            bot.sendMessage(chatId, '❌ An error occurred while generating the user export.');
          }
          return;
        } // End of /exportusers

        if (text === '/pendingpayments') {
          bot.sendMessage(chatId, '🔍 Searching for pending payments...');

          try {
            // Find users with pending payments (for themselves or for others)
            const usersWithPending = await User.find({
              $or: [
                { payment: { $ne: null }, approved: false },
                { 'other_registrations.payment': { $ne: null }, 'other_registrations.approved': false }
              ]
            });

            if (usersWithPending.length === 0) {
              return bot.sendMessage(chatId, '✅ No pending payments found.');
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
            return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          } catch (error) {
            console.error('Failed to get pending payments:', error);
            return bot.sendMessage(chatId, '❌ An error occurred while fetching the pending payments list.');
          }
        } // End of /pendingpayments

        if (text === '/stats') {
          bot.sendMessage(chatId, '📊 Calculating statistics... Please wait.');

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

            return bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
          } catch (error) {
            console.error('Failed to generate stats:', error);
            return bot.sendMessage(chatId, '❌ An error occurred while generating statistics.');
          }
        } // End of /stats

        if (text === '/incomplete') {
          bot.sendMessage(chatId, '🔍 Searching for incomplete registrations (payment not uploaded)...');

          try {
            // --- NEW: Find any user who is currently in a registration step ---
            const usersWithIncomplete = await User.find({ step: { $ne: null } });

            if (usersWithIncomplete.length === 0) {
              return bot.sendMessage(chatId, '✅ No incomplete registrations found.');
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
            return bot.sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: keyboardButtons }
            });
          } catch (error) {
            console.error('Failed to get incomplete registrations:', error);
            return bot.sendMessage(chatId, '❌ An error occurred while fetching the incomplete registrations list.');
          }
        } // End of /incomplete

        if (text === '/feelings') {
          bot.sendMessage(chatId, '📝 Generating summary of user feelings...');

          try {
            const usersWithFeelings = await User.find({
              $or: [
                { feeling_before: { $ne: null, $ne: '' } },
                { feeling_after: { $ne: null, $ne: '' } }
              ]
            });

            if (usersWithFeelings.length === 0) {
              return bot.sendMessage(chatId, 'No user feelings have been submitted yet.');
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
              await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            }
          } catch (error) {
            console.error('Failed to get feelings summary:', error);
            return bot.sendMessage(chatId, '❌ An error occurred while fetching the feelings summary.');
          }
          return;
        } // End of /feelings

        if (text === '/remindfeelings') {
          bot.sendMessage(chatId, '🔍 Finding users who need a feeling reminder...');

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
              return bot.sendMessage(chatId, '✅ All approved users have submitted their feelings.');
            }

            let currentMessage = '*📝 Users Missing Feelings*\n\n';

            for (const user of usersToRemind) {
              const buttons = [];
              if (!user.feeling_before) {
                buttons.push({ text: 'Remind Before', callback_data: `remind_feeling:before:${user.chatId}` });
              }
              if (!user.feeling_after) {
                buttons.push({ text: 'Remind After', callback_data: `remind_feeling:after:${user.chatId}` });
              }

              if (buttons.length > 0) {
                await bot.sendMessage(chatId, `*User:* ${user.name} (\`${user.chatId}\`)`, {
                  parse_mode: 'Markdown',
                  reply_markup: { inline_keyboard: [buttons] }
                });
              }
            }

          } catch (error) {
            console.error('Failed to get users for feeling reminders:', error);
            return bot.sendMessage(chatId, '❌ An error occurred while fetching the user list.');
          }
          return;
        } // End of /remindfeelings
      }
    }
    // If it's not an admin command, it's a regular slash command like /start, which we already handle
    // But we need to let /start through, so we'll check for it here
    if (text === '/start') {
      // /start is handled by bot.onText, so we don't need to handle it here
      return;
    }
    // For any other slash command that's not handled, just return
    return;
  }
  
  // --- NEW: Handle "Continue Registration" from the main menu keyboard ---
  if (text === langText[lang].continueRegistrationButton) {
    const step = user.step;
    if (!step) {
      // This case should be rare since the button only shows when user.step exists, but it's good practice.
      return bot.sendMessage(chatId, 'You have no pending registration steps.', generateMainMenuKeyboard(lang, user));
    }

    // The `user.step` from the database is the most reliable source of truth.
    const stepToDisplay = user.step;
    console.log(`Continue registration (main menu): Displaying step '${stepToDisplay}'`);
    return displayCurrentStep(bot, chatId, user, lang, stepToDisplay);
  }

  // Main menu buttons
  if (text === 'Help / እገዛ') {
    let helpMessage = langText[lang].help;
    // If the user is an admin, append the admin commands
    if (chatId.toString() === ADMIN_CHAT_ID) {
      helpMessage += langText[lang].help_admin;
    }
    return bot.sendMessage(chatId, helpMessage, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });
  }

  if (text === langText.en.contactUsButton) {
    return bot.sendMessage(chatId, langText[lang].contactUs, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }
  
  if (text === 'Register / መዝግብ') {
    // --- UPDATED: Check for an incomplete step first ---
    if (user.step) {
      // If the user is in the middle of a step, prompt them to continue.
      const continueKeyboard = {
        reply_markup: { inline_keyboard: [[{ text: langText[lang].continueRegistrationButton, callback_data: 'continue_registration' }]] }
      };
      return bot.sendMessage(chatId, langText[lang].continueRegistrationPrompt, continueKeyboard);
    } else if (user.name) {
      // If they are not in a step but are already registered, ask to register another.
      const registerAnotherKeyboard = {
        reply_markup: {
          keyboard: [[{ text: langText[lang].registerAnother }], [{ text: 'Cancel' }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };
      return bot.sendMessage(chatId, langText[lang].alreadyRegistered, registerAnotherKeyboard);
    }
    // If they have no step and no name, start a new registration.
    user.step = 'name';
    await user.save();
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askName, { reply_markup: { remove_keyboard: true } });
  }

  if (text === langText.en.preRetreatFeeling) {
    user.step = 'feeling_before';
    await user.save();
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askPreRetreatFeeling, { reply_markup: { remove_keyboard: true } });
  }

  if (text === langText.en.postRetreatFeeling) {
    user.step = 'feeling_after';
    await user.save();
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askPostRetreatFeeling, { reply_markup: { remove_keyboard: true } });
  }

  // --- NEW: Handle 'Back' button when user is stuck ---
  if (text === 'Back') {
    // Re-display the current step instead of just going to the main menu
    return displayCurrentStep(bot, chatId, user, lang);
  }


  if (text === langText.en.myProfile) {
    if (user?.name) {
      // --- UPDATED: Determine user's own payment status and add it to the profile message ---
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
      bot.sendMessage(chatId, profileInfo, options);

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
          bot.sendMessage(chatId, `${otherProfileInfo}\n*Status:* ${status}`, { parse_mode: 'Markdown' });
        });
      }
      return; // Stop further execution
    } else {
      return bot.sendMessage(chatId, langText[lang].notRegistered, generateMainMenuKeyboard(lang, user));
    }
  }

  if (text === 'Join Group / ቡድኑን ይቀላቀሉ') {
    if (user.approved) {
      const joinGroupKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: langText[lang].joinGroup, url: GROUP_LINK }]
          ]
        }
      };
      return bot.sendMessage(chatId, langText[lang].joinGroupSuccess, joinGroupKeyboard);
    } else if (user.name && !user.payment) { // Registered but hasn't uploaded payment
      user.step = 'payment'; // Ensure the user is in the correct step
      await user.save();
      setUserTimeout(chatId, lang);
      bot.sendMessage(chatId, langText[lang].accountNumber);
      return bot.sendMessage(chatId, langText[lang].askPayment);
    } else if (user.payment && !user.approved) {
      return bot.sendMessage(chatId, langText[lang].waitForApproval, generateMainMenuKeyboard(lang, user));
    } else {
      return bot.sendMessage(chatId, langText[lang].joinGroupNotApproved, generateMainMenuKeyboard(lang, user));
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
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askName_other, { reply_markup: { remove_keyboard: true } });
  }


  // Registration steps
  if (user.step === 'name') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return bot.sendMessage(chatId, langText[lang].invalidName);
    }
    user.name = text;
    user.step = 'email';
    await user.save();
    const emailPromptOptions = {
      reply_markup: {
        input_field_placeholder: 'example@email.com'
      }
    };
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askEmail, emailPromptOptions);
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
      setUserTimeout(chatId, lang);
      return bot.sendMessage(chatId, langText[lang].invalidEmail, emailReplyKeyboard);
    }
    user.email = finalEmail;
    await user.save();
    // The user.partial_email is a temporary field in the live object, not in the schema, so we just delete it.
    delete user.partial_email; // Clean up temporary storage
    user.step = 'location';
    await user.save(); // <-- This was the missing line
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askLocation, { reply_markup: { remove_keyboard: true } });
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
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askPhone, phonePromptOptions);
  }

  if (user.step === 'phone') {
    
    if (!/^09\d{8}$/.test(text)) {
      return bot.sendMessage(chatId, langText[lang].invalidPhone);
    }
    user.phone = text;
    await user.save();
    user.step = 'payment';
    user.payment_pending_since = new Date(); // Set timestamp for reminder
    await user.save(); // <-- This was the missing line
    setUserTimeout(chatId, lang);
    bot.sendMessage(chatId, langText[lang].accountNumber);
    return bot.sendMessage(chatId, langText[lang].askPayment);
  }

  // --- NEW: Handle broadcast message step for admin ---
  if (user.step === 'broadcast_message' && chatId.toString() === ADMIN_CHAT_ID) {
    if (text === '/cancel') {
      user.step = null;
      await user.save();
      return bot.sendMessage(chatId, 'Broadcast cancelled.', generateMainMenuKeyboard(lang, user));
    }

    const messageToSend = text;
    user.step = null; // Clear the step
    await user.save();

    // Find all users who have completed at least the name step
    const allUsers = await User.find({ name: { $ne: null } });
    if (allUsers.length === 0) {
      return bot.sendMessage(chatId, 'No registered users found to broadcast to.');
    }

    bot.sendMessage(chatId, `🚀 Starting broadcast to ${allUsers.length} users...`);
    let successCount = 0;
    let errorCount = 0;

    for (const target of allUsers) {
      try {
        await bot.sendMessage(target.chatId, messageToSend);
        successCount++;
      } catch (error) {
        console.error(`Failed to send message to user ${target.chatId}:`, error.message);
        errorCount++;
      }
    }
    return bot.sendMessage(chatId, `Broadcast finished.\n\n✅ Successfully sent to: ${successCount} users.\n❌ Failed to send to: ${errorCount} users.`);
  }
  // --- "Register Another" Steps ---
  if (user.step === 'name_other') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return bot.sendMessage(chatId, langText[lang].invalidName);
    }
    user.other_registrations[user.other_registrations.length - 1].name = text;
    user.current_other_reg_index = user.other_registrations.length - 1; // Set the index for the current registration
    await user.save();
    user.step = 'email_other';
    await user.save();
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askEmail_other);
 }
  if (user.step === 'email_other') {
    if (!validator.isEmail(text)) {
      return bot.sendMessage(chatId, langText[lang].invalidEmail);
    }
    user.other_registrations[user.other_registrations.length - 1].email = text;
    await user.save();
    user.step = 'location_other';
    await user.save();
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askLocation_other);
  }

  if (user.step === 'location_other') {
    user.other_registrations[user.other_registrations.length - 1].location = text;
    await user.save();
    user.step = 'phone_other';
    await user.save();
    setUserTimeout(chatId, lang);
    return bot.sendMessage(chatId, langText[lang].askPhone_other);
  }

  if (user.step === 'phone_other') {
    if (!/^09\d{8}$/.test(text)) {
      return bot.sendMessage(chatId, langText[lang].invalidPhone);
    }
    user.other_registrations[user.other_registrations.length - 1].phone = text;

    // --- NEW: Generate and send invite link immediately ---
    const newReg = user.other_registrations[user.other_registrations.length - 1];
    const claimToken = require('crypto').randomBytes(16).toString('hex');
    newReg.claim_token = claimToken;
    await user.save(); // Save the token first

    // --- NEW: Delay sending the invite link by 2 minutes ---
    setTimeout(async () => {
      const botInfo = await bot.getMe();
      const inviteLink = `https://t.me/${botInfo.username}?start=${claimToken}`;
      const inviteMessage = `✅ Registration details for *${newReg.name}* are saved!\n\nPlease forward this special invitation link to them so they can join the bot:\n\n${inviteLink}`;
      await bot.sendMessage(chatId, inviteMessage, { parse_mode: 'Markdown' });
    }, 120000); // 120,000 milliseconds = 2 minutes
    // --- End of new logic ---

    user.step = 'payment_other';
    user.other_registrations[user.other_registrations.length - 1].payment_pending_since = new Date(); // Set timestamp
    await user.save();
    setUserTimeout(chatId, lang);
    bot.sendMessage(chatId, langText[lang].accountNumber);
    return bot.sendMessage(chatId, langText[lang].askPayment);
  }

  // --- Feeling Steps ---
  if (user.step === 'feeling_before') {
    user.feeling_before = text;
    user.step = null;
    await user.save();
    return bot.sendMessage(chatId, langText[lang].feelingSaved, generateMainMenuKeyboard(lang, user));
  }

  if (user.step === 'feeling_after') {
    user.feeling_after = text;
    user.step = null;
    await user.save();
    return bot.sendMessage(chatId, langText[lang].feelingSaved, generateMainMenuKeyboard(lang, user));
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
    return bot.sendMessage(chatId, langText[lang].welcome, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });
  }

  // Handle profile edits
  if (user.step === 'edit_name') {
    if (!/^[\p{L}\s]+$/u.test(text) || !text.includes(' ')) {
      return bot.sendMessage(chatId, langText[lang].invalidName);
    }
    user.name = text;
    user.step = null;
    await user.save();
    bot.sendMessage(chatId, langText[lang].updateSuccess, generateMainMenuKeyboard(lang, user));
    const updatedProfileInfo = `${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return bot.sendMessage(chatId, updatedProfileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }

  if (user.step === 'edit_email') {
    if (!validator.isEmail(text)) {
      return bot.sendMessage(chatId, langText[lang].invalidEmail);
    }
    user.email = text;
    user.step = null;
    await user.save();
    bot.sendMessage(chatId, langText[lang].updateSuccess, generateMainMenuKeyboard(lang, user));
    const updatedProfileInfo = `${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return bot.sendMessage(chatId, updatedProfileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }

  if (user.step === 'edit_phone') {
    if (!/^09\d{8}$/.test(text)) {
      return bot.sendMessage(chatId, langText[lang].invalidPhone);
    }
    user.phone = text;
    user.step = null;
    await user.save();
    bot.sendMessage(chatId, langText[lang].updateSuccess, generateMainMenuKeyboard(lang, user));
    const profileInfo = `${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return bot.sendMessage(chatId, profileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }

  if (user.step === 'edit_location') {
    user.location = text;
    user.step = null;
    await user.save();
    bot.sendMessage(chatId, langText[lang].updateSuccess, generateMainMenuKeyboard(lang, user));
    const updatedProfileInfo = `${langText[lang].profileTitle}\n\n${langText[lang].profileDetails(user)}`;
    return bot.sendMessage(chatId, updatedProfileInfo, { parse_mode: 'Markdown', reply_markup: profileKeyboard(lang, user) });
  }


  // Default
  bot.sendMessage(chatId, langText[lang].welcome, { ...generateMainMenuKeyboard(lang, user), parse_mode: 'Markdown' });

  // The final save is removed as saves are now handled after each specific modification.
});

// --- Scheduled Reminder Job ---

const checkPendingPayments = async () => {
  console.log('Running scheduled job: Checking for pending payments...');
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // Find users with pending payments that are older than 24 hours
    const usersToRemind = await User.find({
      $or: [
        // For their own registration
        { payment: null, approved: false, payment_pending_since: { $lt: twentyFourHoursAgo } },
        // For a registration they made for someone else
        { 'other_registrations.payment': null, 'other_registrations.approved': false, 'other_registrations.payment_pending_since': { $lt: twentyFourHoursAgo } }
      ]
    });

    for (const user of usersToRemind) {
      const lang = user.lang || 'en';

      // Check for self-pending payment
      if (user.payment === null && !user.approved && user.payment_pending_since && user.payment_pending_since < twentyFourHoursAgo) {
        console.log(`Sending reminder to user ${user.chatId} for their own payment.`);
        await bot.sendMessage(user.chatId, `🔔 *Reminder*\n\n${langText[lang].finishPaymentPrompt}`, { parse_mode: 'Markdown' });
        // Reset the timestamp to avoid sending another reminder for the next 24 hours
        user.payment_pending_since = new Date();
        user.last_reminder_sent_at = new Date(); // Track reminder
        await user.save();
      }

      // Check for other pending payments
      let changesMade = false;
      for (const reg of user.other_registrations) {
        if (reg.payment === null && !reg.approved && reg.payment_pending_since && reg.payment_pending_since < twentyFourHoursAgo) {
          console.log(`Sending reminder to user ${user.chatId} for ${reg.name}'s payment.`);
          const reminderMsg = `🔔 *Reminder*\n\nYou still need to upload the payment screenshot for *${reg.name}* to complete their registration.`;
          await bot.sendMessage(user.chatId, reminderMsg, { parse_mode: 'Markdown' });
          // Reset the timestamp
          reg.payment_pending_since = new Date();
          reg.last_reminder_sent_at = new Date(); // Track reminder
          changesMade = true;
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


// Start Express server
app.listen(PORT, async () => {
  await connectDB(); // Connect to the database
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}${webhookPath}`);
  console.log(
    `Set the webhook:\nhttps://api.telegram.org/bot${token}/setWebhook?url=https://YOUR_NGROK_URL${webhookPath}&secret_token=${SECRET_TOKEN}`
  );

  // Run the reminder job every hour (3600000 milliseconds)
  setInterval(checkPendingPayments, 3600000);
  console.log('✅ Payment reminder job scheduled to run every hour.');
});