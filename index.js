const dotenv = require('dotenv');
dotenv.config(); // Load environment variables as early as possible

const { app, startServer, PORT, bot, setTelegramWebhook } = require('./bot/bot');
// Start the server
  .then(() => {
    // Use the port provided by the environment (e.g., Render, Heroku) or fall back to the one from your .env file.
    const effectivePort = process.env.PORT || PORT;
    app.listen(effectivePort, () => {
      console.log(`✅ Bot server is running on port ${effectivePort}`);
    });
    setTelegramWebhook(bot); // Set the webhook after the server starts listening
  })
  .catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });