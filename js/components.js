// Component Classes and Functions
class Components {
    // Create product list item
    static createProductItem(produto) {
        // Validação robusta
        if (!produto || typeof produto !== 'object' || Array.isArray(produto)) {
            console.error('Produto inválido:', produto);
            return '<div class="lista-item error">Produto inválido</div>';
        }
        
        // Destructuring seguro com valores padrão
        const { 
            id = 0, 
            nome = 'Sem nome', 
            preco_custo = 0, 
            preco_venda = 0, 
            preco_fiado = 0, 
            quantidade_estoque = 0, 
            estoque_minimo = 0 
        } = produto;
        
        const isLowStock = quantidade_estoque <= estoque_minimo;
        
        return `
            <div class="lista-item" data-id="${id}">
                <div class="item-info">
                    <h4>${nome}</h4>
                    <p>Custo: ${Utils.formatCurrency(preco_custo)} | Venda: ${Utils.formatCurrency(preco_venda)} | Fiado: ${Utils.formatCurrency(preco_fiado)}</p>
                    <p class="${isLowStock ? 'text-warning' : ''}">
                        Estoque: ${quantidade_estoque} ${isLowStock ? '⚠️ Baixo' : ''}
                    </p>
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-primary" onclick="Components.editProduct(${id})">Editar</button>
                </div>
            </div>
        `;
    }

    // Create client list item
    static createClientItem(cliente) {
        // Validação robusta
        if (!cliente || typeof cliente !== 'object' || Array.isArray(cliente)) {
            console.error('Cliente inválido:', cliente);
            return '<div class="lista-item error">Cliente inválido</div>';
        }
        
        // Destructuring seguro com valores padrão
        const { 
            id = 0, 
            nome = 'Sem nome' 
        } = cliente;
        
        return `
            <div class="lista-item" data-id="${id}">
                <div class="item-info">
                    <h4>${nome}</h4>
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-primary" onclick="Components.editClient(${id})">Editar</button>
                </div>
            </div>
        `;
    }

    // Create fiado list item
    static createFiadoItem(fiado) {
        // Validação robusta
        if (!fiado || typeof fiado !== 'object' || Array.isArray(fiado)) {
            console.error('Fiado inválido:', fiado);
            return '<div class="lista-item error">Fiado inválido</div>';
        }
        
        const { 
            id: clienteId = 0, 
            nome = 'Sem nome', 
            total_devido: totalDevido = 0 
        } = fiado;
        
        return `
            <div class="lista-item fiado-item" data-id="${clienteId}">
                <div class="item-info">
                    <h4>${nome}</h4>
                    <p class="text-danger">💳 Deve: ${Utils.formatCurrency(totalDevido)}</p>
                    <p class="text-small">Clique para ver detalhes das vendas</p>
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-primary" onclick="Components.viewClientDetails(${clienteId})">
                        📋 Ver Detalhes
                    </button>
                    <button class="btn btn-small btn-success" onclick="Components.payAllDebt(${clienteId})">
                        💰 Quitar Tudo
                    </button>
                </div>
            </div>
        `;
    }

