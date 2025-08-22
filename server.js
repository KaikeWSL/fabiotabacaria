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
        const result = await db.query(`
            SELECT c.id, c.nome, COALESCE(SUM(v.total), 0) as total_devido
            FROM clientes c
            LEFT JOIN vendas v ON c.id = v.cliente_id 
            WHERE v.is_fiado = true AND v.pago = false
            GROUP BY c.id, c.nome
            HAVING SUM(v.total) > 0
            ORDER BY total_devido DESC
        `);

        const fiados = result.rows.map(fiado => ({
            ...fiado,
            total_devido: parseFloat(fiado.total_devido)
        }));

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
        console.log('💰 Tentando quitar venda individual:', vendaId);

        // Verificar se a venda existe
        const vendaCheck = await db.query(`
            SELECT id, total, pago FROM vendas 
            WHERE id = $1 AND is_fiado = true
        `, [vendaId]);

        if (vendaCheck.rows.length === 0) {
            console.log('⚠️ Venda não encontrada:', vendaId);
            return res.status(404).json({ error: 'Venda não encontrada' });
        }

        if (vendaCheck.rows[0].pago) {
            console.log('⚠️ Venda já está paga:', vendaId);
            return res.status(400).json({ error: 'Venda já está paga' });
        }

        const result = await db.query(`
            UPDATE vendas 
            SET pago = true, data_pagamento = CURRENT_TIMESTAMP
            WHERE id = $1 AND is_fiado = true
            RETURNING id, total
        `, [vendaId]);

        console.log('✅ Venda quitada:', result.rows[0]);

        res.json({
            success: true,
            message: 'Pagamento registrado com sucesso',
            venda_quitada: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erro ao registrar pagamento:', error);
        console.error('📍 Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento',
            details: error.message
        });
    }
});

app.post('/api/fiados/payall/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;
        console.log('💰 Tentando quitar todas as vendas do cliente:', clienteId);

        // Primeiro, verificar se existem vendas em aberto
        const vendasCheck = await db.query(`
            SELECT id, total FROM vendas 
            WHERE cliente_id = $1 AND is_fiado = true AND pago = false
        `, [clienteId]);

        console.log('📋 Vendas encontradas para quitar:', vendasCheck.rows);

        if (vendasCheck.rows.length === 0) {
            console.log('⚠️ Nenhuma venda em aberto encontrada para o cliente:', clienteId);
            return res.status(404).json({ error: 'Nenhuma venda encontrada para quitar' });
        }

        // Fazer o update
        const result = await db.query(`
            UPDATE vendas 
            SET pago = true, data_pagamento = CURRENT_TIMESTAMP
            WHERE cliente_id = $1 AND is_fiado = true AND pago = false
            RETURNING id, total
        `, [clienteId]);

        console.log('✅ Vendas quitadas:', result.rows);

        res.json({
            success: true,
            message: `${result.rowCount} venda(s) quitada(s) com sucesso`,
            vendas_quitadas: result.rows
        });
    } catch (error) {
        console.error('❌ Erro detalhado ao quitar vendas:', error);
        console.error('📍 Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento',
            details: error.message
        });
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
