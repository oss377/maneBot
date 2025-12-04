const dotenv = require('dotenv');
dotenv.config(); // Load environment variables as early as possible

const { app, startServer, PORT, bot } = require('./bot/bot');

// Start the server
const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL;
startServer()
  .then(() => {
    // Use the port provided by the environment (e.g., Render, Heroku) or fall back to the one from your .env file.
    const effectivePort = process.env.PORT || PORT;
    app.listen(effectivePort, () => {
      console.log(`✅ Bot server is running on port ${effectivePort}`);
    });

    // Set the webhook programmatically
    if (RAILWAY_STATIC_URL) {
      const webhookUrl = `${RAILWAY_STATIC_URL}/webhook`;
      console.log(`Setting webhook to ${webhookUrl}`);
      bot.setWebhook(webhookUrl).then(result => {
        console.log('Webhook set:', result);
      }).catch(err => console.error('Failed to set webhook', err));
    }
  })
  .catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });