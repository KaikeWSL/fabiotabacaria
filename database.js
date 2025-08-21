import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });
    }

    async connect() {
        try {
            const client = await this.pool.connect();
            console.log('✅ Conectado ao banco de dados PostgreSQL');
            
            // Teste básico
            const result = await client.query('SELECT NOW()');
            console.log('✅ Teste de query executado:', result.rows[0]);
            
            client.release();
            return true;
        } catch (error) {
            console.error('❌ Erro ao conectar ao banco:', error.message);
            console.error('❌ Stack trace:', error.stack);
            return false;
        }
    }

    async query(text, params) {
        try {
            console.log('🔍 Executando query:', text);
            console.log('📊 Parâmetros:', params);
            
            const result = await this.pool.query(text, params);
            
            console.log('✅ Query executada com sucesso. Linhas afetadas:', result.rowCount);
            return result;
        } catch (error) {
            console.error('❌ Erro na query:', error.message);
            console.error('❌ Query que falhou:', text);
            console.error('❌ Parâmetros:', params);
            console.error('❌ Stack trace:', error.stack);
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
