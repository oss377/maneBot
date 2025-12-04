const { app, startServer, PORT } = require('./bot/bot');

// Start the server
startServer()
  .then(() => {
    // Use the port provided by the environment (e.g., Render, Heroku) or fall back to the one from your .env file.
    const effectivePort = process.env.PORT || PORT;
    app.listen(effectivePort, () => {
      console.log(`✅ Bot server is running on port ${effectivePort}`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });