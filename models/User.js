const mongoose = require('mongoose');

// Schema for registrations made on behalf of others
const OtherRegistrationSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  location: { type: String },
  payment: { type: String, default: null }, // file_id of the payment screenshot
  approved: { type: Boolean, default: false },
  payment_pending_since: { type: Date, default: null }, // To track for reminders
  last_reminder_sent_at: { type: Date, default: null }, // To track when the last reminder was sent
  claim_token: { type: String, default: null, index: true } // Unique token for the user to claim their account
});

const UserSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  lang: { type: String, default: 'en' },
  step: { type: String, default: null },
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  location: { type: String },
  payment: { type: String, default: null }, // file_id of the payment screenshot
  approved: { type: Boolean, default: false },
  payment_pending_since: { type: Date, default: null }, // To track for reminders
  last_reminder_sent_at: { type: Date, default: null }, // To track when the last reminder was sent
  feeling_before: { type: String, default: null }, // User's feeling before the retreat
  feeling_after: { type: String, default: null }, // User's feeling after the retreat
  invited_by_chatId: { type: String, default: null }, // To link back to the user who invited them
  other_registrations: [OtherRegistrationSchema],

  // Temporary fields for multi-step operations
  partial_email: { type: String },
  current_other_reg_index: { type: Number },
});

const User = mongoose.model('User', UserSchema);

module.exports = User;