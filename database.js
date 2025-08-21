import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }

    async connect() {
        try {
            const client = await this.pool.connect();
            console.log('✅ Conectado ao banco de dados PostgreSQL');
            client.release();
            return true;
        } catch (error) {
            console.error('❌ Erro ao conectar ao banco:', error.message);
            return false;
        }
    }

    async query(text, params) {
        try {
            const result = await this.pool.query(text, params);
            return result;
        } catch (error) {
            console.error('❌ Erro na query:', error.message);
            throw error;
        }
    }

    async getClient() {
        return await this.pool.connect();
    }

    async close() {
        await this.pool.end();
    }
}

export default Database;
