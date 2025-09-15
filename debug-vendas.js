import Database from './database.js';

// Script para debugar vendas do mês
async function debugVendasMes() {
    const db = new Database();
    
    try {
        console.log('🔍 DEBUG - Verificando vendas do mês atual...\n');
        
        // 1. Verificar todas as vendas do mês atual
        const vendasMesQuery = `
            SELECT 
                id,
                data_venda,
                total,
                is_fiado,
                pago,
                cliente_id,
                produtos_json
            FROM vendas 
            WHERE EXTRACT(MONTH FROM data_venda) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND EXTRACT(YEAR FROM data_venda) = EXTRACT(YEAR FROM CURRENT_DATE)
            ORDER BY data_venda DESC;
        `;
        
        const vendasMes = await db.query(vendasMesQuery);
        
        console.log(`📊 VENDAS DO MÊS ATUAL (${new Date().getMonth() + 1}/${new Date().getFullYear()}):`);
        console.log(`Total de vendas encontradas: ${vendasMes.rows.length}\n`);
        
        let totalVendas = 0;
        let totalVista = 0;
        let totalFiado = 0;
        let totalFiadoPago = 0;
        
        vendasMes.rows.forEach((venda, index) => {
            const valor = parseFloat(venda.total);
            totalVendas += valor;
            
            if (venda.is_fiado) {
                totalFiado += valor;
                if (venda.pago) {
                    totalFiadoPago += valor;
                }
            } else {
                totalVista += valor;
            }
            
            console.log(`${index + 1}. ID: ${venda.id} | Data: ${venda.data_venda.toISOString().split('T')[0]} | Valor: R$ ${valor.toFixed(2)} | ${venda.is_fiado ? (venda.pago ? 'Fiado (Pago)' : 'Fiado (Pendente)') : 'À Vista'}`);
        });
        
        console.log('\n📈 RESUMO DO MÊS:');
        console.log(`Total Geral: R$ ${totalVendas.toFixed(2)}`);
        console.log(`Total à Vista: R$ ${totalVista.toFixed(2)}`);
        console.log(`Total Fiado: R$ ${totalFiado.toFixed(2)}`);
        console.log(`Total Fiado Pago: R$ ${totalFiadoPago.toFixed(2)}`);
        
        // 2. Verificar query do dashboard
        console.log('\n🔍 VERIFICANDO QUERY DO DASHBOARD:');
        
        const dashboardQuery = `
            SELECT 
                SUM(CASE WHEN EXTRACT(MONTH FROM data_venda) = EXTRACT(MONTH FROM CURRENT_DATE)
                         AND EXTRACT(YEAR FROM data_venda) = EXTRACT(YEAR FROM CURRENT_DATE) 
                         THEN total ELSE 0 END) as vendas_mes_dashboard
            FROM vendas;
        `;
        
        const dashboardResult = await db.query(dashboardQuery);
        const vendasMesDashboard = parseFloat(dashboardResult.rows[0].vendas_mes_dashboard || 0);
        
        console.log(`Vendas do mês (query dashboard): R$ ${vendasMesDashboard.toFixed(2)}`);
        
        // 3. Comparar resultados
        console.log('\n⚖️ COMPARAÇÃO:');
        console.log(`Soma manual: R$ ${totalVendas.toFixed(2)}`);
        console.log(`Query dashboard: R$ ${vendasMesDashboard.toFixed(2)}`);
        console.log(`Diferença: R$ ${Math.abs(totalVendas - vendasMesDashboard).toFixed(2)}`);
        
        if (Math.abs(totalVendas - vendasMesDashboard) < 0.01) {
            console.log('✅ Os valores estão corretos!');
        } else {
            console.log('❌ Há diferença nos valores!');
        }
        
        // 4. Verificar vendas por dia
        console.log('\n📅 VENDAS POR DIA:');
        
        const vendasPorDiaQuery = `
            SELECT 
                DATE(data_venda) as dia,
                COUNT(*) as qtd_vendas,
                SUM(total) as total_dia
            FROM vendas 
            WHERE EXTRACT(MONTH FROM data_venda) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND EXTRACT(YEAR FROM data_venda) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY DATE(data_venda)
            ORDER BY dia DESC;
        `;
        
        const vendasPorDia = await db.query(vendasPorDiaQuery);
        
        vendasPorDia.rows.forEach(dia => {
            console.log(`${dia.dia.toISOString().split('T')[0]}: ${dia.qtd_vendas} vendas = R$ ${parseFloat(dia.total_dia).toFixed(2)}`);
        });
        
    } catch (error) {
        console.error('❌ Erro no debug:', error);
    } finally {
        process.exit(0);
    }
}

// Executar debug
debugVendasMes();
