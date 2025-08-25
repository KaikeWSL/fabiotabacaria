import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Database from './database.js';

// Configurar timezone do Node.js para Brasília
process.env.TZ = 'America/Sao_Paulo';

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

// Garantir que a tabela pagamentos_parciais existe
try {
    await db.query(`
        CREATE TABLE IF NOT EXISTS pagamentos_parciais (
            id SERIAL PRIMARY KEY,
            venda_id INTEGER REFERENCES vendas(id),
            valor_pago DECIMAL(10,2) NOT NULL,
            data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            observacao TEXT
        )
    `);
    console.log('✅ Tabela pagamentos_parciais verificada/criada');
} catch (error) {
    console.warn('⚠️ Erro ao criar tabela pagamentos_parciais:', error.message);
}

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

        // Vendas mês passado
        const vendasMesPassado = await db.query(`
            SELECT COALESCE(SUM(total), 0) as vendas_mes_passado 
            FROM vendas 
            WHERE EXTRACT(MONTH FROM data_venda) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
            AND EXTRACT(YEAR FROM data_venda) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
        `);

        // Vendas esta semana
        const vendasSemana = await db.query(`
            SELECT COALESCE(SUM(total), 0) as vendas_semana 
            FROM vendas 
            WHERE data_venda >= DATE_TRUNC('week', CURRENT_DATE)
        `);

        // Vendas à vista hoje
        const vendasVistaHoje = await db.query(`
            SELECT COALESCE(SUM(total), 0) as vendas_vista_hoje 
            FROM vendas 
            WHERE DATE(data_venda) = CURRENT_DATE AND is_fiado = false
        `);

        // Fiado hoje
        const fiadoHoje = await db.query(`
            SELECT COALESCE(SUM(total), 0) as fiado_hoje 
            FROM vendas 
            WHERE DATE(data_venda) = CURRENT_DATE AND is_fiado = true
        `);

        // Fiado pago hoje (incluindo pagamentos parciais)
        let fiadoPagoHoje;
        try {
            fiadoPagoHoje = await db.query(`
                SELECT COALESCE(SUM(pp.valor_pago), 0) as fiado_pago_hoje
                FROM pagamentos_parciais pp
                WHERE DATE(pp.data_pagamento) = CURRENT_DATE
            `);
        } catch (error) {
            console.warn('⚠️ Tabela pagamentos_parciais não existe ainda, usando fallback');
            fiadoPagoHoje = await db.query(`
                SELECT COALESCE(SUM(v.total), 0) as fiado_pago_hoje 
                FROM vendas v
                WHERE v.is_fiado = true AND v.pago = true
                AND DATE(v.data_venda) = CURRENT_DATE
            `);
        }

        // Total fiado em aberto
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

        // Total de clientes
        const totalClientes = await db.query(`
            SELECT COUNT(*) as total_clientes 
            FROM clientes
        `);

        // Total de produtos
        const totalProdutos = await db.query(`
            SELECT COUNT(*) as total_produtos 
            FROM produtos
        `);

        const vendasHojeVal = parseFloat(vendasHoje.rows[0].vendas_hoje);
        const vendasMesVal = parseFloat(vendasMes.rows[0].vendas_mes);
        const vendasMesPassadoVal = parseFloat(vendasMesPassado.rows[0].vendas_mes_passado);
        
        // Calcular crescimento
        let crescimento = 0;
        if (vendasMesPassadoVal > 0) {
            crescimento = ((vendasMesVal - vendasMesPassadoVal) / vendasMesPassadoVal) * 100;
        } else if (vendasMesVal > 0) {
            crescimento = 100;
        }

        res.json({
            vendas_hoje: vendasHojeVal,
            vendas_mes: vendasMesVal,
            vendas_mes_passado: vendasMesPassadoVal,
            vendas_semana: parseFloat(vendasSemana.rows[0].vendas_semana),
            vendas_vista_hoje: parseFloat(vendasVistaHoje.rows[0].vendas_vista_hoje),
            fiado_hoje: parseFloat(fiadoHoje.rows[0].fiado_hoje),
            fiado_pago_hoje: parseFloat(fiadoPagoHoje.rows[0].fiado_pago_hoje),
            total_fiado: parseFloat(totalFiado.rows[0].total_fiado),
            estoque_baixo: parseInt(estoqueBaixo.rows[0].estoque_baixo),
            total_clientes: parseInt(totalClientes.rows[0].total_clientes),
            total_produtos: parseInt(totalProdutos.rows[0].total_produtos),
            crescimento_mes: parseFloat(crescimento.toFixed(1))
        });

    } catch (error) {
        console.error('Erro no dashboard:', error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// Chart data for dashboard
app.get('/api/dashboard/chart', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        console.log('📊 Buscando dados do gráfico para', months, 'meses');
        
        // Query mais simples e compatível com PostgreSQL/SQLite
        const chartData = await db.query(`
            SELECT 
                DATE_TRUNC('month', data_venda) as mes,
                SUM(CASE WHEN is_fiado = false THEN total ELSE 0 END) as vendas_vista,
                SUM(CASE WHEN is_fiado = true AND pago = false THEN total ELSE 0 END) as vendas_fiado,
                SUM(CASE WHEN is_fiado = true AND pago = true THEN total ELSE 0 END) as fiado_pago
            FROM vendas 
            WHERE data_venda >= (CURRENT_DATE - INTERVAL '${months} months')
            GROUP BY DATE_TRUNC('month', data_venda)
            ORDER BY mes ASC
        `);

        // Buscar pagamentos parciais por mês
        let pagamentosParciais;
        try {
            pagamentosParciais = await db.query(`
                SELECT 
                    DATE_TRUNC('month', pp.data_pagamento) as mes,
                    SUM(pp.valor_pago) as pagamentos_parciais
                FROM pagamentos_parciais pp
                WHERE pp.data_pagamento >= (CURRENT_DATE - INTERVAL '${months} months')
                GROUP BY DATE_TRUNC('month', pp.data_pagamento)
            `);
        } catch (error) {
            console.warn('⚠️ Tabela pagamentos_parciais não existe ainda, usando dados vazios');
            pagamentosParciais = { rows: [] };
        }

        console.log('📊 Dados encontrados:', chartData.rows.length, 'registros');
        console.log('📊 Pagamentos parciais:', pagamentosParciais.rows.length, 'registros');

        // Criar mapa de pagamentos parciais por mês
        const pagamentosMap = {};
        pagamentosParciais.rows.forEach(row => {
            const monthKey = new Date(row.mes).toISOString().substring(0, 7);
            pagamentosMap[monthKey] = parseFloat(row.pagamentos_parciais || 0);
        });

        // Preencher meses faltantes no backend
        const result = [];
        const now = new Date();
        
        for (let i = months - 1; i >= 0; i--) {
            const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const targetMonth = targetDate.toISOString().substring(0, 7);
            
            const foundData = chartData.rows.find(row => {
                const rowMonth = new Date(row.mes).toISOString().substring(0, 7);
                return rowMonth === targetMonth;
            });
            
            const pagamentosParciais = pagamentosMap[targetMonth] || 0;
            
            if (foundData) {
                result.push({
                    mes: foundData.mes,
                    vendas_vista: parseFloat(foundData.vendas_vista || 0),
                    vendas_fiado: parseFloat(foundData.vendas_fiado || 0),
                    fiado_pago: parseFloat(foundData.fiado_pago || 0) + pagamentosParciais
                });
            } else {
                result.push({
                    mes: targetDate.toISOString(),
                    vendas_vista: 0,
                    vendas_fiado: 0,
                    fiado_pago: pagamentosParciais
                });
            }
        }

        console.log('📊 Dados processados:', result.length, 'meses');

        res.json({
            chart_data: result
        });

    } catch (error) {
        console.error('❌ Erro ao buscar dados do gráfico:', error);
        console.error('📍 Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Erro ao carregar dados do gráfico',
            details: error.message
        });
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
            SET pago = true
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

app.post('/api/fiados/pay-partial/:vendaId', async (req, res) => {
    try {
        const { vendaId } = req.params;
        const { amount } = req.body;
        console.log('💰 Tentando pagamento parcial da venda:', vendaId, 'valor:', amount);

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valor de pagamento inválido' });
        }

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

        const vendaTotal = parseFloat(vendaCheck.rows[0].total);
        const valorPagamento = parseFloat(amount);

        if (valorPagamento > vendaTotal) {
            return res.status(400).json({ error: 'Valor do pagamento não pode ser maior que o total da venda' });
        }

        // Se o pagamento for igual ao total, marcar como pago
        if (valorPagamento === vendaTotal) {
            const result = await db.query(`
                UPDATE vendas 
                SET pago = true
                WHERE id = $1 AND is_fiado = true
                RETURNING id, total
            `, [vendaId]);

            console.log('✅ Venda quitada completamente:', result.rows[0]);

            res.json({
                success: true,
                message: 'Pagamento total registrado com sucesso',
                venda_quitada: result.rows[0],
                tipo_pagamento: 'total'
            });
        } else {
            // Reduzir o valor da venda
            const novoTotal = vendaTotal - valorPagamento;
            const result = await db.query(`
                UPDATE vendas 
                SET total = $1
                WHERE id = $2 AND is_fiado = true
                RETURNING id, total
            `, [novoTotal, vendaId]);

            console.log('✅ Pagamento parcial registrado:', result.rows[0], 'valor pago:', valorPagamento);

            res.json({
                success: true,
                message: 'Pagamento parcial registrado com sucesso',
                venda_atualizada: result.rows[0],
                valor_pago: valorPagamento,
                saldo_restante: novoTotal,
                tipo_pagamento: 'parcial'
            });
        }
    } catch (error) {
        console.error('❌ Erro ao registrar pagamento parcial:', error);
        console.error('📍 Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento parcial',
            details: error.message
        });
    }
});

