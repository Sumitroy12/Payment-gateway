billdesk-demo/
├── server.js           ← Express server with API routes & CORS
├── billdeskClient.js   ← Wrapper for BillDesk REST calls + checksum/security
├── public/
│   └── index.html      ← Test UI for CreateOrder/CreateTransaction
├── db.js               ← PostgreSQL connection and insert helpers
├── .env                ← Contains secrets (never commit!)
└── package.json
