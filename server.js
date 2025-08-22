import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Database from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Database instance
const db = new Database();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Conectar ao banco na inicialização
await db.connect();

// Inicializar estrutura do banco
async function initializeDatabase() {
    try {
        console.log('🔧 Verificando estrutura do banco...');
        
        // Verificar se a coluna valor_pago existe
        const checkColumn = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'vendas' AND column_name = 'valor_pago'
        `);

        if (checkColumn.rows.length === 0) {
            console.log('🔧 Adicionando coluna valor_pago...');
            try {
                await db.query(`
                    ALTER TABLE vendas 
                    ADD COLUMN valor_pago DECIMAL(10,2) DEFAULT 0
                `);
                console.log('✅ Coluna valor_pago adicionada');
            } catch (alterError) {
                console.log('⚠️ Erro ao adicionar coluna valor_pago:', alterError.message);
            }
        }

        // Verificar se a tabela pagamentos existe
        const checkTable = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'pagamentos'
        `);

        if (checkTable.rows.length === 0) {
            console.log('🔧 Criando tabela pagamentos...');
            try {
                await db.query(`
                    CREATE TABLE pagamentos (
                        id SERIAL PRIMARY KEY,
                        venda_id INTEGER REFERENCES vendas(id),
                        valor DECIMAL(10,2) NOT NULL,
                        data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ Tabela pagamentos criada');
            } catch (createError) {
                console.log('⚠️ Erro ao criar tabela pagamentos:', createError.message);
            }
        }

        console.log('✅ Banco de dados verificado');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
        // Não falha a aplicação, apenas registra o erro
    }
}

await initializeDatabase();

// Routes

// Authentication
app.post('/api/auth', async (req, res) => {
    try {
        const { senha } = req.body;
        
        if (senha === 'fabio151443') {
            res.json({
                success: true,
                message: 'Login realizado com sucesso'
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Senha incorreta'
            });
        }
    } catch (error) {
        console.error('Erro na autenticação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Dashboard
app.get('/api/dashboard', async (req, res) => {
    try {
        // Vendas hoje
        const vendasHoje = await db.query(`
            SELECT COALESCE(SUM(total), 0) as vendas_hoje 
            FROM vendas 
            WHERE DATE(data_venda) = CURRENT_DATE
        `);

        // Vendas do mês
        const vendasMes = await db.query(`
            SELECT COALESCE(SUM(total), 0) as vendas_mes 
            FROM vendas 
            WHERE EXTRACT(MONTH FROM data_venda) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM data_venda) = EXTRACT(YEAR FROM CURRENT_DATE)
        `);

        // Total fiado
        const totalFiado = await db.query(`
            SELECT COALESCE(SUM(total), 0) as total_fiado 
            FROM vendas 
            WHERE is_fiado = true AND pago = false
        `);

        // Produtos com estoque baixo
        const estoqueBaixo = await db.query(`
            SELECT COUNT(*) as estoque_baixo 
            FROM produtos 
            WHERE quantidade_estoque <= estoque_minimo
        `);

        res.json({
            vendas_hoje: parseFloat(vendasHoje.rows[0].vendas_hoje),
            vendas_mes: parseFloat(vendasMes.rows[0].vendas_mes),
            total_fiado: parseFloat(totalFiado.rows[0].total_fiado),
            estoque_baixo: parseInt(estoqueBaixo.rows[0].estoque_baixo)
        });

    } catch (error) {
        console.error('Erro no dashboard:', error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// Produtos
app.get('/api/produtos', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, nome, preco_custo, preco_venda, preco_fiado, 
                   quantidade_estoque, estoque_minimo 
            FROM produtos 
            ORDER BY nome
        `);

        const produtos = result.rows.map(produto => ({
            ...produto,
            preco_custo: parseFloat(produto.preco_custo),
            preco_venda: parseFloat(produto.preco_venda),
            preco_fiado: parseFloat(produto.preco_fiado)
        }));

        res.json(produtos);
    } catch (error) {
        console.error('Erro ao listar produtos:', error);
        res.status(500).json({ error: 'Erro ao carregar produtos' });
    }
});

