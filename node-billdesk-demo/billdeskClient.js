require('dotenv').config();
const crypto = require('crypto');

// BillDesk constants from environment variables
const BD_MID = process.env.BD_MID;
const BD_SEC_ID = process.env.BD_SEC_ID;
const BD_CHECKSUM_KEY = process.env.BD_CHECKSUM_KEY; 
const BD_REDIRECT_URL = process.env.BD_BASE_URL; // BillDesk URL for payment request

/**
 * Generate a valid CustomerID (8 characters: 3 uppercase letters + 5 numbers)
 */
function generateCustomerID() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';

  // Generate 3 random uppercase letters (e.g., ARP)
  const randomLetters = Array.from({ length: 3 }, () => letters.charAt(Math.floor(Math.random() * letters.length))).join('');
  
  // Generate 5 random digits (e.g., 10234)
  const randomDigits = Array.from({ length: 5 }, () => digits.charAt(Math.floor(Math.random() * digits.length))).join('');

  // Use timestamp to add additional characters if necessary
  const timestamp = Date.now().toString().slice(-3); // Last 3 digits of timestamp for uniqueness

  // Combine letters, digits, and timestamp to form CustomerID
  let customerID = randomLetters + randomDigits + timestamp;

  // Ensure the CustomerID has at least 8 characters
  if (customerID.length < 8) {
    // Add extra random digits if necessary to make the ID at least 8 characters long
    const extraDigits = Array.from({ length: 8 - customerID.length }, () => digits.charAt(Math.floor(Math.random() * digits.length))).join('');
    customerID += extraDigits;
  }

  return customerID;
}


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
 * Create checksum using HMAC-SHA256
 */
function generateChecksum(payloadStr) {
  // Generate the checksum using the Checksum Key provided by BillDesk as the secret key
  const checksum = crypto
    .createHmac('sha256', BD_CHECKSUM_KEY) // Use the provided Checksum Key for checksum generation
    .update(payloadStr)                   // Update with the payload string (message)
    .digest('hex');                       // Generate the checksum in hexadecimal format

  console.log("🔐 Generated checksum (hexadecimal):", checksum);  // Debug log for checksum
  
  return checksum.toUpperCase();  // Return the checksum in hexadecimal format
}

/**
 * Generate a payment URL for redirection to BillDesk
 */
async function generatePaymentUrl({ amount, paymentOption }, req) {
  console.log("📩 Received from frontend:", { amount });

  const merchantTransactionId = generateOrderId(); // Generate the order ID using our function
  const customerReferenceNumber = generateCustomerID(); // Generate valid CustomerID

  // Construct the pipe-separated message as per BillDesk's requirements
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
    'http://yourdomain.com/payment/response', // Return URL
  ].join('|'); // Join all fields with pipe separator

  console.log("📦 Constructed msg:", msg);

  // Generate checksum for the message and append it at the end
  const checksum = generateChecksum(msg);
  const finalMsg = msg + '|' + checksum; // Append checksum to the message

  // Construct the full redirect URL (no encoding applied here as per BillDesk's instructions)
  const redirectUrl = BD_REDIRECT_URL + finalMsg;

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
    merchantTransactionId,
    fullPayload: finalMsg,
    bdOrderId: merchantTransactionId, // Using the same generated order ID
    customerReferenceNumber,
  };
}

module.exports = { generatePaymentUrl };
