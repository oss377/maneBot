require('dotenv').config();

module.exports = {
  token: process.env.BOT_TOKEN,
  PORT: process.env.PORT || 8000,
  SECRET_TOKEN: process.env.SECRET_TOKEN || 'mySecret123',
  ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || 'YOUR_ADMIN_CHAT_ID',
  GROUP_LINK: process.env.GROUP_LINK || 'https://t.me/your_group_link',
  RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || 'https://manebot-production.up.railway.app', //=manebot-production.up.railway.app
  NODE_ENV: process.env.NODE_ENV || 'production', //=production
  // Validation patterns
  PATTERNS: {
    NAME: /^[\p{L}\s]+$/u,
    PHONE: /^09\d{8}$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
};