const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

  // Create libraries table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS libraries (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      createdAt BIGINT NOT NULL,
      updatedAt BIGINT NOT NULL
    )
  `);

  // Create notes table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id VARCHAR(36) PRIMARY KEY,
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

// ============ Library APIs ============

// Get all libraries
app.get('/api/libraries', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT * FROM libraries ORDER BY createdAt DESC');
    await db.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create library
app.post('/api/libraries', async (req, res) => {
  try {
    const { name } = req.body;
    const id = uuidv4();
    const now = Date.now();
    const db = await getDb();
    await db.execute(
      'INSERT INTO libraries (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
      [id, name, now, now]
    );
    await db.end();
    res.json({ id, name, createdAt: now, updatedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update library
app.put('/api/libraries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const now = Date.now();
    const db = await getDb();
    await db.execute(
      'UPDATE libraries SET name = ?, updatedAt = ? WHERE id = ?',
      [name, now, id]
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
    const { id } = req.params;
    const db = await getDb();
    await db.execute('DELETE FROM notes WHERE libraryId = ?', [id]);
    await db.execute('DELETE FROM libraries WHERE id = ?', [id]);
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
    const { libraryId } = req.params;
    const db = await getDb();
    const [rows] = await db.execute(
      'SELECT * FROM notes WHERE libraryId = ? ORDER BY `order` ASC',
      [libraryId]
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
    const { libraryId, title, content, positionX, positionY } = req.body;
    const id = uuidv4();
    const now = Date.now();
    const db = await getDb();

    // Get max order
    const [rows] = await db.execute(
      'SELECT MAX(`order`) as maxOrder FROM notes WHERE libraryId = ?',
      [libraryId]
    );
    const order = (rows[0].maxOrder || 0) + 1;

    await db.execute(
      `INSERT INTO notes (id, libraryId, title, content, \`order\`, positionX, positionY, zIndex, sizeMultiplier, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, libraryId, title, content || '', order, positionX || 0, positionY || 0, 0, 1.0, now, now]
    );
    await db.end();
    res.json({ id, libraryId, title, content, order, positionX, positionY, rotation: 0, zIndex: 0, sizeMultiplier: 1.0, createdAt: now, updatedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update note
app.put('/api/notes/:id', async (req, res) => {
  try {
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

    await db.execute(
      `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`,
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
    const { id } = req.params;
    const db = await getDb();
    await db.execute('DELETE FROM notes WHERE id = ?', [id]);
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