app.get('/api/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT id, nome, preco_custo, preco_venda, preco_fiado, 
                   quantidade_estoque, estoque_minimo 
            FROM produtos 
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        const produto = result.rows[0];
        produto.preco_custo = parseFloat(produto.preco_custo);
        produto.preco_venda = parseFloat(produto.preco_venda);
        produto.preco_fiado = parseFloat(produto.preco_fiado);

        res.json(produto);
    } catch (error) {
        console.error('Erro ao buscar produto:', error);
        res.status(500).json({ error: 'Erro ao buscar produto' });
    }
});

app.post('/api/produtos', async (req, res) => {
    try {
        console.log('📦 Recebendo criação de produto:', req.body);
        
        const { nome, preco_custo, preco_venda, preco_fiado, quantidade_estoque, estoque_minimo } = req.body;

        // Validação básica
        if (!nome || nome.trim().length === 0) {
            return res.status(400).json({ error: 'Nome do produto é obrigatório' });
        }

        console.log('✅ Dados validados, inserindo produto...');

        const result = await db.query(`
            INSERT INTO produtos (nome, preco_custo, preco_venda, preco_fiado, quantidade_estoque, estoque_minimo)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [nome, preco_custo, preco_venda, preco_fiado, quantidade_estoque, estoque_minimo]);

        console.log('✅ Produto criado com ID:', result.rows[0].id);

        res.json({
            id: result.rows[0].id,
            message: 'Produto criado com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro detalhado ao criar produto:', error);
        res.status(500).json({ error: `Erro ao criar produto: ${error.message}` });
    }
});

app.put('/api/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, preco_custo, preco_venda, preco_fiado, quantidade_estoque, estoque_minimo } = req.body;

        const result = await db.query(`
            UPDATE produtos 
            SET nome = $1, preco_custo = $2, preco_venda = $3, preco_fiado = $4, 
                quantidade_estoque = $5, estoque_minimo = $6
            WHERE id = $7
        `, [nome, preco_custo, preco_venda, preco_fiado, quantidade_estoque, estoque_minimo, id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        res.json({ message: 'Produto atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
});

// Clientes
app.get('/api/clientes', async (req, res) => {
    try {
        const result = await db.query('SELECT id, nome FROM clientes ORDER BY nome');
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao listar clientes:', error);
        res.status(500).json({ error: 'Erro ao carregar clientes' });
    }
});

app.get('/api/clientes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT id, nome FROM clientes WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar cliente:', error);
        res.status(500).json({ error: 'Erro ao buscar cliente' });
    }
});

app.post('/api/clientes', async (req, res) => {
    try {
        console.log('👤 Recebendo criação de cliente:', req.body);
        
        const { nome } = req.body;

        // Validação básica
        if (!nome || nome.trim().length === 0) {
            return res.status(400).json({ error: 'Nome do cliente é obrigatório' });
        }

        console.log('✅ Dados validados, inserindo cliente...');

        const result = await db.query(`
            INSERT INTO clientes (nome)
            VALUES ($1)
            RETURNING id
        `, [nome]);

        console.log('✅ Cliente criado com ID:', result.rows[0].id);

        res.json({
            id: result.rows[0].id,
            message: 'Cliente criado com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro detalhado ao criar cliente:', error);
        res.status(500).json({ error: `Erro ao criar cliente: ${error.message}` });
    }
});

app.put('/api/clientes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome } = req.body;

        const result = await db.query('UPDATE clientes SET nome = $1 WHERE id = $2', [nome, id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        res.json({ message: 'Cliente atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar cliente:', error);
        res.status(500).json({ error: 'Erro ao atualizar cliente' });
    }
});

// Vendas
app.post('/api/vendas', async (req, res) => {
    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');
        
        const { cliente_id, total, is_fiado, pago, itens } = req.body;

        // Criar venda
        const vendaResult = await client.query(`
            INSERT INTO vendas (cliente_id, total, is_fiado, pago, data_venda)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id
        `, [cliente_id, total, is_fiado, pago]);

        const vendaId = vendaResult.rows[0].id;

        // Adicionar itens da venda
        for (const item of itens) {
            const subtotal = item.preco_total || (item.quantidade * item.preco_unitario);
            
            await client.query(`
                INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
                VALUES ($1, $2, $3, $4, $5)
            `, [vendaId, item.produto_id, item.quantidade, item.preco_unitario, subtotal]);

            // Atualizar estoque
            await client.query(`
                UPDATE produtos 
                SET quantidade_estoque = quantidade_estoque - $1
                WHERE id = $2
            `, [item.quantidade, item.produto_id]);
        }

        await client.query('COMMIT');
        res.json({
            id: vendaId,
            message: 'Venda realizada com sucesso'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao criar venda:', error);
        res.status(500).json({ error: 'Erro ao processar venda' });
    } finally {
        client.release();
    }
});

// Fiados
app.get('/api/fiados', async (req, res) => {
    try {
        console.log('📋 Buscando fiados...');
        
        // Primeiro, tentar com a nova estrutura (valor_pago)
        let result;
        try {
            result = await db.query(`
                SELECT 
                    v.id,
                    v.total,
                    COALESCE(v.valor_pago, 0) as valor_pago,
                    (v.total - COALESCE(v.valor_pago, 0)) as valor_restante,
                    v.data_venda,
                    v.pago,
                    c.id as cliente_id,
                    c.nome as cliente_nome,
                    'Venda fiado' as descricao
                FROM vendas v
                JOIN clientes c ON v.cliente_id = c.id
                WHERE v.is_fiado = true 
                AND (v.total - COALESCE(v.valor_pago, 0)) > 0
                ORDER BY v.data_venda DESC
            `);
        } catch (error) {
            console.log('⚠️ Coluna valor_pago não existe, usando estrutura antiga...');
            
            // Fallback para estrutura antiga (sem valor_pago)
            result = await db.query(`
                SELECT 
                    v.id,
                    v.total,
                    0 as valor_pago,
                    v.total as valor_restante,
                    v.data_venda,
                    v.pago,
                    c.id as cliente_id,
                    c.nome as cliente_nome,
                    'Venda fiado' as descricao
                FROM vendas v
                JOIN clientes c ON v.cliente_id = c.id
                WHERE v.is_fiado = true AND v.pago = false
                ORDER BY v.data_venda DESC
            `);
        }

        const fiados = result.rows.map(fiado => ({
            ...fiado,
            total: parseFloat(fiado.total),
            valor_pago: parseFloat(fiado.valor_pago || 0),
            valor_restante: parseFloat(fiado.valor_restante)
        }));

        console.log(`📋 Encontrados ${fiados.length} fiados`);
        res.json(fiados);
    } catch (error) {
        console.error('Erro ao listar fiados:', error);
        res.status(500).json({ error: 'Erro ao carregar fiados' });
    }
});

app.get('/api/fiados/cliente/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar vendas fiado do cliente
        const vendasResult = await db.query(`
            SELECT v.id, v.data_venda, v.total, v.pago, c.nome as cliente_nome,
                   v.cliente_id
            FROM vendas v
            JOIN clientes c ON v.cliente_id = c.id
            WHERE v.cliente_id = $1 AND v.is_fiado = true
            ORDER BY v.data_venda DESC
        `, [id]);

        // Para cada venda, buscar os itens
        const vendasDetalhadas = [];
        for (const venda of vendasResult.rows) {
            const itensResult = await db.query(`
                SELECT iv.quantidade, iv.preco_unitario, p.nome as produto_nome
                FROM itens_venda iv
                JOIN produtos p ON iv.produto_id = p.id
                WHERE iv.venda_id = $1
            `, [venda.id]);

            vendasDetalhadas.push({
                id: venda.id,
                data_venda: venda.data_venda.toISOString(),
                total: parseFloat(venda.total),
                pago: venda.pago,
                cliente_nome: venda.cliente_nome,
                cliente_id: venda.cliente_id,
                itens: itensResult.rows.map(item => ({
                    quantidade: item.quantidade,
                    preco_unitario: parseFloat(item.preco_unitario),
                    produto_nome: item.produto_nome
                }))
            });
        }

        res.json(vendasDetalhadas);
    } catch (error) {
        console.error('Erro ao buscar fiados do cliente:', error);
        res.status(500).json({ error: 'Erro ao carregar dados do cliente' });
    }
});

app.post('/api/fiados/pay/:vendaId', async (req, res) => {
    try {
        const { vendaId } = req.params;
        const { valor_pagamento } = req.body;
        
        console.log('💰 Processando pagamento:', { vendaId, valor_pagamento });

        // Verificar se a coluna valor_pago existe
        let vendaResult;
        try {
            vendaResult = await db.query(`
                SELECT total, COALESCE(valor_pago, 0) as valor_pago 
                FROM vendas 
                WHERE id = $1 AND is_fiado = true
            `, [vendaId]);
        } catch (error) {
            // Fallback para estrutura antiga
            console.log('⚠️ Usando estrutura antiga do banco');
            vendaResult = await db.query(`
                SELECT total, 0 as valor_pago 
                FROM vendas 
                WHERE id = $1 AND is_fiado = true AND pago = false
            `, [vendaId]);
        }

        if (vendaResult.rows.length === 0) {
            return res.status(404).json({ error: 'Venda não encontrada' });
        }

        const venda = vendaResult.rows[0];
        const valorAtualPago = parseFloat(venda.valor_pago) || 0;
        const valorTotal = parseFloat(venda.total);
        
        // Se não tem valor_pagamento, pagar total
        const valorPagamento = valor_pagamento ? parseFloat(valor_pagamento) : (valorTotal - valorAtualPago);
        const novoValorPago = valorAtualPago + valorPagamento;

        console.log('💰 Valores:', { 
            valorTotal, 
            valorAtualPago, 
            valorPagamento, 
            novoValorPago 
        });

        // Verificar se não está pagando mais que o devido
        if (novoValorPago > valorTotal) {
            return res.status(400).json({ 
                error: 'Valor do pagamento excede o valor total da venda' 
            });
        }

        // Determinar se está totalmente pago
        const totalmentePago = novoValorPago >= valorTotal;

        // Atualizar a venda (com fallback para estrutura antiga)
        try {
            const updateQuery = totalmentePago 
                ? `UPDATE vendas 
                   SET valor_pago = $1, pago = true, data_pagamento = CURRENT_TIMESTAMP
                   WHERE id = $2`
                : `UPDATE vendas 
                   SET valor_pago = $1
                   WHERE id = $2`;

            await db.query(updateQuery, [novoValorPago, vendaId]);
        } catch (updateError) {
            // Fallback para estrutura antiga (só marca como pago se for total)
            if (totalmentePago) {
                await db.query(`
                    UPDATE vendas 
                    SET pago = true, data_pagamento = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [vendaId]);
            }
        }

        // Tentar registrar o pagamento no histórico
        try {
            await db.query(`
                INSERT INTO pagamentos (venda_id, valor, data_pagamento)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
            `, [vendaId, valorPagamento]);
        } catch (insertError) {
            console.log('⚠️ Não foi possível registrar no histórico:', insertError.message);
        }

        res.json({
            success: true,
            message: totalmentePago 
                ? 'Pagamento total registrado com sucesso' 
                : 'Pagamento parcial registrado com sucesso',
            valor_pago: novoValorPago,
            valor_restante: valorTotal - novoValorPago,
            totalmente_pago: totalmentePago
        });
    } catch (error) {
        console.error('💰 Erro ao processar pagamento:', error);
        res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
});

app.post('/api/fiados/payall/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;

        const result = await db.query(`
            UPDATE vendas 
            SET pago = true, data_pagamento = CURRENT_TIMESTAMP
            WHERE cliente_id = $1 AND is_fiado = true AND pago = false
        `, [clienteId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Nenhuma venda encontrada para quitar' });
        }

        res.json({
            success: true,
            message: `${result.rowCount} venda(s) quitada(s) com sucesso`
        });
    } catch (error) {
        console.error('Erro ao quitar todas as vendas:', error);
        res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
});

// Servir frontend para rotas não encontradas (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log('🌐 Servidor Node.js iniciado!');
    console.log(`📱 Acesse pelo celular: http://SEU_IP:${PORT}`);
    console.log(`💻 Acesse pelo PC: http://localhost:${PORT}`);
    console.log('🔗 Para descobrir seu IP, execute: ipconfig');
    console.log('⚡ Pressione Ctrl+C para parar o servidor');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Parando servidor...');
    await db.close();
    process.exit(0);
});
