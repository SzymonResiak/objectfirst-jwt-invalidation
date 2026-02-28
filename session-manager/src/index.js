const express = require('express');
const loginRouter = require('./routes/login');
const invalidateRouter = require('./routes/invalidate');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(loginRouter);
app.use(invalidateRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Session Manager listening on port ${PORT}`);
});
