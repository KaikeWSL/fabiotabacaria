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

// Middleware otimizado
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://tabacariafabio.netlify.app', 'https://sistema-vendas-api.onrender.com']
        : true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Cache simples em memória para queries frequentes
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getCached(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
        return item.data;
    }
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// Função para verificar e criar tabelas necessárias
async function ensureTablesExist() {
    try {
        console.log('🔧 Verificando tabelas necessárias...');
        
        // Verificar se tabela consumo existe
        const checkConsumoTable = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'consumo'
            );
        `;
        
        const result = await db.query(checkConsumoTable);
        const tableExists = result.rows[0].exists;
        
        if (!tableExists) {
            console.log('📋 Criando tabela consumo...');
            
            const createConsumoTable = `
                CREATE TABLE consumo (
                    id SERIAL PRIMARY KEY,
                    produto_id INTEGER REFERENCES produtos(id),
                    produto_nome VARCHAR(255) NOT NULL,
                    quantidade INTEGER NOT NULL,
                    preco_unitario DECIMAL(10,2) NOT NULL,
                    total DECIMAL(10,2) NOT NULL,
                    observacao TEXT,
                    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
            await db.query(createConsumoTable);
            console.log('✅ Tabela consumo criada com sucesso!');
        } else {
            console.log('✅ Tabela consumo já existe');
        }
        
    } catch (error) {
        console.error('❌ Erro ao verificar/criar tabelas:', error);
        // Não parar o servidor, apenas logar o erro
    }
}

