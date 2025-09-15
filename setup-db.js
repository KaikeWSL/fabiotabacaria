import Database from './database.js';

const db = new Database();

async function setupDatabase() {
    console.log('🔧 Configurando banco de dados...');

    try {
        // Conectar ao banco
        const connected = await db.connect();
        if (!connected) {
            throw new Error('Falha na conexão com o banco');
        }

        console.log('📋 Verificando/criando tabelas...');

        // Criar tabela produtos
        await db.query(`
            CREATE TABLE IF NOT EXISTS produtos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                preco_custo DECIMAL(10,2) DEFAULT 0,
                preco_venda DECIMAL(10,2) DEFAULT 0,
                preco_fiado DECIMAL(10,2) DEFAULT 0,
                quantidade_estoque INTEGER DEFAULT 0,
                estoque_minimo INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela produtos OK');

        // Criar tabela clientes
        await db.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela clientes OK');

        // Criar tabela vendas
        await db.query(`
            CREATE TABLE IF NOT EXISTS vendas (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id),
                total DECIMAL(10,2) NOT NULL,
                is_fiado BOOLEAN DEFAULT FALSE,
                pago BOOLEAN DEFAULT TRUE,
                data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_pagamento TIMESTAMP
            )
        `);
        console.log('✅ Tabela vendas OK');

        // Criar tabela itens_venda
        await db.query(`
            CREATE TABLE IF NOT EXISTS itens_venda (
                id SERIAL PRIMARY KEY,
                venda_id INTEGER REFERENCES vendas(id),
                produto_id INTEGER REFERENCES produtos(id),
                quantidade INTEGER NOT NULL,
                preco_unitario DECIMAL(10,2) NOT NULL,
                subtotal DECIMAL(10,2) DEFAULT 0
            )
        `);
        console.log('✅ Tabela itens_venda OK');

        // Criar tabela consumo
        await db.query(`
            CREATE TABLE IF NOT EXISTS consumo (
                id SERIAL PRIMARY KEY,
                produto_id INTEGER REFERENCES produtos(id),
                produto_nome VARCHAR(255) NOT NULL,
                quantidade INTEGER NOT NULL,
                preco_unitario DECIMAL(10,2) NOT NULL,
                total DECIMAL(10,2) NOT NULL,
                observacao TEXT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela consumo OK');

        // Criar tabela pagamentos_fiado
        await db.query(`
            CREATE TABLE IF NOT EXISTS pagamentos_fiado (
                id SERIAL PRIMARY KEY,
                venda_id INTEGER REFERENCES vendas(id),
                cliente_id INTEGER REFERENCES clientes(id),
                valor_pagamento DECIMAL(10,2) NOT NULL,
                data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                observacao TEXT
            )
        `);
        console.log('✅ Tabela pagamentos_fiado OK');

        // Verificar dados existentes
        const produtosCount = await db.query('SELECT COUNT(*) FROM produtos');
        const clientesCount = await db.query('SELECT COUNT(*) FROM clientes');
        const consumoCount = await db.query('SELECT COUNT(*) FROM consumo');
        
        console.log(`📊 Produtos existentes: ${produtosCount.rows[0].count}`);
        console.log(`📊 Clientes existentes: ${clientesCount.rows[0].count}`);
        console.log(`📊 Consumos registrados: ${consumoCount.rows[0].count}`);

        console.log('🎉 Banco de dados configurado com sucesso!');

    } catch (error) {
        console.error('❌ Erro ao configurar banco:', error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

setupDatabase();
