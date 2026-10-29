import { engine } from 'express-handlebars';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { createAttackRouter } from './routes/attack';
import { wellknown } from './routes/well-known';
import { health } from './routes/health';
import { attackModesEnabled, holdInvoices } from './shared/attack';
import { lightningApi } from './shared/lnd/api';
import logger from './shared/logger';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// Security Middleware
app.use(helmet());

// Remove Express X-Powered-By headers
app.disable('x-powered-by');

app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');

// Logger
app.use(
  morgan('common', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  })
);

// Error
app.on('error', (err) => {
  logger.error('server error', err);
});

// Welcome Screen
app.get('/', function (req, res) {
  res.render('index', {
    domain: process.env.LNADDR_DOMAIN
  });
});

// Health Route
app.use('/healthz', health);

// Lightning Address
app.use('/.well-known', wellknown);

// Test-only controls for hold invoices; see README "Attack modes".
if (attackModesEnabled()) {
  const token = process.env.LNADDR_ATTACK_TOKEN;
  if (!token) {
    throw new Error('LNADDR_ATTACK_MODES=1 needs LNADDR_ATTACK_TOKEN');
  }
  logger.warn('Attack modes are ON: prefixed usernames receive hostile invoices');
  app.use(
    '/attack',
    createAttackRouter(token, {
      holdInvoices,
      settle: (preimage) => lightningApi.invoicesSettleInvoice(preimage),
      cancel: (hash) => lightningApi.invoicesCancelInvoice(hash)
    })
  );
}

// Start Server
app.listen(PORT, () => {
  logger.info(`Lightning Address Server listening on port ${PORT} in ${NODE_ENV} mode`);
});
