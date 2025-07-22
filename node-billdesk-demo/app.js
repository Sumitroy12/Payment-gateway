require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { generatePaymentUrl } = require('./billdeskClient');
const db = require('./db'); // optional

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // index.html

app.get('/api/health', (req, res) => {
  res.json({ status: 'UP' });
});

// ⬇️ Main createOrder endpoint
app.post('/api/createOrder', async (req, res) => {
  try {
    // Pass the `req` object to generatePaymentUrl to access headers and get the IP
    const { redirectUrl, merchantTransactionId, base64Msg, fullPayload, bdOrderId, authToken } = await generatePaymentUrl(req.body, req);

    console.log("📤 Generated redirect URL:", redirectUrl);

    // Optional DB store
    try {
      await db.save('orders', {
        createdAt: new Date(),
        requestAmount: req.body.amount,
        merchantTransactionId,
        bdOrderId,
        authToken,
        redirectUrl,
        rawPayload: fullPayload
      });
    } catch (err) {
      console.warn('⚠️ DB log failed:', err.message);
    }

    // ✅ Respond only with the final redirect URL
    res.json({ redirectUrl });
  } catch (err) {
    console.error('❌ Failed to create redirect URL:', err.message);
    res.status(500).json({
      error: 'Failed to create encoded redirect',
      details: err.message,
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 BillDesk server running at http://localhost:${PORT}`);
});