    // Create detailed fiado transaction item
    static createFiadoDetailItem(venda) {
        if (!venda || typeof venda !== 'object') {
            return '<div class="detail-item error">Venda inválida</div>';
        }
        
        const { 
            id = 0,
            data_venda = '',
            total = 0,
            itens = [],
            pago = false
        } = venda;
        
        const dataFormatada = new Date(data_venda).toLocaleDateString('pt-BR');
        const statusClass = pago ? 'status-pago' : 'status-pendente';
        const statusText = pago ? 'PAGO' : 'PENDENTE';
        
        return `
            <div class="fiado-detail-item ${statusClass}" data-venda-id="${id}">
                <div class="detail-header">
                    <div class="detail-info">
                        <h5>Venda #${id}</h5>
                        <p class="detail-date">📅 ${dataFormatada}</p>
                    </div>
                    <div class="detail-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="detail-total">${Utils.formatCurrency(total)}</span>
                    </div>
                </div>
                <div class="detail-items">
                    ${itens.map(item => `
                        <div class="item-line">
                            <span>${item.quantidade}x ${item.produto_nome || 'Produto'}</span>
                            <span>${Utils.formatCurrency(item.preco_unitario * item.quantidade)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="detail-actions">
                    ${!pago ? `
                        <button class="btn btn-small btn-success" onclick="Components.payDebt(${id})">
                            💰 Quitar
                        </button>
                        <button class="btn btn-small btn-outline" onclick="Components.printReceipt(${id})">
                            🖨️ Imprimir
                        </button>
                    ` : `
                        <button class="btn btn-small btn-outline" onclick="Components.printReceipt(${id})">
                            🖨️ Reimprimir
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    // Create cart item
    static createCartItem(item, index) {
        return `
            <div class="carrinho-item" data-index="${index}">
                <div class="item-info">
                    <h4>${item.nome}</h4>
                    <p>${item.quantidade}x ${Utils.formatCurrency(item.preco_unitario)} = ${Utils.formatCurrency(item.quantidade * item.preco_unitario)}</p>
                    ${item.preco_total !== (item.quantidade * item.preco_unitario) ? 
                        `<p class="item-discount">Preço final: ${Utils.formatCurrency(item.preco_total)}</p>` : ''}
                </div>
                <div class="item-actions">
                    <span class="item-total">${Utils.formatCurrency(item.preco_total)}</span>
                    <button class="btn btn-small btn-outline" onclick="window.app.removeFromCart(${index})">
                        ❌
                    </button>
                </div>
            </div>
        `;
    }

    // Product option for select
    static createProductOption(produto) {
        const { id, nome, preco_custo, preco_venda, preco_fiado, quantidade_estoque } = produto;
        if (quantidade_estoque <= 0) return ''; // Don't show out of stock products
        
        return `<option value="${id}" data-venda="${preco_venda}" data-fiado="${preco_fiado}" data-estoque="${quantidade_estoque}">
            ${nome} (Estoque: ${quantidade_estoque})
        </option>`;
    }

    // Client option for select
    static createClientOption(cliente) {
        const { id, nome } = cliente;
        return `<option value="${id}">${nome}</option>`;
    }

    // Edit product - opens modal
    static editProduct(id) {
        if (window.app) {
            window.app.openEditProductModal(id);
        }
    }

    // Edit client - opens modal  
    static editClient(id) {
        if (window.app) {
            window.app.openEditClientModal(id);
        }
    }

    // View client details with fiado history
    static async viewClientDetails(clienteId) {
        try {
            // Buscar detalhes do cliente e suas vendas fiado
            const vendas = await API.getClientFiadoDetails(clienteId);
            
            if (vendas.length === 0) {
                Utils.showToast('Cliente não possui vendas fiado', 'info');
                return;
            }
            
            // Criar modal com detalhes
            this.showClientDetailsModal(vendas);
            
        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
            Utils.showToast('Erro ao carregar detalhes do cliente', 'error');
        }
    }

    // Show modal with client fiado details
    static showClientDetailsModal(vendas) {
        const clienteNome = vendas[0]?.cliente_nome || 'Cliente';
        const totalDivida = vendas.reduce((sum, v) => sum + (v.pago ? 0 : v.total), 0);
        
        const modalHtml = `
            <div class="modal-overlay" id="client-details-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>📋 Detalhes do Cliente</h3>
                        <button class="modal-close" onclick="Components.closeModal('client-details-modal')">❌</button>
                    </div>
                    <div class="modal-body">
                        <div class="client-summary">
                            <h4>${clienteNome}</h4>
                            <p class="total-debt">💳 Total em aberto: ${Utils.formatCurrency(totalDivida)}</p>
                        </div>
                        <div class="fiado-details-list">
                            ${vendas.map(venda => this.createFiadoDetailItem(venda)).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" onclick="Components.closeModal('client-details-modal')">
                            Fechar
                        </button>
                        ${totalDivida > 0 ? `
                            <button class="btn btn-success" onclick="Components.payAllClientDebt(${vendas[0].cliente_id})">
                                💰 Quitar Tudo (${Utils.formatCurrency(totalDivida)})
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar modal ao body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Pay specific debt
    static async payDebt(vendaId) {
        try {
            const confirm = window.confirm('Confirma o pagamento desta venda?');
            if (!confirm) return;
            
            await API.payDebt(vendaId);
            Utils.showToast('Pagamento registrado com sucesso!', 'success');
            
            // Fechar modal e recarregar dados
            this.closeModal('client-details-modal');
            if (window.app) {
                await window.app.loadFiados();
                await window.app.loadDashboard();
            }
            
        } catch (error) {
            console.error('Erro ao registrar pagamento:', error);
            Utils.showToast('Erro ao registrar pagamento', 'error');
        }
    }

    // Pay all debt for a client
    static async payAllClientDebt(clienteId) {
        try {
            const confirm = window.confirm('Confirma o pagamento de todas as dívidas deste cliente?');
            if (!confirm) return;
            
            await API.payAllClientDebt(clienteId);
            Utils.showToast('Todos os pagamentos registrados com sucesso!', 'success');
            
            // Fechar modal e recarregar dados
            this.closeModal('client-details-modal');
            if (window.app) {
                await window.app.loadFiados();
                await window.app.loadDashboard();
            }
            
        } catch (error) {
            console.error('Erro ao registrar pagamentos:', error);
            Utils.showToast('Erro ao registrar pagamentos', 'error');
        }
    }

    // Pay all debt (from fiado list)
    static async payAllDebt(clienteId) {
        this.payAllClientDebt(clienteId);
    }

    // Print receipt
    static printReceipt(vendaId) {
        try {
            // Abrir nova janela para impressão
            const printWindow = window.open('', '_blank', 'width=300,height=400');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Recibo - Venda #${vendaId}</title>
                        <style>
                            body { font-family: Arial, sans-serif; font-size: 12px; }
                            .header { text-align: center; margin-bottom: 20px; }
                            .item { display: flex; justify-content: space-between; margin: 5px 0; }
                            .total { border-top: 1px solid #000; margin-top: 10px; padding-top: 5px; font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h2>🛒 Sistema de Vendas</h2>
                            <p>Recibo de Venda #${vendaId}</p>
                            <p>${new Date().toLocaleString('pt-BR')}</p>
                        </div>
                        <div id="receipt-content">
                            <p>Carregando dados da venda...</p>
                        </div>
                        <script>
                            // Aqui você pode carregar os dados da venda via API
                            // Por enquanto, mostrar apenas o ID
                            document.getElementById('receipt-content').innerHTML = 
                                '<p>Venda: #${vendaId}</p><p>Status: Processada</p>';
                            setTimeout(() => window.print(), 500);
                        </script>
                    </body>
                </html>
            `);
            printWindow.document.close();
            
        } catch (error) {
            console.error('Erro ao imprimir:', error);
            Utils.showToast('Erro ao abrir janela de impressão', 'error');
        }
    }

    // Close modal
    static closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }

    // Edit product with modal
    static editProduct(id) {
        // Por enquanto, placeholder
        Utils.showToast('Edição de produtos será implementada em breve', 'info');
        // TODO: Implementar modal de edição de produtos
    }

    // Edit client with modal
    static editClient(id) {
        // Por enquanto, placeholder
        Utils.showToast('Edição de clientes será implementada em breve', 'info');
        // TODO: Implementar modal de edição de clientes
    }

    // Loading states for different sections
    static setLoadingState(elementId, isLoading, loadingText = 'Carregando...') {
        const element = document.getElementById(elementId);
        if (!element) return;

        if (isLoading) {
            element.innerHTML = `
                <div class="lista-loading">
                    <div class="loading-spinner" style="width: 24px; height: 24px; margin: 0 auto 10px;"></div>
                    ${loadingText}
                </div>
            `;
        }
    }

    // Empty state
    static setEmptyState(elementId, message = 'Nenhum item encontrado') {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="lista-loading">
                    <span style="font-size: 2rem; margin-bottom: 10px; display: block;">📋</span>
                    ${message}
                </div>
            `;
        }
    }

    // Update dashboard cards
    static updateDashboardCard(cardId, value, isLoading = false) {
        const element = document.getElementById(cardId);
        if (!element) return;

        if (isLoading) {
            element.innerHTML = `
                <div class="loading-spinner" style="width: 20px; height: 20px;"></div>
            `;
        } else {
            if (cardId.includes('vendas') || cardId.includes('fiado')) {
                element.textContent = Utils.formatCurrency(value);
            } else if (cardId === 'estoque-baixo') {
                element.textContent = `${value} ${value === 1 ? 'item' : 'itens'}`;
            } else {
                element.textContent = value;
            }
        }
    }
}
