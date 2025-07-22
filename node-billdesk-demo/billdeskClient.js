require('dotenv').config();
const axios = require('axios');

// BillDesk constants from environment variables
const BD_MID = process.env.BD_MID;
const BD_SEC_ID = process.env.BD_SEC_ID;
const BD_REDIRECT_URL = process.env.BD_BASE_URL; // BillDesk URL for payment request

/**
 * Generate a unique Order ID with the specified format
 */
function generateOrderId() {
  const timestamp = Date.now(); // Use current timestamp to ensure uniqueness
  const randomString = Math.random().toString(36).substring(2, 10); // Generate random string of 8 characters
  const orderId = `ORD_${timestamp}_${randomString}`; // Combine with prefix and timestamp
  
  // Ensure the generated order ID is within the length constraints (5–30 characters)
  if (orderId.length > 30) {
    return orderId.slice(0, 30); // Truncate if it's longer than 30 characters
  }
  return orderId;
}

/**
 * Generate a unique Customer Reference Number
 */
function generateCustomerID() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';

  // Generate 3 random uppercase letters (e.g., ARP)
  const randomLetters = Array.from({ length: 3 }, () => letters.charAt(Math.floor(Math.random() * letters.length))).join('');
  
  // Generate 5 random digits (e.g., 10234)
  const randomDigits = Array.from({ length: 5 }, () => digits.charAt(Math.floor(Math.random() * digits.length))).join('');
  
  // Combine letters and digits to form CustomerID
  const customerID = randomLetters + randomDigits;

  return customerID;
}

/**
 * Generate a payment URL for redirection to BillDesk
 */
async function generatePaymentUrl({ amount, paymentOption }, req) {
  console.log("📩 Received from frontend:", { amount });

  const merchantTransactionId = generateOrderId(); // Generate the order ID using our function
  const customerReferenceNumber = generateCustomerID(); // Generate unique customer reference number

  // Construct the pipe-separated message as per BillDesk's requirements, with NA placeholders
  const msg = [
    BD_MID,                        // Merchant ID (Provided by BillDesk)
    customerReferenceNumber,        // Unique Customer Reference Number (Generated)
    'NA',                           // Placeholder for unused fields
    amount,                         // Transaction Amount (From frontend)
    'NA',                           // Placeholder for unused fields
    'NA',                           // Placeholder for unused fields
    'NA',                           // Placeholder for unused fields
    'INR',                          // Currency Type (INR for Indian Rupees)
    'NA',                           // Placeholder for unused fields
    'R',                            // TypeField1 (R for retail)
    BD_SEC_ID,                      // Security ID (Provided by BillDesk)
    'NA',                           // Placeholder for unused fields
    'NA',                           // Placeholder for unused fields
    'F',                            // TypeField2 (F for general)
    'NA',                           // Placeholder for additional info fields (txtadditional1)
    'NA',                           // Placeholder for additional info fields (txtadditional2)
    'NA',                           // Placeholder for additional info fields (txtadditional3)
    'NA',                           // Placeholder for additional info fields (txtadditional4)
    'NA',                           // Placeholder for additional info fields (txtadditional5)
    'NA',                           // Placeholder for additional info fields (txtadditional6)
    'NA',                           // Placeholder for additional info fields (txtadditional7)
    'http://www.satsang.org.in/payment_response', // Return URL
  ].join('|'); // Join all fields with pipe separator

  console.log("📦 Constructed msg:", msg);

  // Construct the full redirect URL (no encoding applied here as per BillDesk's instructions)
  const redirectUrl = BD_REDIRECT_URL + msg;

  console.log("🔗 Final redirect URL:", redirectUrl);

  // Store the transaction data and customer reference number in the database
  try {
    await db.save('orders', {
      createdAt: new Date(),
      amount: amount,
      merchantTransactionId,
      customerReferenceNumber,
      redirectUrl,
      status: 'PENDING', // Initially mark as pending
    });
    console.log("✅ Transaction saved to the database");
  } catch (err) {
    console.warn('⚠️ DB log failed:', err.message);
  }

  // Return the redirect URL and other details
  return {
    redirectUrl,
    fullPayload: msg,
    bdOrderId: merchantTransactionId, // Using the same generated order ID
    customerReferenceNumber,
  };
}

module.exports = { generatePaymentUrl };
