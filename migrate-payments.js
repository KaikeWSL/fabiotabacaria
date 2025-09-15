import Database from './database.js';

const db = new Database();

async function migratePayments() {
    console.log('🔄 Iniciando migração de pagamentos...');

    try {
        // Conectar ao banco
        const connected = await db.connect();
        if (!connected) {
            throw new Error('Falha na conexão com o banco');
        }

        // 1. Primeiro, criar a tabela de pagamentos se não existir
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
        console.log('✅ Tabela pagamentos_fiado criada/verificada');

        // 2. Verificar se já existe alguma migração
        const existingPayments = await db.query('SELECT COUNT(*) FROM pagamentos_fiado');
        if (parseInt(existingPayments.rows[0].count) > 0) {
            console.log('⚠️ Já existem pagamentos migrados. Deseja continuar? (y/n)');
            // Para automação, vamos prosseguir
        }

        // 3. Buscar todas as vendas fiado que estão pagas (possíveis pagamentos totais)
        const vendasPagas = await db.query(`
            SELECT id, cliente_id, total, data_venda, data_pagamento
            FROM vendas 
            WHERE is_fiado = true AND pago = true
        `);

        console.log(`📊 Encontradas ${vendasPagas.rows.length} vendas fiado pagas`);

        // 4. Para cada venda paga, criar um registro de pagamento total
        let pagamentosTotaisRecuperados = 0;
        for (const venda of vendasPagas.rows) {
            const { id, cliente_id, total, data_pagamento } = venda;
            
            // Verificar se já existe pagamento para esta venda
            const existingPayment = await db.query(
                'SELECT id FROM pagamentos_fiado WHERE venda_id = $1', 
                [id]
            );

            if (existingPayment.rows.length === 0) {
                await db.query(`
                    INSERT INTO pagamentos_fiado (venda_id, cliente_id, valor_pagamento, data_pagamento, observacao)
                    VALUES ($1, $2, $3, $4, $5)
                `, [id, cliente_id, total, data_pagamento || new Date(), 'Migração - Pagamento total']);

                pagamentosTotaisRecuperados++;
                console.log(`✅ Pagamento total recuperado: Venda ${id} - R$ ${total}`);
            }
        }

        // 5. Agora vamos tentar identificar pagamentos parciais baseado em padrões históricos
        console.log('🔍 Buscando possíveis pagamentos parciais...');

        // Buscar vendas fiado não pagas que podem ter tido pagamentos parciais
        // (Esta parte é mais complexa e pode precisar de ajustes manuais)
        const vendasNaoPagas = await db.query(`
            SELECT v.id, v.cliente_id, v.total, v.data_venda, c.nome as cliente_nome
            FROM vendas v
            JOIN clientes c ON v.cliente_id = c.id
            WHERE v.is_fiado = true AND v.pago = false
            ORDER BY v.data_venda ASC
        `);

        console.log(`📊 Encontradas ${vendasNaoPagas.rows.length} vendas fiado em aberto`);

        // 6. Criar um relatório de recuperação
        const relatorio = {
            vendas_pagas_total: vendasPagas.rows.length,
            pagamentos_totais_recuperados: pagamentosTotaisRecuperados,
            vendas_em_aberto: vendasNaoPagas.rows.length,
            data_migracao: new Date().toISOString()
        };

        console.log('\n📋 RELATÓRIO DE MIGRAÇÃO:');
        console.log('==================================');
        console.log(`✅ Vendas pagas encontradas: ${relatorio.vendas_pagas_total}`);
        console.log(`✅ Pagamentos totais recuperados: ${relatorio.pagamentos_totais_recuperados}`);
        console.log(`⏳ Vendas em aberto: ${relatorio.vendas_em_aberto}`);
        console.log(`📅 Data da migração: ${relatorio.data_migracao}`);

        // 7. Salvar relatório em arquivo
        await db.query(`
            CREATE TABLE IF NOT EXISTS migration_log (
                id SERIAL PRIMARY KEY,
                tipo_migracao VARCHAR(100),
                dados_migracao JSONB,
                data_migracao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            INSERT INTO migration_log (tipo_migracao, dados_migracao)
            VALUES ($1, $2)
        `, ['pagamentos_fiado', JSON.stringify(relatorio)]);

        console.log('\n🎉 Migração concluída com sucesso!');
        console.log('\n⚠️  PRÓXIMOS PASSOS:');
        console.log('1. Verificar se todos os pagamentos foram recuperados corretamente');
        console.log('2. Se houve pagamentos parciais não detectados, adicione-os manualmente');
        console.log('3. Reiniciar o servidor para aplicar as mudanças');

        return relatorio;

    } catch (error) {
        console.error('❌ Erro na migração:', error);
        throw error;
    } finally {
        await db.close();
    }
}

// Função para verificar pagamentos específicos
async function verificarPagamentosCliente(clienteId) {
    try {
        const connected = await db.connect();
        if (!connected) {
            throw new Error('Falha na conexão com o banco');
        }

        const result = await db.query(`
            SELECT 
                v.id as venda_id,
                v.total as valor_original,
                v.pago as esta_pago,
                v.data_venda,
                COALESCE(SUM(pf.valor_pagamento), 0) as total_pagamentos,
                (v.total - COALESCE(SUM(pf.valor_pagamento), 0)) as saldo_devedor
            FROM vendas v
            LEFT JOIN pagamentos_fiado pf ON v.id = pf.venda_id
            WHERE v.cliente_id = $1 AND v.is_fiado = true
            GROUP BY v.id, v.total, v.pago, v.data_venda
            ORDER BY v.data_venda DESC
        `, [clienteId]);

        console.log(`\n📊 RESUMO DO CLIENTE ${clienteId}:`);
        console.log('=====================================');
        
        result.rows.forEach(venda => {
            console.log(`Venda ${venda.venda_id}:`);
            console.log(`  • Valor original: R$ ${parseFloat(venda.valor_original).toFixed(2)}`);
            console.log(`  • Total pago: R$ ${parseFloat(venda.total_pagamentos).toFixed(2)}`);
            console.log(`  • Saldo devedor: R$ ${parseFloat(venda.saldo_devedor).toFixed(2)}`);
            console.log(`  • Status: ${venda.esta_pago ? 'PAGO' : 'EM ABERTO'}`);
            console.log(`  • Data: ${venda.data_venda.toLocaleDateString()}`);
            console.log('  ---');
        });

        return result.rows;

    } catch (error) {
        console.error('❌ Erro ao verificar pagamentos do cliente:', error);
        throw error;
    } finally {
        await db.close();
    }
}

// Executar migração se chamado diretamente
if (process.argv[2] === 'migrate') {
    migratePayments()
        .then((relatorio) => {
            console.log('✅ Migração finalizada:', relatorio);
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Falha na migração:', error);
            process.exit(1);
        });
} else if (process.argv[2] === 'verify' && process.argv[3]) {
    const clienteId = parseInt(process.argv[3]);
    verificarPagamentosCliente(clienteId)
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Falha na verificação:', error);
            process.exit(1);
        });
} else {
    console.log('📋 Script de Migração de Pagamentos');
    console.log('');
    console.log('Uso:');
    console.log('  node migrate-payments.js migrate          - Executar migração');
    console.log('  node migrate-payments.js verify [ID]      - Verificar cliente específico');
    console.log('');
    console.log('Exemplo:');
    console.log('  node migrate-payments.js migrate');
    console.log('  node migrate-payments.js verify 1');
}

export { migratePayments, verificarPagamentosCliente };
