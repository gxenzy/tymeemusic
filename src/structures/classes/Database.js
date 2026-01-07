import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { logger } from '#utils/logger';

const require = createRequire(import.meta.url);
const fs = require('fs-extra');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isBun = !!process.versions.bun;

// Select the appropriate driver based on runtime
let Driver;
if (isBun) {
	try {
		// Bun's native SQLite
		Driver = require('bun:sqlite').Database;
	} catch (e) {
		logger.error('Database', 'Failed to load bun:sqlite', e);
	}
} else {
	try {
		// Node's better-sqlite3
		Driver = require('better-sqlite3');
	} catch (e) {
		logger.error('Database', 'Failed to load better-sqlite3. Ensure it is installed in node_modules.', e);
	}
}

export class Database {
	constructor(dbPath) {
		this.path = path.resolve(__dirname, '..', '..', dbPath);
		fs.ensureDirSync(path.dirname(this.path));

		try {
			if (isBun) {
				// Bun:SQLite syntax
				this.db = new Driver(this.path, { create: true });
				this.db.exec('PRAGMA journal_mode = WAL;');
				this.db.exec('PRAGMA synchronous = NORMAL;');
			} else {
				// Better-SQLite3 syntax
				this.db = new Driver(this.path);
				this.db.pragma('journal_mode = WAL');
				this.db.pragma('synchronous = NORMAL');
			}
		} catch (error) {
			logger.error('Database', `Failed to connect to ${path.basename(dbPath)}`, error);
			throw error;
		}
	}

	// Helper to normalize the API differences between Bun:SQLite and Better-SQLite3
	getStatement(sql) {
		if (isBun) {
			return this.db.query(sql);
		} else {
			return this.db.prepare(sql);
		}
	}

	exec(sql, params = []) {
		try {
			if (isBun) {
				return this.getStatement(sql).run(...params);
			} else {
				// better-sqlite3 .run() returns { changes, lastInsertRowid }
				return this.getStatement(sql).run(...params);
			}
		} catch (error) {
			logger.error('Database', `Failed to execute SQL: ${sql}`, error);
			throw error;
		}
	}

	get(sql, params = []) {
		try {
			if (isBun) {
				return this.getStatement(sql).get(...params);
			} else {
				return this.getStatement(sql).get(...params);
			}
		} catch (error) {
			logger.error('Database', `Failed to get row: ${sql}`, error);
			throw error;
		}
	}

	all(sql, params = []) {
		try {
			if (isBun) {
				return this.getStatement(sql).all(...params);
			} else {
				return this.getStatement(sql).all(...params);
			}
		} catch (error) {
			logger.error('Database', `Failed to get all rows: ${sql}`, error);
			throw error;
		}
	}

	// Legacy method support if needed, maps to our helper
	prepare(sql) {
		return this.getStatement(sql);
	}

	close() {
		try {
			this.db.close();
			logger.info('Database', `Closed connection to ${path.basename(this.path)}`);
		} catch (error) {
			logger.error('Database', `Failed to close connection to ${path.basename(this.path)}`, error);
		}
	}
}