// Conectar ao banco na inicialização com retry
async function initializeDatabase() {
    let retries = 3;
    while (retries > 0) {
        try {
            await db.connect();
            console.log('✅ Banco conectado com sucesso');
            return;
        } catch (error) {
            retries--;
            console.log(`❌ Erro na conexão. Tentativas restantes: ${retries}`);
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

// Inicializar banco de forma assíncrona
initializeDatabase().catch(error => {
    console.error('❌ Falha crítica na conexão:', error);
    process.exit(1);
});

// Routes otimizadas

// Authentication (sem mudanças, pois é simples)
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

// Dashboard otimizado com uma única query
app.get('/api/dashboard', async (req, res) => {
    try {
        const cacheKey = 'dashboard';
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Query única otimizada para buscar todos os dados do dashboard
        const dashboardQuery = `
            WITH vendas_stats AS (
                SELECT 
                    -- Vendas hoje
                    SUM(CASE WHEN DATE(data_venda) = CURRENT_DATE THEN total ELSE 0 END) as vendas_hoje,
                    -- Vendas do mês
                    SUM(CASE WHEN EXTRACT(MONTH FROM data_venda) = EXTRACT(MONTH FROM CURRENT_DATE)
                             AND EXTRACT(YEAR FROM data_venda) = EXTRACT(YEAR FROM CURRENT_DATE) 
                             THEN total ELSE 0 END) as vendas_mes,
                    -- Vendas mês passado
                    SUM(CASE WHEN EXTRACT(MONTH FROM data_venda) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
                             AND EXTRACT(YEAR FROM data_venda) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month') 
                             THEN total ELSE 0 END) as vendas_mes_passado,
                    -- Vendas esta semana
                    SUM(CASE WHEN data_venda >= DATE_TRUNC('week', CURRENT_DATE) THEN total ELSE 0 END) as vendas_semana,
                    -- Vendas à vista hoje
                    SUM(CASE WHEN DATE(data_venda) = CURRENT_DATE AND is_fiado = false THEN total ELSE 0 END) as vendas_vista_hoje,
                    -- Fiado hoje
                    SUM(CASE WHEN DATE(data_venda) = CURRENT_DATE AND is_fiado = true THEN total ELSE 0 END) as fiado_hoje,
                    -- Fiado pago hoje
                    SUM(CASE WHEN DATE(data_venda) = CURRENT_DATE AND is_fiado = true AND pago = true THEN total ELSE 0 END) as fiado_pago_hoje,
                    -- Total fiado em aberto
                    SUM(CASE WHEN is_fiado = true AND pago = false THEN total ELSE 0 END) as total_fiado
                FROM vendas
            ),
            contadores AS (
                SELECT 
                    (SELECT COUNT(*) FROM produtos WHERE quantidade_estoque <= estoque_minimo) as estoque_baixo,
                    (SELECT COUNT(*) FROM clientes) as total_clientes,
                    (SELECT COUNT(*) FROM produtos) as total_produtos,
                    (SELECT COALESCE(SUM(total), 0) FROM consumo WHERE DATE(data_criacao) = CURRENT_DATE) as consumo_hoje
            )
            SELECT vs.*, c.*
            FROM vendas_stats vs, contadores c;
        `;

        const result = await db.query(dashboardQuery);
        const data = result.rows[0];

        const vendasMesVal = parseFloat(data.vendas_mes || 0);
        const vendasMesPassadoVal = parseFloat(data.vendas_mes_passado || 0);
        
        // Calcular crescimento
        let crescimento = 0;
        if (vendasMesPassadoVal > 0) {
            crescimento = ((vendasMesVal - vendasMesPassadoVal) / vendasMesPassadoVal) * 100;
        } else if (vendasMesVal > 0) {
            crescimento = 100;
        }

        const dashboardData = {
            vendas_hoje: parseFloat(data.vendas_hoje || 0),
            vendas_mes: vendasMesVal,
            vendas_mes_passado: vendasMesPassadoVal,
            vendas_semana: parseFloat(data.vendas_semana || 0),
            vendas_vista_hoje: parseFloat(data.vendas_vista_hoje || 0),
            fiado_hoje: parseFloat(data.fiado_hoje || 0),
            fiado_pago_hoje: parseFloat(data.fiado_pago_hoje || 0),
            total_fiado: parseFloat(data.total_fiado || 0),
            estoque_baixo: parseInt(data.estoque_baixo || 0),
            total_clientes: parseInt(data.total_clientes || 0),
            total_produtos: parseInt(data.total_produtos || 0),
            consumo_hoje: parseFloat(data.consumo_hoje || 0),
            crescimento_mes: parseFloat(crescimento.toFixed(1))
        };

        setCache(cacheKey, dashboardData);
        res.json(dashboardData);

    } catch (error) {
        console.error('Erro no dashboard:', error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// Produtos com cache
app.get('/api/produtos', async (req, res) => {
    try {
        const cacheKey = 'produtos';
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

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

        setCache(cacheKey, produtos);
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

        // Limpar cache
        cache.delete('produtos');
        cache.delete('dashboard');

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

        // Limpar cache
        cache.delete('produtos');
        cache.delete('dashboard');

        res.json({ message: 'Produto atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
});

// ===== ENDPOINTS PARA GRÁFICOS =====

// Vendas por período (para gráfico de linha)
app.get('/api/charts/sales-period', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        
        const query = `
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '${parseInt(days) - 1} days',
                    CURRENT_DATE,
                    '1 day'
                )::date AS date
            ),
            daily_sales AS (
                SELECT 
                    DATE(data_venda) as date,
                    SUM(total) as total_vendas,
                    SUM(CASE WHEN is_fiado = false THEN total ELSE 0 END) as vendas_vista,
                    SUM(CASE WHEN is_fiado = true THEN total ELSE 0 END) as vendas_fiado,
                    COUNT(*) as num_vendas
                FROM vendas 
                WHERE data_venda >= CURRENT_DATE - INTERVAL '${parseInt(days) - 1} days'
                GROUP BY DATE(data_venda)
            )
            SELECT 
                ds.date,
                COALESCE(s.total_vendas, 0) as total_vendas,
                COALESCE(s.vendas_vista, 0) as vendas_vista,
                COALESCE(s.vendas_fiado, 0) as vendas_fiado,
                COALESCE(s.num_vendas, 0) as num_vendas
            FROM date_series ds
            LEFT JOIN daily_sales s ON ds.date = s.date
            ORDER BY ds.date;
        `;

        const result = await db.query(query);
        
        const data = result.rows.map(row => ({
            date: row.date,
            total_vendas: parseFloat(row.total_vendas || 0),
            vendas_vista: parseFloat(row.vendas_vista || 0),
            vendas_fiado: parseFloat(row.vendas_fiado || 0),
            num_vendas: parseInt(row.num_vendas || 0)
        }));

        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar vendas por período:', error);
        res.status(500).json({ error: 'Erro ao carregar dados de vendas' });
    }
});

// Dados de consumo por período
app.get('/api/charts/consumption', async (req, res) => {
    try {
        const query = `
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    '1 day'
                )::date AS date
            ),
            daily_consumption AS (
                SELECT 
                    DATE(data_criacao) as date,
                    SUM(total) as total_consumo,
                    COUNT(*) as num_itens
                FROM consumo 
                WHERE data_criacao >= CURRENT_DATE - INTERVAL '6 days'
                GROUP BY DATE(data_criacao)
            )
            SELECT 
                ds.date,
                COALESCE(c.total_consumo, 0) as total_consumo,
                COALESCE(c.num_itens, 0) as num_itens
            FROM date_series ds
            LEFT JOIN daily_consumption c ON ds.date = c.date
            ORDER BY ds.date;
        `;

        const result = await db.query(query);
        
        const data = result.rows.map(row => ({
            date: row.date,
            total_consumo: parseFloat(row.total_consumo || 0),
            num_itens: parseInt(row.num_itens || 0)
        }));

        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar dados de consumo:', error);
        res.status(500).json({ error: 'Erro ao carregar dados de consumo' });
    }
});

// Status do estoque (produtos com baixo estoque)
app.get('/api/charts/stock-status', async (req, res) => {
    try {
        const query = `
            SELECT 
                nome,
                quantidade_estoque,
                estoque_minimo,
                CASE 
                    WHEN quantidade_estoque <= 0 THEN 'Esgotado'
                    WHEN quantidade_estoque <= estoque_minimo THEN 'Baixo'
                    WHEN quantidade_estoque <= estoque_minimo * 2 THEN 'Médio'
                    ELSE 'Alto'
                END as status_estoque
            FROM produtos
            ORDER BY 
                CASE 
                    WHEN quantidade_estoque <= 0 THEN 1
                    WHEN quantidade_estoque <= estoque_minimo THEN 2
                    WHEN quantidade_estoque <= estoque_minimo * 2 THEN 3
                    ELSE 4
                END,
                quantidade_estoque ASC
            LIMIT 20;
        `;

        const result = await db.query(query);
        
        const data = result.rows.map(row => ({
            nome: row.nome,
            quantidade_estoque: parseInt(row.quantidade_estoque || 0),
            estoque_minimo: parseInt(row.estoque_minimo || 0),
            status_estoque: row.status_estoque
        }));

        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar status do estoque:', error);
        res.status(500).json({ error: 'Erro ao carregar status do estoque' });
    }
});

// Clientes com cache
app.get('/api/clientes', async (req, res) => {
    try {
        const cacheKey = 'clientes';
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const result = await db.query('SELECT id, nome FROM clientes ORDER BY nome');
        
        setCache(cacheKey, result.rows);
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

        // Limpar cache
        cache.delete('clientes');
        cache.delete('dashboard');

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

        // Limpar cache
        cache.delete('clientes');

        res.json({ message: 'Cliente atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar cliente:', error);
        res.status(500).json({ error: 'Erro ao atualizar cliente' });
    }
});

// Vendas com otimização de transação
app.post('/api/vendas', async (req, res) => {
    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');
        
        const { cliente_id, total, is_fiado, pago, itens } = req.body;

        // Validar estoque antes de processar
        for (const item of itens) {
            const estoqueCheck = await client.query(`
                SELECT quantidade_estoque FROM produtos WHERE id = $1
            `, [item.produto_id]);
            
            if (estoqueCheck.rows.length === 0) {
                throw new Error(`Produto ${item.produto_id} não encontrado`);
            }
            
            if (estoqueCheck.rows[0].quantidade_estoque < item.quantidade) {
                throw new Error(`Estoque insuficiente para o produto ${item.produto_id}`);
            }
        }

        // Criar venda
        const vendaResult = await client.query(`
            INSERT INTO vendas (cliente_id, total, is_fiado, pago, data_venda)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id
        `, [cliente_id, total, is_fiado, pago]);

        const vendaId = vendaResult.rows[0].id;

        // Batch insert para itens e batch update para estoque
        const itemsValues = [];
        const estoqueUpdates = [];

        for (let i = 0; i < itens.length; i++) {
            const item = itens[i];
            const subtotal = item.preco_total || (item.quantidade * item.preco_unitario);
            
            itemsValues.push(`($1, $${2 + i * 4}, $${3 + i * 4}, $${4 + i * 4}, $${5 + i * 4})`);
            estoqueUpdates.push(client.query(`
                UPDATE produtos 
                SET quantidade_estoque = quantidade_estoque - $1
                WHERE id = $2
            `, [item.quantidade, item.produto_id]));
        }

        // Inserir todos os itens de uma vez
        if (itemsValues.length > 0) {
            const itemsQuery = `
                INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
                VALUES ${itemsValues.join(', ')}
            `;
            
            const itemsParams = [vendaId];
            itens.forEach(item => {
                const subtotal = item.preco_total || (item.quantidade * item.preco_unitario);
                itemsParams.push(item.produto_id, item.quantidade, item.preco_unitario, subtotal);
            });
            
            await client.query(itemsQuery, itemsParams);
        }

        // Executar updates de estoque em paralelo
        await Promise.all(estoqueUpdates);

        await client.query('COMMIT');

        // Limpar cache
        cache.delete('dashboard');
        cache.delete('produtos');
        cache.delete('fiados');

        res.json({
            id: vendaId,
            message: 'Venda realizada com sucesso'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao criar venda:', error);
        res.status(500).json({ error: error.message || 'Erro ao processar venda' });
    } finally {
        client.release();
    }
});

// Histórico de vendas
app.get('/api/vendas/historico', async (req, res) => {
    try {
        const { periodo = 'hoje', status = 'todos' } = req.query;
        
        let whereClause = '1=1';
        let params = [];
        
        // Filtro por período
        switch (periodo) {
            case 'hoje':
                whereClause += ' AND DATE(v.data_venda) = CURRENT_DATE';
                break;
            case 'ontem':
                whereClause += ' AND DATE(v.data_venda) = CURRENT_DATE - INTERVAL \'1 day\'';
                break;
            case 'semana':
                whereClause += ' AND v.data_venda >= DATE_TRUNC(\'week\', CURRENT_DATE)';
                break;
            case 'mes':
                whereClause += ' AND EXTRACT(MONTH FROM v.data_venda) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM v.data_venda) = EXTRACT(YEAR FROM CURRENT_DATE)';
                break;
            case 'todos':
                // Sem filtro adicional
                break;
        }
        
        // Filtro por status
        if (status !== 'todos') {
            if (status === 'pago') {
                whereClause += ' AND (v.is_fiado = false OR (v.is_fiado = true AND v.pago = true))';
            } else if (status === 'fiado') {
                whereClause += ' AND v.is_fiado = true AND v.pago = false';
            }
        }
        
        const query = `
            SELECT 
                v.id,
                v.total,
                v.is_fiado,
                v.pago,
                v.data_venda,
                c.nome as cliente_nome,
                COUNT(iv.id) as total_itens,
                ARRAY_AGG(
                    json_build_object(
                        'produto_nome', p.nome,
                        'quantidade', iv.quantidade,
                        'preco_unitario', iv.preco_unitario,
                        'subtotal', iv.subtotal
                    )
                ) as itens
            FROM vendas v
            JOIN clientes c ON v.cliente_id = c.id
            LEFT JOIN itens_venda iv ON v.id = iv.venda_id
            LEFT JOIN produtos p ON iv.produto_id = p.id
            WHERE ${whereClause}
            GROUP BY v.id, v.total, v.is_fiado, v.pago, v.data_venda, c.nome
            ORDER BY v.data_venda DESC
            LIMIT 50
        `;
        
        const result = await db.query(query, params);
        res.json(result.rows);
        
    } catch (error) {
        console.error('Erro ao buscar histórico de vendas:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de vendas' });
    }
});

// Fiados com cache e query otimizada
app.get('/api/fiados', async (req, res) => {
    try {
        const cacheKey = 'fiados';
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const result = await db.query(`
            SELECT c.id, c.nome, COALESCE(SUM(v.total), 0) as total_devido
            FROM clientes c
            INNER JOIN vendas v ON c.id = v.cliente_id 
            WHERE v.is_fiado = true AND v.pago = false
            GROUP BY c.id, c.nome
            HAVING SUM(v.total) > 0
            ORDER BY total_devido DESC
        `);

        const fiados = result.rows.map(fiado => ({
            ...fiado,
            total_devido: parseFloat(fiado.total_devido)
        }));

        setCache(cacheKey, fiados);
        res.json(fiados);
    } catch (error) {
        console.error('Erro ao listar fiados:', error);
        res.status(500).json({ error: 'Erro ao carregar fiados' });
    }
});

// Resto das rotas de fiados (sem mudanças significativas, apenas limpeza de cache)
app.get('/api/fiados/cliente/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Query otimizada com JOIN
        const result = await db.query(`
            SELECT 
                v.id, v.data_venda, v.total, v.pago, c.nome as cliente_nome, v.cliente_id,
                json_agg(
                    json_build_object(
                        'quantidade', iv.quantidade,
                        'preco_unitario', iv.preco_unitario,
                        'produto_nome', p.nome
                    )
                ) as itens
            FROM vendas v
            JOIN clientes c ON v.cliente_id = c.id
            LEFT JOIN itens_venda iv ON v.id = iv.venda_id
            LEFT JOIN produtos p ON iv.produto_id = p.id
            WHERE v.cliente_id = $1 AND v.is_fiado = true
            GROUP BY v.id, v.data_venda, v.total, v.pago, c.nome, v.cliente_id
            ORDER BY v.data_venda DESC
        `, [id]);

        const vendasDetalhadas = result.rows.map(venda => ({
            id: venda.id,
            data_venda: venda.data_venda.toISOString(),
            total: parseFloat(venda.total),
            pago: venda.pago,
            cliente_nome: venda.cliente_nome,
            cliente_id: venda.cliente_id,
            itens: venda.itens.map(item => ({
                quantidade: item.quantidade,
                preco_unitario: parseFloat(item.preco_unitario),
                produto_nome: item.produto_nome
            }))
        }));

        res.json(vendasDetalhadas);
    } catch (error) {
        console.error('Erro ao buscar fiados do cliente:', error);
        res.status(500).json({ error: 'Erro ao carregar dados do cliente' });
    }
});

// Pagamento individual otimizado
app.post('/api/fiados/pay/:vendaId', async (req, res) => {
    try {
        const { vendaId } = req.params;
        console.log('💰 Quitando venda:', vendaId);

        const result = await db.query(`
            UPDATE vendas 
            SET pago = true
            WHERE id = $1 AND is_fiado = true AND pago = false
            RETURNING id, total
        `, [vendaId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Venda não encontrada ou já paga' });
        }

        // Limpar cache
        cache.delete('fiados');
        cache.delete('dashboard');

        res.json({
            success: true,
            message: 'Pagamento registrado com sucesso',
            venda_quitada: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erro ao registrar pagamento:', error);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento',
            details: error.message
        });
    }
});

// Pagamento parcial otimizado
app.post('/api/fiados/pay-partial/:vendaId', async (req, res) => {
    try {
        const { vendaId } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valor de pagamento inválido' });
        }

        // Query com RETURNING para evitar múltiplas queries
        const checkResult = await db.query(`
            SELECT id, total, pago FROM vendas 
            WHERE id = $1 AND is_fiado = true
        `, [vendaId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Venda não encontrada' });
        }

        if (checkResult.rows[0].pago) {
            return res.status(400).json({ error: 'Venda já está paga' });
        }

        const vendaTotal = parseFloat(checkResult.rows[0].total);
        const valorPagamento = parseFloat(amount);

        if (valorPagamento > vendaTotal) {
            return res.status(400).json({ error: 'Valor do pagamento não pode ser maior que o total da venda' });
        }

        let result;
        if (valorPagamento === vendaTotal) {
            // Pagamento total
            result = await db.query(`
                UPDATE vendas 
                SET pago = true
                WHERE id = $1
                RETURNING id, total
            `, [vendaId]);

            // Limpar cache
            cache.delete('fiados');
            cache.delete('dashboard');

            res.json({
                success: true,
                message: 'Pagamento total registrado com sucesso',
                venda_quitada: result.rows[0],
                tipo_pagamento: 'total'
            });
        } else {
            // Pagamento parcial
            const novoTotal = vendaTotal - valorPagamento;
            result = await db.query(`
                UPDATE vendas 
                SET total = $1
                WHERE id = $2
                RETURNING id, total
            `, [novoTotal, vendaId]);

            // Limpar cache
            cache.delete('fiados');
            cache.delete('dashboard');

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
        res.status(500).json({ 
            error: 'Erro ao processar pagamento parcial',
            details: error.message
        });
    }
});

// Pagamento parcial do cliente otimizado
app.post('/api/fiados/pay-partial-client/:clienteId', async (req, res) => {
    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');
        
        const { clienteId } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valor de pagamento inválido' });
        }

        // Buscar vendas em aberto ordenadas por data
        const vendasAbertas = await client.query(`
            SELECT id, total FROM vendas 
            WHERE cliente_id = $1 AND is_fiado = true AND pago = false
            ORDER BY data_venda ASC
            FOR UPDATE
        `, [clienteId]);

        if (vendasAbertas.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Nenhuma venda em aberto encontrada para este cliente' });
        }

        const totalDevido = vendasAbertas.rows.reduce((sum, venda) => sum + parseFloat(venda.total), 0);
        const valorPagamento = parseFloat(amount);

        if (valorPagamento > totalDevido) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Valor do pagamento não pode ser maior que o total devido' });
        }

        let valorRestante = valorPagamento;
        const vendasQuitadas = [];
        const vendasAtualizadas = [];

        // Processar pagamentos em batch
        const updates = [];
        
        for (const venda of vendasAbertas.rows) {
            const valorVenda = parseFloat(venda.total);
            
            if (valorRestante >= valorVenda) {
                // Quitar completamente
                updates.push(client.query(`
                    UPDATE vendas SET pago = true WHERE id = $1
                `, [venda.id]));
                
                vendasQuitadas.push({
                    id: venda.id,
                    valor_original: valorVenda,
                    valor_pago: valorVenda
                });
                
                valorRestante -= valorVenda;
            } else if (valorRestante > 0) {
                // Pagamento parcial
                const novoTotal = valorVenda - valorRestante;
                updates.push(client.query(`
                    UPDATE vendas SET total = $1 WHERE id = $2
                `, [novoTotal, venda.id]));
                
                vendasAtualizadas.push({
                    id: venda.id,
                    valor_original: valorVenda,
                    valor_pago: valorRestante,
                    novo_total: novoTotal
                });
                
                valorRestante = 0;
            }
            
            if (valorRestante === 0) break;
        }

        // Executar todas as atualizações
        await Promise.all(updates);
        
        await client.query('COMMIT');

        // Limpar cache
        cache.delete('fiados');
        cache.delete('dashboard');

        res.json({
            success: true,
            message: 'Pagamento parcial registrado com sucesso',
            valor_pago: valorPagamento,
            vendas_quitadas: vendasQuitadas,
            vendas_atualizadas: vendasAtualizadas,
            total_vendas_afetadas: vendasQuitadas.length + vendasAtualizadas.length
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao registrar pagamento parcial do cliente:', error);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento parcial',
            details: error.message
        });
    } finally {
        client.release();
    }
});

// Quitar todas as vendas do cliente otimizado
app.post('/api/fiados/payall/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;

        const result = await db.query(`
            UPDATE vendas 
            SET pago = true
            WHERE cliente_id = $1 AND is_fiado = true AND pago = false
            RETURNING id, total
        `, [clienteId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Nenhuma venda encontrada para quitar' });
        }

        // Limpar cache
        cache.delete('fiados');
        cache.delete('dashboard');

        res.json({
            success: true,
            message: `${result.rowCount} venda(s) quitada(s) com sucesso`,
            vendas_quitadas: result.rows
        });
    } catch (error) {
        console.error('❌ Erro ao quitar vendas:', error);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento',
            details: error.message
        });
    }
});

// ===== ROTAS DE CONSUMO =====

// Listar consumos
app.get('/api/consumo', async (req, res) => {
    try {
        const cacheKey = 'consumo_list';
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json({ success: true, data: cached });
        }

        const query = `
            SELECT 
                c.id,
                c.produto_id,
                c.produto_nome,
                c.quantidade,
                c.preco_unitario,
                c.total,
                c.observacao,
                c.data_criacao as data,
                p.nome as produto_nome_atual
            FROM consumo c
            LEFT JOIN produtos p ON c.produto_id = p.id
            ORDER BY c.data_criacao DESC
        `;

        const result = await db.query(query);
        const consumos = result.rows;

        setCache(cacheKey, consumos);
        res.json({ success: true, data: consumos });
    } catch (error) {
        console.error('❌ Erro ao listar consumos:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar consumos',
            details: error.message
        });
    }
});

// Criar novo consumo
app.post('/api/consumo', async (req, res) => {
    try {
        const { produto_id, produto_nome, quantidade, preco_unitario, total, observacao } = req.body;

        // Validações
        if (!produto_id || !quantidade || !preco_unitario) {
            return res.status(400).json({ 
                error: 'Produto, quantidade e preço são obrigatórios' 
            });
        }

        if (quantidade <= 0 || preco_unitario <= 0) {
            return res.status(400).json({ 
                error: 'Quantidade e preço devem ser maiores que zero' 
            });
        }

        // Verificar se produto existe e tem estoque suficiente
        const produtoResult = await db.query(
            'SELECT * FROM produtos WHERE id = $1',
            [produto_id]
        );

        if (produtoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        const produto = produtoResult.rows[0];
        if (quantidade > produto.quantidade_estoque) {
            return res.status(400).json({ 
                error: 'Quantidade maior que estoque disponível' 
            });
        }

        // Iniciar transação
        await db.query('BEGIN');

        try {
            // Inserir consumo
            const insertConsumoQuery = `
                INSERT INTO consumo (
                    produto_id, produto_nome, quantidade, 
                    preco_unitario, total, observacao, data_criacao
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING *
            `;

            const consumoResult = await db.query(insertConsumoQuery, [
                produto_id,
                produto_nome || produto.nome,
                quantidade,
                preco_unitario,
                total || (quantidade * preco_unitario),
                observacao
            ]);

            // Atualizar estoque do produto
            const updateEstoqueQuery = `
                UPDATE produtos 
                SET quantidade_estoque = quantidade_estoque - $1
                WHERE id = $2
                RETURNING *
            `;

            await db.query(updateEstoqueQuery, [quantidade, produto_id]);

            // Confirmar transação
            await db.query('COMMIT');

            // Limpar cache relacionado
            cache.delete('consumo_list');
            cache.delete('produtos_list');
            cache.delete('dashboard_data');

            console.log(`✅ Consumo criado: ${produto_nome || produto.nome} - Qtd: ${quantidade}`);

            res.status(201).json({
                success: true,
                message: 'Consumo registrado com sucesso',
                data: consumoResult.rows[0]
            });

        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ Erro ao criar consumo:', error);
        res.status(500).json({ 
            error: 'Erro ao registrar consumo',
            details: error.message
        });
    }
});

// Deletar consumo
app.delete('/api/consumo/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar dados do consumo antes de deletar
        const consumoResult = await db.query(
            'SELECT * FROM consumo WHERE id = $1',
            [id]
        );

        if (consumoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Consumo não encontrado' });
        }

        const consumo = consumoResult.rows[0];

        // Iniciar transação
        await db.query('BEGIN');

        try {
            // Restaurar estoque do produto
            const updateEstoqueQuery = `
                UPDATE produtos 
                SET quantidade_estoque = quantidade_estoque + $1
                WHERE id = $2
            `;

            await db.query(updateEstoqueQuery, [consumo.quantidade, consumo.produto_id]);

            // Deletar consumo
            await db.query('DELETE FROM consumo WHERE id = $1', [id]);

            // Confirmar transação
            await db.query('COMMIT');

            // Limpar cache relacionado
            cache.delete('consumo_list');
            cache.delete('produtos_list');
            cache.delete('dashboard_data');

            console.log(`✅ Consumo deletado: ID ${id}`);

            res.json({
                success: true,
                message: 'Consumo excluído com sucesso'
            });

        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ Erro ao deletar consumo:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir consumo',
            details: error.message
        });
    }
});

