const path = require('path');
const fs = require('fs');

let db = null;
let dbType = process.env.DB_TYPE || 'sqlite';

/**
 * Initialize database connection based on environment configuration
 */
function initDatabase() {
  if (db) {
    return db;
  }

  if (dbType === 'sqlite') {
    const Database = require('better-sqlite3');
    const dbPath = process.env.SQLITE_DB_PATH || './data/adstream.db';

    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Enable query logging in debug mode
    if (process.env.DEBUG === 'true') {
      db.function('debug_log', (sql) => {
        console.log('SQL:', sql);
        return sql;
      });
    }

    return db;
  } else if (dbType === 'postgres') {
    const { Pool } = require('pg');

    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      max: parseInt(process.env.DB_POOL_MAX) || 20
    });

    return db;
  }

  throw new Error(`Unsupported database type: ${dbType}`);
}

/**
 * Get database instance
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    if (dbType === 'sqlite') {
      db.close();
    } else if (dbType === 'postgres') {
      db.end();
    }
    db = null;
  }
}

/**
 * Execute a query with parameters
 * Abstracts differences between SQLite and PostgreSQL
 * Returns a Promise for both database types
 */
function query(sql, params = []) {
  const database = getDatabase();

  if (dbType === 'sqlite') {
    // Convert PostgreSQL-style $1, $2 to SQLite ? placeholders
    const sqliteSql = sql.replace(/\$(\d+)/g, '?');

    return Promise.resolve().then(() => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const rows = database.prepare(sqliteSql).all(...params);
        return { rows };
      } else {
        const result = database.prepare(sqliteSql).run(...params);
        // Normalize result format: SQLite uses 'changes', PostgreSQL uses 'rowCount'
        return { changes: result.changes, rowCount: result.changes };
      }
    });
  } else {
    return database.query(sql, params);
  }
}

/**
 * Execute a query and return a single row
 * Returns a Promise for both database types
 */
function queryOne(sql, params = []) {
  const database = getDatabase();

  if (dbType === 'sqlite') {
    const sqliteSql = sql.replace(/\$(\d+)/g, '?');
    return Promise.resolve(database.prepare(sqliteSql).get(...params));
  } else {
    return database.query(sql, params).then(result => result.rows[0]);
  }
}

/**
 * Run multiple queries in a transaction
 */
function transaction(callback) {
  const database = getDatabase();

  if (dbType === 'sqlite') {
    return database.transaction(callback)();
  } else {
    return database.connect().then(client => {
      return client.query('BEGIN')
        .then(() => callback(client))
        .then(result => {
          return client.query('COMMIT').then(() => result);
        })
        .catch(err => {
          return client.query('ROLLBACK').then(() => {
            throw err;
          });
        })
        .finally(() => client.release());
    });
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,
  query,
  queryOne,
  transaction,
  getDbType: () => dbType
};
