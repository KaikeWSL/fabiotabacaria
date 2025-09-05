import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

class Database {
    constructor() {
        // Configuração otimizada do pool de conexões
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? {
                rejectUnauthorized: false
            } : false,
            // Configurações otimizadas de performance
            max: 20, // máximo de 20 conexões no pool
            min: 2,  // mínimo de 2 conexões sempre ativas
            idleTimeoutMillis: 30000, // 30 segundos para timeout de idle
            connectionTimeoutMillis: 10000, // 10 segundos para timeout de conexão
            acquireTimeoutMillis: 10000, // 10 segundos para adquirir conexão do pool
            application_name: 'tabacaria-fabio',
            query_timeout: 15000, // 15 segundos timeout para queries
            statement_timeout: 15000, // 15 segundos timeout para statements
            // Configurar timezone nas conexões
            options: '-c timezone=America/Sao_Paulo'
        });

        // Event listeners para monitoramento
        this.pool.on('connect', (client) => {
            console.log('🔗 Nova conexão estabelecida');
            client.query("SET timezone = 'America/Sao_Paulo'").catch(err => {
                console.error('❌ Erro ao configurar timezone:', err);
            });
        });

        this.pool.on('acquire', () => {
            console.log('📥 Conexão adquirida do pool');
        });

        this.pool.on('release', () => {
            console.log('📤 Conexão retornada ao pool');
        });

        this.pool.on('error', (err) => {
            console.error('❌ Erro no pool de conexões:', err);
        });

        this.pool.on('remove', () => {
            console.log('🗑️ Conexão removida do pool');
        });

        // Estatísticas do pool
        this.logPoolStats = () => {
            const stats = {
                total: this.pool.totalCount,
                idle: this.pool.idleCount,
                waiting: this.pool.waitingCount
            };
            console.log('📊 Pool stats:', stats);
        };
    }

    async connect() {
        let client;
        try {
            console.log('🔄 Tentando conectar ao banco de dados...');
            
            // Teste de conexão inicial
            client = await this.pool.connect();
            console.log('✅ Conectado ao banco de dados PostgreSQL');
            
            // Configurar timezone para Brasília
            await client.query("SET timezone = 'America/Sao_Paulo'");
            console.log('🇧🇷 Timezone configurado para Brasília');
            
            // Teste básico com timeout
            const result = await client.query('SELECT NOW() as current_time, version() as db_version');
            console.log('✅ Teste de conexão executado:', {
                time: result.rows[0].current_time,
                version: result.rows[0].db_version.split(' ')[0] + ' ' + result.rows[0].db_version.split(' ')[1]
            });
            
            // Log das estatísticas do pool
            this.logPoolStats();
            
            return true;
        } catch (error) {
            console.error('❌ Erro ao conectar ao banco:', error.message);
            
            // Log detalhado em desenvolvimento
            if (process.env.NODE_ENV === 'development') {
                console.error('❌ Stack trace:', error.stack);
            }
            
            // Verificar se é erro de SSL
            if (error.message.includes('SSL')) {
                console.log('💡 Dica: Verifique as configurações de SSL');
            }
            
            // Verificar se é erro de timeout
            if (error.message.includes('timeout')) {
                console.log('💡 Dica: Banco pode estar sobrecarregado, tentando novamente...');
            }
            
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    async query(text, params = []) {
        const start = Date.now();
        let client;
        
        try {
            // Log da query em desenvolvimento
            if (process.env.NODE_ENV === 'development') {
                console.log('🔍 Executando query:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
                if (params && params.length > 0) {
                    console.log('📊 Parâmetros:', params);
                }
            }
            
            client = await this.pool.connect();
            const result = await client.query(text, params);
            
            const duration = Date.now() - start;
            
            if (process.env.NODE_ENV === 'development') {
                console.log(`✅ Query executada em ${duration}ms. Linhas: ${result.rowCount || result.rows?.length || 0}`);
            }
            
            // Log queries lentas (> 1 segundo)
            if (duration > 1000) {
                console.warn(`⚠️ Query lenta detectada (${duration}ms):`, text.substring(0, 200));
            }
            
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            console.error(`❌ Erro na query após ${duration}ms:`, error.message);
            
            // Log detalhado em desenvolvimento
            if (process.env.NODE_ENV === 'development') {
                console.error('❌ Query que falhou:', text);
                console.error('❌ Parâmetros:', params);
                console.error('❌ Stack trace:', error.stack);
            }
            
            // Verificar tipos específicos de erro
            if (error.code === '23505') {
                throw new Error('Registro já existe (duplicação)');
            } else if (error.code === '23503') {
                throw new Error('Violação de chave estrangeira');
            } else if (error.code === '42P01') {
                throw new Error('Tabela não encontrada');
            } else if (error.code === '42703') {
                throw new Error('Coluna não encontrada');
            }
            
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    // Método para obter uma conexão do pool (para transações)
    async getClient() {
        try {
            const client = await this.pool.connect();
            console.log('📝 Conexão obtida para transação');
            return client;
        } catch (error) {
            console.error('❌ Erro ao obter conexão para transação:', error);
            throw error;
        }
    }

    // Método para executar transações de forma segura
    async transaction(callback) {
        const client = await this.getClient();
        
        try {
            await client.query('BEGIN');
            console.log('🚀 Transação iniciada');
            
            const result = await callback(client);
            
            await client.query('COMMIT');
            console.log('✅ Transação confirmada');
            
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('🔄 Transação revertida:', error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    // Método para verificar o status da conexão
    async isConnected() {
        try {
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            return true;
        } catch (error) {
            console.error('❌ Verificação de conexão falhou:', error.message);
            return false;
        }
    }

    // Método para obter estatísticas do pool
    getPoolStats() {
        return {
            total_connections: this.pool.totalCount,
            idle_connections: this.pool.idleCount,
            waiting_requests: this.pool.waitingCount,
            max_connections: this.pool.options.max,
            min_connections: this.pool.options.min
        };
    }

    // Método para executar queries em lote (batch)
    async batchQuery(queries) {
        const client = await this.getClient();
        
        try {
            await client.query('BEGIN');
            const results = [];
            
            for (const { text, params } of queries) {
                const result = await client.query(text, params);
                results.push(result);
            }
            
            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Método para fechar todas as conexões
    async close() {
        try {
            console.log('🔄 Fechando pool de conexões...');
            
            // Log final das estatísticas
            const finalStats = this.getPoolStats();
            console.log('📊 Estatísticas finais do pool:', finalStats);
            
            await this.pool.end();
            console.log('✅ Pool de conexões fechado');
        } catch (error) {
            console.error('❌ Erro ao fechar pool:', error.message);
            throw error;
        }
    }

    // Método para criar as tabelas necessárias (migrations)
    async createTables() {
        const queries = [
            // Clientes
            `CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Produtos
            `CREATE TABLE IF NOT EXISTS produtos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                preco_custo DECIMAL(10,2) DEFAULT 0,
                preco_venda DECIMAL(10,2) DEFAULT 0,
                preco_fiado DECIMAL(10,2) DEFAULT 0,
                quantidade_estoque INTEGER DEFAULT 0,
                estoque_minimo INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Vendas
            `CREATE TABLE IF NOT EXISTS vendas (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id),
                total DECIMAL(10,2) NOT NULL DEFAULT 0,
                is_fiado BOOLEAN DEFAULT FALSE,
                pago BOOLEAN DEFAULT FALSE,
                data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Itens de venda
            `CREATE TABLE IF NOT EXISTS itens_venda (
                id SERIAL PRIMARY KEY,
                venda_id INTEGER REFERENCES vendas(id) ON DELETE CASCADE,
                produto_id INTEGER REFERENCES produtos(id),
                quantidade INTEGER NOT NULL DEFAULT 1,
                preco_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
                subtotal DECIMAL(10,2) NOT NULL DEFAULT 0
            )`,
            
            // Produtos favoritos
            `CREATE TABLE IF NOT EXISTS produtos_favoritos (
                id SERIAL PRIMARY KEY,
                produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(produto_id)
            )`,
            
            // Índices para performance
            `CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data_venda)`,
            `CREATE INDEX IF NOT EXISTS idx_vendas_cliente ON vendas(cliente_id)`,
            `CREATE INDEX IF NOT EXISTS idx_vendas_fiado ON vendas(is_fiado, pago)`,
            `CREATE INDEX IF NOT EXISTS idx_produtos_estoque ON produtos(quantidade_estoque, estoque_minimo)`,
            `CREATE INDEX IF NOT EXISTS idx_itens_venda ON itens_venda(venda_id, produto_id)`,
            `CREATE INDEX IF NOT EXISTS idx_produtos_favoritos ON produtos_favoritos(produto_id)`
        ];

        try {
            console.log('🏗️ Criando/verificando estrutura das tabelas...');
            
            for (const query of queries) {
                await this.query(query);
            }
            
            console.log('✅ Estrutura das tabelas verificada/criada');
        } catch (error) {
            console.error('❌ Erro ao criar tabelas:', error);
            throw error;
        }
    }
}

export default Database;