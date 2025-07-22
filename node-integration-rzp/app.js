require('dotenv').config(); // This should be the ONLY dotenv config call

const express = require('express');
const Razorpay = require('razorpay');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { validateWebhookSignature } = require('razorpay/dist/utils/razorpay-utils');

// Initialize Express app
const app = express();
const port = process.env.PORT || 5001;

// Enhanced logging setup
const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
};

logger.info('Initializing server...');
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info(`Current directory: ${__dirname}`);

// Enhanced CORS Configuration
logger.info('Configuring CORS middleware...');
const corsOptions = {
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Enhanced Middleware
logger.info('Setting up middleware...');
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
// app.use(express.static(path.join(__dirname), {
//   dotfiles: 'ignore',
//   etag: true,
//   extensions: ['html', 'htm'],
//   index: 'index.html',
//   maxAge: '1d',
//   redirect: false
// }));

// Serve index.html with Razorpay key injected
app.get('/', (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const htmlPath = path.join(__dirname, 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, data) => {
    if (err) {
      logger.error(`Error reading index.html: ${err.message}`);
      return res.status(500).send('Internal Server Error');
    }
    const updatedHTML = data.replace('{{RAZORPAY_KEY_ID}}', keyId);
    res.send(updatedHTML);
  });
});


// Initialize Razorpay with enhanced configuration
logger.info('Initializing Razorpay client...');
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  logger.error('Razorpay credentials are not set in environment variables');
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Enhanced file operations with error handling
logger.info('Setting up file operations...');
const DATA_FILE = 'orders.json';

const readData = () => {
  try {
    logger.info(`Reading data from ${DATA_FILE}...`);
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
    logger.warn(`${DATA_FILE} not found, returning empty array`);
    return [];
  } catch (error) {
    logger.error(`Error reading ${DATA_FILE}: ${error.message}`);
    throw error;
  }
};

const writeData = (data) => {
  try {
    logger.info(`Writing data to ${DATA_FILE}...`);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    logger.info('Data written successfully');
  } catch (error) {
    logger.error(`Error writing to ${DATA_FILE}: ${error.message}`);
    throw error;
  }
};

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  logger.info(`${DATA_FILE} not found, creating new file...`);
  writeData([]);
}

// Enhanced Routes
logger.info('Setting up routes...');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Enhanced order creation endpoint
app.post('/create-order', async (req, res) => {
  logger.info('\n--- NEW ORDER REQUEST ---');
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  
  try {
    const { amount, currency = 'INR', receipt = `receipt_${Date.now()}`, notes = {} } = req.body;

    // Input validation
    if (!amount || isNaN(amount) || amount <= 0) {
      logger.warn('Invalid amount received');
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR',
        message: 'Amount must be a positive number'
      });
    }

    const options = {
      amount: Math.round(amount * 100), // Convert to paise and round to avoid decimals
      currency,
      receipt,
      notes,
      payment_capture: 1 // Auto-capture payments
    };

    logger.info(`Creating order with options: ${JSON.stringify(options)}`);
    
    const order = await razorpay.orders.create(options);
    logger.info(`Order created with Razorpay: ${JSON.stringify(order)}`);
    
    // Update local storage
    const orders = readData();
    const newOrder = {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: 'created',
      created_at: new Date().toISOString(),
      notes: order.notes
    };
    orders.push(newOrder);
    writeData(orders);
    logger.info(`Order saved locally: ${JSON.stringify(newOrder)}`);

    res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt
    });
  } catch (error) {
    logger.error(`ERROR creating order: ${error.message}`);
    res.status(500).json({ 
      error: 'ORDER_CREATION_FAILED',
      message: error.error?.description || error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Enhanced payment verification endpoint
app.post('/verify-payment', (req, res) => {
  logger.info('\n--- PAYMENT VERIFICATION REQUEST ---');
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    logger.warn('Missing required parameters for verification');
    return res.status(400).json({ 
      error: 'MISSING_PARAMETERS',
      message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required'
    });
  }

  logger.info(`Verifying payment for order: ${razorpay_order_id}`);

  const secret = razorpay.key_secret;
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;

  try {
    logger.info('Validating signature...');
    const isValidSignature = validateWebhookSignature(body, razorpay_signature, secret);
    
    if (isValidSignature) {
      logger.info('Signature is valid');
      
      // Update the order status
      const orders = readData();
      const orderIndex = orders.findIndex(o => o.order_id === razorpay_order_id);
      
      if (orderIndex !== -1) {
        orders[orderIndex].status = 'paid';
        orders[orderIndex].payment_id = razorpay_payment_id;
        orders[orderIndex].paid_at = new Date().toISOString();
        writeData(orders);
        logger.info(`Order updated in local storage: ${JSON.stringify(orders[orderIndex])}`);
      } else {
        logger.warn('Order not found in local storage');
      }

      res.status(200).json({ 
        status: 'ok',
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id
      });
    } else {
      logger.warn('Signature validation failed');
      res.status(400).json({ 
        status: 'verification_failed',
        message: 'Invalid signature provided'
      });
    }
  } catch (error) {
    logger.error(`ERROR during verification: ${error.message}`);
    res.status(500).json({ 
      status: 'error', 
      error: 'VERIFICATION_FAILED',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Enhanced success page with dynamic content
app.get('/payment-success', (req, res) => {
  logger.info('\n--- PAYMENT SUCCESS PAGE REQUEST ---');
  
  // You could pass query parameters to customize the success page
  const { order_id, payment_id } = req.query;
  
  if (order_id) {
    logger.info(`Showing success page for order: ${order_id}`);
    // You could fetch order details here if needed
  }
  
  res.sendFile(path.join(__dirname, 'success.html'));
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'The requested resource was not found'
  });
});

// Enhanced error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server with enhanced configuration
const server = app.listen(port, '0.0.0.0', () => {
  logger.info('\n==================================');
  logger.info(`Server is running on http://localhost:${port}`);
  logger.info('==================================\n');
});

// Enhanced server shutdown handling
const shutdown = () => {
  logger.info('Server is shutting down...');
  server.close(() => {
    logger.info('Server has been stopped');
    process.exit(0);
  });

  // Force shutdown after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forcing shutdown due to timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Enhanced process error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});