// ===== ROTAS DA SINUCA =====

// Listar dados da sinuca
app.get('/api/sinuca', async (req, res) => {
    try {
        const query = `
            SELECT 
                COALESCE(data, '{}') as data
            FROM sinuca_data 
            WHERE id = 1
        `;

        const result = await db.query(query);
        
        let sinucaData = {
            fichasVendidas: 0,
            faturamento: 0,
            custoTotal: 0,
            lucro: 0,
            historico: [],
            ultimoReset: new Date().toISOString()
        };

        if (result.rows.length > 0 && result.rows[0].data) {
            sinucaData = { ...sinucaData, ...result.rows[0].data };
        }

        res.json({ success: true, data: sinucaData });
    } catch (error) {
        console.error('❌ Erro ao buscar dados da sinuca:', error);
        
        // Se a tabela não existe, criar e retornar dados padrão
        try {
            await ensureSinucaTableExists();
            const defaultData = {
                fichasVendidas: 0,
                faturamento: 0,
                custoTotal: 0,
                lucro: 0,
                historico: [],
                ultimoReset: new Date().toISOString()
            };
            res.json({ success: true, data: defaultData });
        } catch (createError) {
            console.error('❌ Erro ao criar tabela sinuca:', createError);
            res.status(500).json({ 
                error: 'Erro ao carregar dados da sinuca',
                details: error.message
            });
        }
    }
});

