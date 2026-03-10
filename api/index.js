const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fragment-notes-secret-key-2024';

// Middleware
app.use(cors());
app.use(express.json());

// Simple JWT implementation
function createToken(userId) {
  const payload = JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return crypto.createHash('sha256').update(payload + JWT_SECRET).digest('hex') + '.' + Buffer.from(payload).toString('base64');
}

function verifyToken(token) {
  try {
    const [hash, payload] = token.split('.');
    const expectedHash = crypto.createHash('sha256').update(payload.split('=')[0] + '=' + JSON.parse(Buffer.from(payload, 'base64').toString()).exp + JWT_SECRET).digest('hex');
    if (hash !== expectedHash) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    if (data.exp < Date.now()) return null;
    return data.userId;
  } catch {
    return null;
  }
}

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fragment_notes'
};

// Create database and tables
async function initDatabase() {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
  await connection.query(`USE \`${dbConfig.database}\``);

  // Create users table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      createdAt BIGINT NOT NULL,
      updatedAt BIGINT NOT NULL
    )
  `);

  // Create libraries table with userId
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS libraries (
      id VARCHAR(36) PRIMARY KEY,
      userId VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      createdAt BIGINT NOT NULL,
      updatedAt BIGINT NOT NULL,
      INDEX idx_userId (userId)
    )
  `);

  // Create notes table with userId
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id VARCHAR(36) PRIMARY KEY,
      userId VARCHAR(36) NOT NULL,
      libraryId VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      \`order\` INT DEFAULT 0,
      positionX INT DEFAULT 0,
      positionY INT DEFAULT 0,
      rotation INT DEFAULT 0,
      zIndex INT DEFAULT 0,
      sizeMultiplier FLOAT DEFAULT 1.0,
      createdAt BIGINT NOT NULL,
      updatedAt BIGINT NOT NULL,
      INDEX idx_userId (userId),
      FOREIGN KEY (libraryId) REFERENCES libraries(id) ON DELETE CASCADE
    )
  `);

  console.log('Database initialized successfully');
  await connection.end();
}

// Get database connection
async function getDb() {
  return await mysql.createConnection(dbConfig);
}

// ============ Auth APIs ============

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const id = uuidv4();
    const now = Date.now();
    // Simple password hashing
    const hashedPassword = crypto.createHash('sha256').update(password + 'salt').digest('hex');

    const db = await getDb();
    await db.execute(
      'INSERT INTO users (id, username, password, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [id, username, hashedPassword, email || null, now, now]
    );
    await db.end();

    const token = createToken(id);
    res.json({ token, user: { id, username, email } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: '用户名已存在' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password + 'salt').digest('hex');
    const db = await getDb();
    const [rows] = await db.execute(
      'SELECT id, username, email FROM users WHERE username = ? AND password = ?',
      [username, hashedPassword]
    );
    await db.end();

    if (rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = rows[0];
    const token = createToken(user.id);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const userId = verifyToken(token);
    if (!userId) {
      return res.status(401).json({ error: '登录已过期' });
    }

    const db = await getDb();
    const [rows] = await db.execute(
      'SELECT id, username, email, createdAt FROM users WHERE id = ?',
      [userId]
    );
    await db.end();

    if (rows.length === 0) {
      return res.status(401).json({ error: '用户不存在' });
    }

    res.json({ user: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auth middleware
function getUserId(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  return verifyToken(token);
}

// ============ Library APIs ============

// Get all libraries
app.get('/api/libraries', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const db = await getDb();
    const [rows] = await db.execute('SELECT * FROM libraries WHERE userId = ? ORDER BY createdAt DESC', [userId]);
    await db.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create library
app.post('/api/libraries', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const { name } = req.body;
    const id = uuidv4();
    const now = Date.now();
    const db = await getDb();
    await db.execute(
      'INSERT INTO libraries (id, userId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [id, userId, name, now, now]
    );
    await db.end();
    res.json({ id, userId, name, createdAt: now, updatedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update library
app.put('/api/libraries/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const { id } = req.params;
    const { name } = req.body;
    const now = Date.now();
    const db = await getDb();
    await db.execute(
      'UPDATE libraries SET name = ?, updatedAt = ? WHERE id = ? AND userId = ?',
      [name, now, id, userId]
    );
    await db.end();
    res.json({ id, name, updatedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete library
app.delete('/api/libraries/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const { id } = req.params;
    const db = await getDb();
    await db.execute('DELETE FROM notes WHERE libraryId = ? AND userId = ?', [id, userId]);
    await db.execute('DELETE FROM libraries WHERE id = ? AND userId = ?', [id, userId]);
    await db.end();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Note APIs ============

// Get notes by library
app.get('/api/libraries/:libraryId/notes', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const { libraryId } = req.params;
    const db = await getDb();
    const [rows] = await db.execute(
      'SELECT * FROM notes WHERE libraryId = ? AND userId = ? ORDER BY `order` ASC',
      [libraryId, userId]
    );
    await db.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create note
app.post('/api/notes', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const { libraryId, title, content, positionX, positionY } = req.body;
    const id = uuidv4();
    const now = Date.now();
    const db = await getDb();

    // Get max order
    const [rows] = await db.execute(
      'SELECT MAX(`order`) as maxOrder FROM notes WHERE libraryId = ? AND userId = ?',
      [libraryId, userId]
    );
    const order = (rows[0].maxOrder || 0) + 1;

    await db.execute(
      `INSERT INTO notes (id, userId, libraryId, title, content, \`order\`, positionX, positionY, zIndex, sizeMultiplier, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, libraryId, title, content || '', order, positionX || 0, positionY || 0, 0, 1.0, now, now]
    );
    await db.end();
    res.json({ id, userId, libraryId, title, content, order, positionX, positionY, rotation: 0, zIndex: 0, sizeMultiplier: 1.0, createdAt: now, updatedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update note
app.put('/api/notes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const { id } = req.params;
    const { title, content, order, positionX, positionY, rotation, zIndex, sizeMultiplier } = req.body;
    const now = Date.now();
    const db = await getDb();

    const updates = [];
    const values = [];

    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (content !== undefined) { updates.push('content = ?'); values.push(content); }
    if (order !== undefined) { updates.push('`order` = ?'); values.push(order); }
    if (positionX !== undefined) { updates.push('positionX = ?'); values.push(positionX); }
    if (positionY !== undefined) { updates.push('positionY = ?'); values.push(positionY); }
    if (rotation !== undefined) { updates.push('rotation = ?'); values.push(rotation); }
    if (zIndex !== undefined) { updates.push('zIndex = ?'); values.push(zIndex); }
    if (sizeMultiplier !== undefined) { updates.push('sizeMultiplier = ?'); values.push(sizeMultiplier); }

    updates.push('updatedAt = ?');
    values.push(now);
    values.push(id);
    values.push(userId);

    await db.execute(
      `UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND userId = ?`,
      values
    );
    await db.end();
    res.json({ success: true, updatedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete note
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: '请先登录' });

    const { id } = req.params;
    const db = await getDb();
    await db.execute('DELETE FROM notes WHERE id = ? AND userId = ?', [id, userId]);
    await db.end();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// For Vercel serverless
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, async () => {
    await initDatabase();
    console.log(`Server running on port ${PORT}`);
  });
}
