const { app, startServer, PORT } = require('./bot/bot');

// Start the server
startServer().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Bot server is running on port ${PORT}`);
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});