// Atualizar dados da sinuca
app.post('/api/sinuca', async (req, res) => {
    try {
        const { data } = req.body;

        if (!data) {
            return res.status(400).json({ error: 'Dados da sinuca são obrigatórios' });
        }

        // Garantir que a tabela existe
        await ensureSinucaTableExists();

        const query = `
            INSERT INTO sinuca_data (id, data, updated_at)
            VALUES (1, $1, NOW())
            ON CONFLICT (id) DO UPDATE SET
                data = $1,
                updated_at = NOW()
        `;

        await db.query(query, [JSON.stringify(data)]);

        res.json({
            success: true,
            message: 'Dados da sinuca atualizados com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar dados da sinuca:', error);
        res.status(500).json({ 
            error: 'Erro ao salvar dados da sinuca',
            details: error.message
        });
    }
});

// Resetar dados da sinuca
app.post('/api/sinuca/reset', async (req, res) => {
    try {
        const resetData = {
            fichasVendidas: 0,
            faturamento: 0,
            custoTotal: 0,
            lucro: 0,
            historico: [],
            ultimoReset: new Date().toISOString()
        };

        // Garantir que a tabela existe
        await ensureSinucaTableExists();

        const query = `
            INSERT INTO sinuca_data (id, data, updated_at)
            VALUES (1, $1, NOW())
            ON CONFLICT (id) DO UPDATE SET
                data = $1,
                updated_at = NOW()
        `;

        await db.query(query, [JSON.stringify(resetData)]);

        res.json({
            success: true,
            message: 'Dados da sinuca resetados com sucesso',
            data: resetData
        });
    } catch (error) {
        console.error('❌ Erro ao resetar dados da sinuca:', error);
        res.status(500).json({ 
            error: 'Erro ao resetar dados da sinuca',
            details: error.message
        });
    }
});

// Função para garantir que a tabela sinuca_data existe
async function ensureSinucaTableExists() {
    try {
        const checkTableQuery = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sinuca_data'
            );
        `;
        
        const result = await db.query(checkTableQuery);
        const tableExists = result.rows[0].exists;
        
        if (!tableExists) {
            console.log('📋 Criando tabela sinuca_data...');
            
            const createTableQuery = `
                CREATE TABLE sinuca_data (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    data JSONB NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT single_row CHECK (id = 1)
                );
                
                INSERT INTO sinuca_data (id, data) VALUES (1, '{}');
            `;
            
            await db.query(createTableQuery);
            console.log('✅ Tabela sinuca_data criada com sucesso!');
        }
    } catch (error) {
        console.error('❌ Erro ao verificar/criar tabela sinuca_data:', error);
        throw error;
    }
}

// ===== ENDPOINTS DE EXCLUSÃO =====

// Excluir produto
app.delete('/api/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se o produto existe
        const produtoCheck = await db.query('SELECT id, nome FROM produtos WHERE id = $1', [id]);
        if (produtoCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        
        const produto = produtoCheck.rows[0];
        
        // Verificar se existem vendas com este produto
        const vendasCheck = await db.query('SELECT COUNT(*) as count FROM itens_venda WHERE produto_id = $1', [id]);
        const hasVendas = parseInt(vendasCheck.rows[0].count) > 0;
        
        if (hasVendas) {
            return res.status(400).json({ 
                error: 'Não é possível excluir o produto pois existem vendas associadas a ele.',
                details: 'Para manter a integridade dos dados históricos, produtos com vendas não podem ser excluídos.'
            });
        }
        
        // Excluir produto
        await db.query('DELETE FROM produtos WHERE id = $1', [id]);
        
        console.log(`✅ Produto excluído: ${produto.nome} (ID: ${id})`);
        res.json({ 
            success: true, 
            message: `Produto "${produto.nome}" excluído com sucesso`,
            produto: produto
        });
        
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        res.status(500).json({ error: 'Erro ao excluir produto' });
    }
});

// Excluir cliente
app.delete('/api/clientes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se o cliente existe
        const clienteCheck = await db.query('SELECT id, nome FROM clientes WHERE id = $1', [id]);
        if (clienteCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }
        
        const cliente = clienteCheck.rows[0];
        
        // Verificar se existem vendas pendentes (fiado não pago)
        const fiadoPendente = await db.query(
            'SELECT COUNT(*) as count FROM vendas WHERE cliente_id = $1 AND is_fiado = true AND pago = false', 
            [id]
        );
        const hasFiadoPendente = parseInt(fiadoPendente.rows[0].count) > 0;
        
        if (hasFiadoPendente) {
            return res.status(400).json({ 
                error: 'Não é possível excluir o cliente pois possui dívidas pendentes.',
                details: 'Quite todas as dívidas ou cancele-as antes de excluir o cliente.'
            });
        }
        
        // Verificar se existem vendas históricas
        const vendasCheck = await db.query('SELECT COUNT(*) as count FROM vendas WHERE cliente_id = $1', [id]);
        const hasVendas = parseInt(vendasCheck.rows[0].count) > 0;
        
        if (hasVendas) {
            return res.status(400).json({ 
                error: 'Não é possível excluir o cliente pois existem vendas associadas.',
                details: 'Para manter a integridade dos dados históricos, clientes com vendas não podem ser excluídos.'
            });
        }
        
        // Excluir cliente
        await db.query('DELETE FROM clientes WHERE id = $1', [id]);
        
        console.log(`✅ Cliente excluído: ${cliente.nome} (ID: ${id})`);
        res.json({ 
            success: true, 
            message: `Cliente "${cliente.nome}" excluído com sucesso`,
            cliente: cliente
        });
        
    } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        res.status(500).json({ error: 'Erro ao excluir cliente' });
    }
});

// Excluir venda (fiado)
app.delete('/api/vendas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se a venda existe
        const vendaCheck = await db.query(`
            SELECT v.id, v.total, v.is_fiado, v.pago, c.nome as cliente_nome
            FROM vendas v
            JOIN clientes c ON v.cliente_id = c.id
            WHERE v.id = $1
        `, [id]);
        
        if (vendaCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Venda não encontrada' });
        }
        
        const venda = vendaCheck.rows[0];
        
        // Verificar se é uma venda já paga (só permitir exclusão de fiado pendente)
        if (venda.is_fiado && venda.pago) {
            return res.status(400).json({ 
                error: 'Não é possível excluir venda fiado já quitada.',
                details: 'Para manter a integridade dos dados, vendas pagas não podem ser excluídas.'
            });
        }
        
        // Verificar se é venda à vista (mais cuidadoso)
        if (!venda.is_fiado) {
            return res.status(400).json({ 
                error: 'Não é possível excluir venda à vista.',
                details: 'Apenas vendas fiado pendentes podem ser excluídas.'
            });
        }
        
        // Iniciar transação
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Excluir itens da venda primeiro
            await client.query('DELETE FROM itens_venda WHERE venda_id = $1', [id]);
            
            // Excluir a venda
            await client.query('DELETE FROM vendas WHERE id = $1', [id]);
            
            await client.query('COMMIT');
            
            console.log(`✅ Venda fiado excluída: ${venda.cliente_nome} - ${venda.total} (ID: ${id})`);
            res.json({ 
                success: true, 
                message: `Venda fiado de "${venda.cliente_nome}" excluída com sucesso`,
                venda: venda
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Erro ao excluir venda:', error);
        res.status(500).json({ error: 'Erro ao excluir venda' });
    }
});

// Cancelar todas as dívidas de um cliente
app.post('/api/fiados/:clienteId/clear', async (req, res) => {
    try {
        const { clienteId } = req.params;
        
        // Verificar se o cliente existe
        const clienteCheck = await db.query('SELECT id, nome FROM clientes WHERE id = $1', [clienteId]);
        if (clienteCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }
        
        const cliente = clienteCheck.rows[0];
        
        // Buscar dívidas pendentes
        const dividas = await db.query(`
            SELECT id, total FROM vendas 
            WHERE cliente_id = $1 AND is_fiado = true AND pago = false
        `, [clienteId]);
        
        if (dividas.rows.length === 0) {
            return res.json({ 
                success: true, 
                message: `Cliente "${cliente.nome}" não possui dívidas pendentes`,
                cancelled: 0
            });
        }
        
        const totalCancelado = dividas.rows.reduce((sum, d) => sum + parseFloat(d.total), 0);
        
        // Iniciar transação
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Excluir itens das vendas primeiro
            const vendaIds = dividas.rows.map(d => d.id);
            if (vendaIds.length > 0) {
                await client.query(
                    `DELETE FROM itens_venda WHERE venda_id = ANY($1)`, 
                    [vendaIds]
                );
                
                // Excluir as vendas
                await client.query(
                    `DELETE FROM vendas WHERE cliente_id = $1 AND is_fiado = true AND pago = false`, 
                    [clienteId]
                );
            }
            
            await client.query('COMMIT');
            
            console.log(`✅ Dívidas canceladas: ${cliente.nome} - Total: R$ ${totalCancelado.toFixed(2)} (${dividas.rows.length} vendas)`);
            res.json({ 
                success: true, 
                message: `Todas as dívidas de "${cliente.nome}" foram canceladas`,
                cliente: cliente,
                cancelled: dividas.rows.length,
                totalCancelado: totalCancelado
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Erro ao cancelar dívidas:', error);
        res.status(500).json({ error: 'Erro ao cancelar dívidas do cliente' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        cache_size: cache.size
    });
});

// Servir frontend para rotas não encontradas (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler global
app.use((error, req, res, next) => {
    console.error('❌ Erro não tratado:', error);
    res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
    });
});

// Iniciar servidor
app.listen(PORT, async () => {
    console.log('🌐 Servidor Node.js iniciado!');
    console.log(`📱 Acesse pelo celular: http://SEU_IP:${PORT}`);
    console.log(`💻 Acesse pelo PC: http://localhost:${PORT}`);
    console.log('🔗 Para descobrir seu IP, execute: ipconfig');
    console.log('⚡ Pressione Ctrl+C para parar o servidor');
    console.log(`🚀 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    
    // Verificar e criar tabelas necessárias
    await ensureTablesExist();
});

// Limpeza periódica do cache (a cada 10 minutos)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            cache.delete(key);
        }
    }
    console.log(`🧹 Cache limpo. Itens restantes: ${cache.size}`);
}, 10 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Parando servidor...');
    cache.clear();
    await db.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Recebido SIGTERM, parando servidor...');
    cache.clear();
    await db.close();
    process.exit(0);
});