const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports.save = async (table, data) => {
  const cols = Object.keys(data).join(',');
  const vals = Object.values(data);
  const params = vals.map((_, i) => `$${i+1}`).join(',');
  const sql = `INSERT INTO ${table}(${cols}) VALUES(${params})`;
  await pool.query(sql, vals);
};
