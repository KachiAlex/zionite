"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.getDb = getDb;
exports.initDb = initDb;
const pg_1 = require("pg");
const uuid_1 = require("uuid");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_n9ep6PLNzBIS@ep-wandering-block-ahfs3q45-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new pg_1.Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});
function createDbClient(client) {
    return {
        async query(sql, params) {
            return client.query(sql, params);
        },
        async get(sql, params) {
            const result = await client.query(sql, params);
            return result.rows[0];
        },
        async all(sql, params) {
            const result = await client.query(sql, params);
            return result.rows;
        },
        async run(sql, params) {
            const result = await client.query(sql, params);
            return { lastID: 0, changes: result.rowCount || 0 };
        }
    };
}
// Auto-managing db singleton — acquires/releases a client per query
exports.db = {
    async query(sql, params) {
        const client = await pool.connect();
        try {
            return await client.query(sql, params);
        }
        finally {
            client.release();
        }
    },
    async get(sql, params) {
        const result = await this.query(sql, params);
        return result.rows[0];
    },
    async all(sql, params) {
        const result = await this.query(sql, params);
        return result.rows;
    },
    async run(sql, params) {
        const result = await this.query(sql, params);
        return { lastID: 0, changes: result.rowCount || 0 };
    }
};
// Backward-compatible helper — returns the auto-managing singleton
async function getDb() {
    return exports.db;
}
async function initDb() {
    const client = await pool.connect();
    const db = createDbClient(client);
    try {
        await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'listener',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await db.query(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        scripture_reference TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        broadcaster_id TEXT NOT NULL,
        audio_path TEXT,
        stream_key TEXT,
        stream_type TEXT DEFAULT 'church_online',
        church_online_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (broadcaster_id) REFERENCES users(id)
      )
    `);
        await db.query(`
      ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_key TEXT
    `);
        await db.query(`
      ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_type TEXT DEFAULT 'church_online'
    `);
        await db.query(`
      ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS church_online_url TEXT
    `);
        await db.query(`
      CREATE TABLE IF NOT EXISTS sermons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        scripture_reference TEXT,
        speaker TEXT,
        series TEXT,
        audio_url TEXT NOT NULL,
        date TEXT NOT NULL,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await db.query(`
      CREATE TABLE IF NOT EXISTS audio_chunks (
        id TEXT PRIMARY KEY,
        broadcast_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id)
      )
    `);
        // Create chat_messages table
        await db.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        broadcast_id TEXT,
        user_id TEXT,
        user_name TEXT,
        message TEXT NOT NULL,
        is_private BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id)
      )
    `);
        // Create prayer_requests table
        await db.query(`
      CREATE TABLE IF NOT EXISTS prayer_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_name TEXT,
        request TEXT NOT NULL,
        is_private BOOLEAN DEFAULT TRUE,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Create schedule table for recurring services
        await db.query(`
      CREATE TABLE IF NOT EXISTS schedule (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        day_of_week INTEGER NOT NULL,
        time TEXT NOT NULL,
        type TEXT DEFAULT 'service',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Seed default schedule
        const existingSchedule = await db.get('SELECT * FROM schedule LIMIT 1');
        if (!existingSchedule) {
            await db.run(`
        INSERT INTO schedule (id, title, day_of_week, time, type) VALUES 
        ($1, 'Sunday Gathering', 0, '10:00', 'service'),
        ($2, 'Midweek Study', 3, '19:00', 'study'),
        ($3, 'Prayer Meeting', 5, '18:00', 'prayer')
      `, [(0, uuid_1.v4)(), (0, uuid_1.v4)(), (0, uuid_1.v4)()]);
        }
        // Seed an admin user if none exists
        const admin = await db.get('SELECT * FROM users WHERE role = $1', ['admin']);
        if (!admin) {
            const bcrypt = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
            const hash = await bcrypt.hash('admin123', 10);
            await db.run(`INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)`, ['admin-1', 'admin@zionitefm.com', hash, 'Admin User', 'admin']);
        }
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=db.js.map