app.post('/api/fiados/pay-partial-client/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;
        const { amount } = req.body;
        console.log('💰 Tentando pagamento parcial do cliente:', clienteId, 'valor:', amount);

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valor de pagamento inválido' });
        }

        // Buscar todas as vendas em aberto do cliente, ordenadas pela mais antiga
        const vendasAbertas = await db.query(`
            SELECT id, total FROM vendas 
            WHERE cliente_id = $1 AND is_fiado = true AND pago = false
            ORDER BY data_venda ASC
        `, [clienteId]);

        if (vendasAbertas.rows.length === 0) {
            return res.status(404).json({ error: 'Nenhuma venda em aberto encontrada para este cliente' });
        }

        const totalDevido = vendasAbertas.rows.reduce((sum, venda) => sum + parseFloat(venda.total), 0);
        const valorPagamento = parseFloat(amount);

        if (valorPagamento > totalDevido) {
            return res.status(400).json({ error: 'Valor do pagamento não pode ser maior que o total devido' });
        }

        let valorRestante = valorPagamento;
        const vendasQuitadas = [];
        const vendasAtualizadas = [];
        const pagamentosRegistrados = [];

        // Processar pagamento começando pelas vendas mais antigas
        for (const venda of vendasAbertas.rows) {
            const valorVenda = parseFloat(venda.total);
            
            if (valorRestante >= valorVenda) {
                // Quitar a venda completamente
                await db.query(`
                    UPDATE vendas 
                    SET pago = true
                    WHERE id = $1
                `, [venda.id]);
                
                // Registrar pagamento completo
                await db.query(`
                    INSERT INTO pagamentos_parciais (venda_id, valor_pago, observacao)
                    VALUES ($1, $2, $3)
                `, [venda.id, valorVenda, 'Pagamento total']);
                
                vendasQuitadas.push({
                    id: venda.id,
                    valor_original: valorVenda,
                    valor_pago: valorVenda
                });
                
                pagamentosRegistrados.push({
                    venda_id: venda.id,
                    valor_pago: valorVenda
                });
                
                valorRestante -= valorVenda;
            } else if (valorRestante > 0) {
                // Pagamento parcial desta venda
                const novoTotal = valorVenda - valorRestante;
                await db.query(`
                    UPDATE vendas 
                    SET total = $1
                    WHERE id = $2
                `, [novoTotal, venda.id]);
                
                // Registrar pagamento parcial
                await db.query(`
                    INSERT INTO pagamentos_parciais (venda_id, valor_pago, observacao)
                    VALUES ($1, $2, $3)
                `, [venda.id, valorRestante, 'Pagamento parcial']);
                
                vendasAtualizadas.push({
                    id: venda.id,
                    valor_original: valorVenda,
                    valor_pago: valorRestante,
                    novo_total: novoTotal
                });
                
                pagamentosRegistrados.push({
                    venda_id: venda.id,
                    valor_pago: valorRestante
                });
                
                valorRestante = 0;
            }
            
            if (valorRestante === 0) break;
        }

        console.log('✅ Pagamento parcial do cliente processado:', {
            cliente_id: clienteId,
            valor_pago: valorPagamento,
            vendas_quitadas: vendasQuitadas,
            vendas_atualizadas: vendasAtualizadas,
            pagamentos_registrados: pagamentosRegistrados
        });

        res.json({
            success: true,
            message: 'Pagamento parcial registrado com sucesso',
            valor_pago: valorPagamento,
            vendas_quitadas: vendasQuitadas,
            vendas_atualizadas: vendasAtualizadas,
            total_vendas_afetadas: vendasQuitadas.length + vendasAtualizadas.length
        });
    } catch (error) {
        console.error('❌ Erro ao registrar pagamento parcial do cliente:', error);
        console.error('📍 Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento parcial',
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
            SET pago = true
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
