// Main Application Class
class App {
    constructor() {
        this.isAuthenticated = false;
        this.currentTab = 'dashboard';
        this.cart = [];
        this.products = [];
        this.clients = [];
        this.manualTotalEdit = false; // Flag para controlar se usuário editou total manualmente
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.showLoading('Inicializando sistema...');
        
        // Initialize number input states
        this.setTotalEditable(false);
        
        // Simulate loading time
        setTimeout(() => {
            this.hideLoading();
            this.showLogin();
        }, 1000);
    }

    bindEvents() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Forms
        document.getElementById('produto-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateProduct();
        });

        document.getElementById('cliente-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateClient();
        });

        // Product selection for sales
        document.getElementById('produto-select').addEventListener('change', (e) => {
            this.updateProductPrice();
        });

        // Cart actions
        document.getElementById('adicionar-item').addEventListener('click', () => {
            this.addToCart();
        });

        document.getElementById('limpar-carrinho').addEventListener('click', () => {
            this.clearCart();
        });

        document.getElementById('finalizar-venda').addEventListener('click', () => {
            this.finalizeSale();
        });

        // Refresh buttons
        document.getElementById('refresh-vendas').addEventListener('click', () => {
            this.loadSalesData();
        });

        document.getElementById('refresh-produtos').addEventListener('click', () => {
            this.loadProducts();
        });

        document.getElementById('refresh-clientes').addEventListener('click', () => {
            this.loadClients();
        });

        document.getElementById('refresh-fiados').addEventListener('click', () => {
            this.loadFiados();
        });
    }

    // Authentication
    async handleLogin() {
        const senha = document.getElementById('senha').value;
        const submitBtn = document.querySelector('#login-form button');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');
        const errorDiv = document.getElementById('login-error');

        // Show loading state
        btnText.style.display = 'none';
        btnLoading.style.display = 'flex';
        submitBtn.disabled = true;
        errorDiv.style.display = 'none';

        try {
            const result = await API.login(senha);
            
            if (result.success) {
                this.isAuthenticated = true;
                this.showApp();
                this.loadInitialData();
                Utils.showToast('Login realizado com sucesso!', 'success');
            } else {
                this.showLoginError(result.message);
            }
        } catch (error) {
            this.showLoginError('Erro de conexão. Verifique se o servidor está rodando.');
        } finally {
            // Reset button state
            btnText.style.display = 'block';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    showLoginError(message) {
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    logout() {
        this.isAuthenticated = false;
        this.currentTab = 'dashboard';
        this.cart = [];
        document.getElementById('app').style.display = 'none';
        this.showLogin();
        Utils.showToast('Logout realizado com sucesso', 'info');
    }

    // UI State Management
    showLoading(text = 'Carregando...') {
        const loadingScreen = document.getElementById('loading-screen');
        const loadingText = document.getElementById('loading-text');
        loadingText.textContent = text;
        loadingScreen.classList.add('active');
    }

    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.remove('active');
    }

    showLogin() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        document.getElementById('senha').value = '';
    }

    showApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update active content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Load data for the tab
        this.loadTabData(tabName);
    }

    async loadTabData(tabName) {
        switch (tabName) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'vendas':
                await this.loadSalesData();
                break;
            case 'produtos':
                await this.loadProducts();
                break;
            case 'clientes':
                await this.loadClients();
                break;
            case 'fiados':
                await this.loadFiados();
                break;
        }
    }

    async loadInitialData() {
        // Load dashboard first
        await this.loadDashboard();
        
        // Pre-load other essential data
        this.loadProducts();
        this.loadClients();
    }

    // Dashboard
    async loadDashboard() {
        const cards = ['vendas-hoje', 'vendas-mes', 'total-fiado', 'estoque-baixo'];
        
        // Show loading state
        cards.forEach(cardId => {
            Components.updateDashboardCard(cardId, 0, true);
        });

        try {
            const data = await API.getDashboard();
            
            Components.updateDashboardCard('vendas-hoje', data.vendas_hoje);
            Components.updateDashboardCard('vendas-mes', data.vendas_mes);
            Components.updateDashboardCard('total-fiado', data.total_fiado);
            Components.updateDashboardCard('estoque-baixo', data.estoque_baixo);
        } catch (error) {
            Utils.showToast('Erro ao carregar dashboard', 'error');
            console.error('Dashboard error:', error);
        }
    }

    // Products
    async loadProducts() {
        Components.setLoadingState('produtos-lista', true, 'Carregando produtos...');

        try {
            this.products = await API.getProducts();
            this.renderProducts();
            this.updateProductSelects();
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            Utils.showError('produtos-lista', 'Erro ao carregar produtos');
            Utils.showToast('Erro ao carregar produtos', 'error');
        }
    }

    renderProducts() {
        const container = document.getElementById('produtos-lista');
        
        if (this.products.length === 0) {
            Components.setEmptyState('produtos-lista', 'Nenhum produto cadastrado');
            return;
        }

        container.innerHTML = this.products
            .map(produto => Components.createProductItem(produto))
            .join('');
    }

    async handleCreateProduct() {
        if (!Utils.validateForm('produto-form')) {
            Utils.showToast('Preencha todos os campos obrigatórios', 'warning');
            return;
        }

        const formData = Utils.getFormData('produto-form');
        const produto = {
            nome: formData['produto-nome'],
            preco_custo: parseFloat(formData['produto-custo']),
            preco_venda: parseFloat(formData['produto-venda']),
            preco_fiado: parseFloat(formData['produto-fiado']),
            quantidade_estoque: parseInt(formData['produto-estoque']),
            estoque_minimo: parseInt(formData['produto-minimo'])
        };

        try {
            await API.createProduct(produto);
            Utils.showToast('Produto criado com sucesso!', 'success');
            Utils.clearForm('produto-form');
            await this.loadProducts();
        } catch (error) {
            Utils.showToast('Erro ao criar produto', 'error');
            console.error('Create product error:', error);
        }
    }

    updateProductSelects() {
        const select = document.getElementById('produto-select');
        select.innerHTML = '<option value="">Selecione um produto</option>';
        
        this.products.forEach(produto => {
            select.innerHTML += Components.createProductOption(produto);
        });
    }

    // Clients
    async loadClients() {
        Components.setLoadingState('clientes-lista', true, 'Carregando clientes...');

        try {
            this.clients = await API.getClients();
            this.renderClients();
            this.updateClientSelects();
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            Utils.showError('clientes-lista', 'Erro ao carregar clientes');
            Utils.showToast('Erro ao carregar clientes', 'error');
        }
    }

    renderClients() {
        const container = document.getElementById('clientes-lista');
        
        if (this.clients.length === 0) {
            Components.setEmptyState('clientes-lista', 'Nenhum cliente cadastrado');
            return;
        }

        container.innerHTML = this.clients
            .map(cliente => Components.createClientItem(cliente))
            .join('');
    }

    async handleCreateClient() {
        if (!Utils.validateForm('cliente-form')) {
            Utils.showToast('Preencha todos os campos obrigatórios', 'warning');
            return;
        }

        const formData = Utils.getFormData('cliente-form');
        const cliente = {
            nome: formData['cliente-nome']
        };

        try {
            await API.createClient(cliente);
            Utils.showToast('Cliente criado com sucesso!', 'success');
            Utils.clearForm('cliente-form');
            await this.loadClients();
        } catch (error) {
            Utils.showToast('Erro ao criar cliente', 'error');
            console.error('Create client error:', error);
        }
    }

    updateClientSelects() {
        const select = document.getElementById('cliente-select');
        select.innerHTML = '<option value="">Selecione um cliente</option>';
        
        this.clients.forEach(cliente => {
            select.innerHTML += Components.createClientOption(cliente);
        });
    }

    // Sales
    async loadSalesData() {
        // Load products and clients for sales form
        if (this.products.length === 0) {
            await this.loadProducts();
        }
        if (this.clients.length === 0) {
            await this.loadClients();
        }
    }

    updateProductPrice() {
        const select = document.getElementById('produto-select');
        const option = select.selectedOptions[0];
        const precoInput = document.getElementById('preco-unitario');
        const isFiado = document.getElementById('is-fiado').checked;

        if (option && option.value) {
            const preco = isFiado ? option.dataset.fiado : option.dataset.venda;
            precoInput.value = parseFloat(preco).toFixed(2);
            this.manualTotalEdit = false; // Reset flag quando produto mudar
            this.setTotalEditable(false); // Volta para modo automático
            this.calculateTotal(); // Recalcular total quando preço unitário mudar
        } else {
            precoInput.value = '';
            document.getElementById('preco-total').value = '';
            this.manualTotalEdit = false; // Reset flag
            this.setTotalEditable(false);
        }
    }

    calculateTotal() {
        // Não recalcular se usuário editou manualmente
        if (this.manualTotalEdit) {
            return;
        }
        
        const quantidade = parseInt(document.getElementById('quantidade').value) || 0;
        const precoUnitario = parseFloat(document.getElementById('preco-unitario').value) || 0;
        const total = quantidade * precoUnitario;
        
        if (quantidade > 0 && precoUnitario > 0) {
            document.getElementById('preco-total').value = total.toFixed(2);
        } else {
            document.getElementById('preco-total').value = '';
        }
    }

    applyDiscount(percentage) {
        const precoTotalInput = document.getElementById('preco-total');
        const currentTotal = parseFloat(precoTotalInput.value);
        
        if (!currentTotal || currentTotal <= 0) {
            Utils.showToast('Defina um total primeiro', 'warning');
            return;
        }
        
        const discount = currentTotal * (percentage / 100);
        const newTotal = currentTotal - discount;
        
        precoTotalInput.value = newTotal.toFixed(2);
        this.manualTotalEdit = true; // Marcar como editado manualmente
        Utils.showToast(`Desconto de ${percentage}% aplicado (R$ ${discount.toFixed(2)})`, 'success');
    }

    resetTotalCalculation() {
        this.manualTotalEdit = false;
        this.calculateTotal();
        this.setTotalEditable(false);
        Utils.showToast('Cálculo automático reativado', 'info');
    }

    setTotalEditable(editable) {
        const totalInput = document.getElementById('preco-total');
        const totalMinus = document.getElementById('total-minus');
        const totalPlus = document.getElementById('total-plus');
        
        if (editable) {
            totalInput.removeAttribute('readonly');
            totalMinus.style.display = 'none';
            totalPlus.style.display = 'none';
        } else {
            totalInput.setAttribute('readonly', 'readonly');
            totalMinus.style.display = 'flex';
            totalPlus.style.display = 'flex';
        }
    }

    // Quantity controls
    incrementQuantity() {
        const input = document.getElementById('quantidade');
        const current = parseInt(input.value) || 1;
        input.value = current + 1;
        this.calculateTotal();
    }

    decrementQuantity() {
        const input = document.getElementById('quantidade');
        const current = parseInt(input.value) || 1;
        if (current > 1) {
            input.value = current - 1;
            this.calculateTotal();
        }
    }

    // Price controls
    incrementPrice() {
        const input = document.getElementById('preco-unitario');
        const current = parseFloat(input.value) || 0;
        input.value = (current + 0.50).toFixed(2);
        this.calculateTotal();
    }

    decrementPrice() {
        const input = document.getElementById('preco-unitario');
        const current = parseFloat(input.value) || 0;
        if (current >= 0.50) {
            input.value = (current - 0.50).toFixed(2);
            this.calculateTotal();
        }
    }

    // Total controls
    incrementTotal() {
        const input = document.getElementById('preco-total');
        const current = parseFloat(input.value) || 0;
        input.value = (current + 0.50).toFixed(2);
        this.manualTotalEdit = true;
    }

    decrementTotal() {
        const input = document.getElementById('preco-total');
        const current = parseFloat(input.value) || 0;
        if (current >= 0.50) {
            input.value = (current - 0.50).toFixed(2);
            this.manualTotalEdit = true;
        }
    }

    enableTotalEdit() {
        this.setTotalEditable(true);
        this.manualTotalEdit = true;
        document.getElementById('preco-total').focus();
    }

    // Product editing functions
    async openEditProductModal(id) {
        try {
            const produto = await API.getProduct(id);
            
            document.getElementById('edit-produto-id').value = produto.id;
            document.getElementById('edit-produto-nome').value = produto.nome;
            document.getElementById('edit-produto-custo').value = produto.preco_custo;
            document.getElementById('edit-produto-venda').value = produto.preco_venda;
            document.getElementById('edit-produto-fiado').value = produto.preco_fiado;
            document.getElementById('edit-produto-estoque').value = produto.quantidade_estoque;
            document.getElementById('edit-produto-minimo').value = produto.estoque_minimo;
            
            document.getElementById('edit-produto-modal').style.display = 'flex';
        } catch (error) {
            Utils.showToast('Erro ao carregar dados do produto', 'error');
            console.error('Error loading product:', error);
        }
    }

    closeEditProductModal() {
        document.getElementById('edit-produto-modal').style.display = 'none';
    }

    async updateProduct() {
        try {
            const id = document.getElementById('edit-produto-id').value;
            const produto = {
                nome: document.getElementById('edit-produto-nome').value,
                preco_custo: parseFloat(document.getElementById('edit-produto-custo').value),
                preco_venda: parseFloat(document.getElementById('edit-produto-venda').value),
                preco_fiado: parseFloat(document.getElementById('edit-produto-fiado').value),
                quantidade_estoque: parseInt(document.getElementById('edit-produto-estoque').value),
                estoque_minimo: parseInt(document.getElementById('edit-produto-minimo').value)
            };

            await API.updateProduct(id, produto);
            Utils.showToast('Produto atualizado com sucesso!', 'success');
            this.closeEditProductModal();
            await this.loadProducts();
        } catch (error) {
            Utils.showToast('Erro ao atualizar produto', 'error');
            console.error('Error updating product:', error);
        }
    }

    // Client editing functions
    async openEditClientModal(id) {
        try {
            const cliente = await API.getClient(id);
            
            document.getElementById('edit-cliente-id').value = cliente.id;
            document.getElementById('edit-cliente-nome').value = cliente.nome;
            
            document.getElementById('edit-cliente-modal').style.display = 'flex';
        } catch (error) {
            Utils.showToast('Erro ao carregar dados do cliente', 'error');
            console.error('Error loading client:', error);
        }
    }

    closeEditClientModal() {
        document.getElementById('edit-cliente-modal').style.display = 'none';
    }

    async updateClient() {
        try {
            const id = document.getElementById('edit-cliente-id').value;
            const cliente = {
                nome: document.getElementById('edit-cliente-nome').value
            };

            await API.updateClient(id, cliente);
            Utils.showToast('Cliente atualizado com sucesso!', 'success');
            this.closeEditClientModal();
            await this.loadClients();
        } catch (error) {
            Utils.showToast('Erro ao atualizar cliente', 'error');
            console.error('Error updating client:', error);
        }
    }

    addToCart() {
        const produtoSelect = document.getElementById('produto-select');
        const quantidade = parseInt(document.getElementById('quantidade').value);
        const precoUnitario = parseFloat(document.getElementById('preco-unitario').value);
        const precoTotal = parseFloat(document.getElementById('preco-total').value);

        if (!produtoSelect.value || !quantidade || !precoUnitario) {
            Utils.showToast('Preencha produto, quantidade e preço unitário', 'warning');
            return;
        }

        if (!precoTotal || precoTotal <= 0) {
            Utils.showToast('Defina o preço total do item', 'warning');
            return;
        }

        const option = produtoSelect.selectedOptions[0];
        const estoque = parseInt(option.dataset.estoque);

        if (quantidade > estoque) {
            Utils.showToast(`Estoque insuficiente. Disponível: ${estoque}`, 'warning');
            return;
        }

        const item = {
            produto_id: parseInt(produtoSelect.value),
            nome: option.text.split(' (')[0], // Remove stock info from name
            quantidade: quantidade,
            preco_unitario: precoUnitario,
            preco_total: precoTotal
        };

        this.cart.push(item);
        this.renderCart();
        
        // Reset form
        document.getElementById('quantidade').value = 1;
        produtoSelect.value = '';
        document.getElementById('preco-unitario').value = '';
        document.getElementById('preco-total').value = '';
        this.manualTotalEdit = false; // Reset flag

        Utils.showToast('Item adicionado ao carrinho', 'success');
    }

    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
        Utils.showToast('Item removido do carrinho', 'info');
    }

    clearCart() {
        this.cart = [];
        this.renderCart();
        Utils.showToast('Carrinho limpo', 'info');
    }

    renderCart() {
        const carrinhoDiv = document.getElementById('carrinho');
        const itensDiv = document.getElementById('itens-carrinho');
        const totalSpan = document.getElementById('total-carrinho');

        if (this.cart.length === 0) {
            carrinhoDiv.style.display = 'none';
            return;
        }

        carrinhoDiv.style.display = 'block';
        
        itensDiv.innerHTML = this.cart
            .map((item, index) => Components.createCartItem(item, index))
            .join('');

        const total = this.cart.reduce((sum, item) => sum + item.preco_total, 0);
        totalSpan.textContent = total.toFixed(2);
    }

    async finalizeSale() {
        if (this.cart.length === 0) {
            Utils.showToast('Carrinho vazio', 'warning');
            return;
        }

        const clienteId = document.getElementById('cliente-select').value;
        if (!clienteId) {
            Utils.showToast('Selecione um cliente', 'warning');
            return;
        }

        const isFiado = document.getElementById('is-fiado').checked;
        const total = this.cart.reduce((sum, item) => sum + item.preco_total, 0);

        const venda = {
            cliente_id: parseInt(clienteId),
            total: total,
            is_fiado: isFiado,
            pago: !isFiado, // If it's fiado, it's not paid yet
            itens: this.cart
        };

        try {
            await API.createSale(venda);
            Utils.showToast('Venda realizada com sucesso!', 'success');
            
            this.clearCart();
            document.getElementById('cliente-select').value = '';
            document.getElementById('is-fiado').checked = false;
            
            // Refresh data
            await this.loadDashboard();
            await this.loadProducts(); // To update stock
            
        } catch (error) {
            Utils.showToast('Erro ao finalizar venda', 'error');
            console.error('Sale error:', error);
        }
    }

    // Fiados
    async loadFiados() {
        Components.setLoadingState('fiados-lista', true, 'Carregando fiados...');

        try {
            const fiados = await API.getFiados();
            this.renderFiados(fiados);
        } catch (error) {
            console.error('Erro ao carregar fiados:', error);
            Utils.showError('fiados-lista', 'Erro ao carregar fiados');
            Utils.showToast('Erro ao carregar fiados', 'error');
        }
    }

    renderFiados(fiados) {
        const container = document.getElementById('fiados-lista');
        
        if (fiados.length === 0) {
            Components.setEmptyState('fiados-lista', 'Nenhuma venda fiado em aberto');
            return;
        }

        container.innerHTML = fiados
            .map(fiado => Components.createFiadoItem(fiado))
            .join('');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// Add event listener for checkbox change to update price
document.addEventListener('DOMContentLoaded', () => {
    const isFiadoCheckbox = document.getElementById('is-fiado');
    if (isFiadoCheckbox) {
        isFiadoCheckbox.addEventListener('change', () => {
            if (window.app) {
                window.app.updateProductPrice();
            }
        });
    }
    
    // Add event listeners for auto-calculation (mantidos para compatibilidade)
    const quantidadeInput = document.getElementById('quantidade');
    const precoUnitarioInput = document.getElementById('preco-unitario');
    const precoTotalInput = document.getElementById('preco-total');
    
    // Total input manual edit detection
    if (precoTotalInput) {
        precoTotalInput.addEventListener('input', () => {
            if (window.app && !precoTotalInput.hasAttribute('readonly')) {
                window.app.manualTotalEdit = true; // Marcar que usuário editou manualmente
            }
        });
        
        precoTotalInput.addEventListener('focus', () => {
            if (window.app && !precoTotalInput.hasAttribute('readonly')) {
                window.app.manualTotalEdit = true; // Marcar que usuário está editando
            }
        });
    }
    
    // Add event listeners for discount buttons
    const discountButtons = document.querySelectorAll('.btn-discount');
    discountButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.applyDiscount(parseInt(e.target.dataset.discount));
            }
        });
    });
    
    // Add event listener for reset calc button
    const resetCalcBtn = document.getElementById('reset-calc');
    if (resetCalcBtn) {
        resetCalcBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.resetTotalCalculation();
            }
        });
    }
    
    // Add event listener for edit total button
    const editTotalBtn = document.getElementById('edit-total');
    if (editTotalBtn) {
        editTotalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.enableTotalEdit();
            }
        });
    }
    
    // Quantity buttons
    const qtyMinus = document.getElementById('qty-minus');
    const qtyPlus = document.getElementById('qty-plus');
    if (qtyMinus) {
        qtyMinus.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.decrementQuantity();
            }
        });
    }
    if (qtyPlus) {
        qtyPlus.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.incrementQuantity();
            }
        });
    }
    
    // Price buttons
    const priceMinus = document.getElementById('price-minus');
    const pricePlus = document.getElementById('price-plus');
    if (priceMinus) {
        priceMinus.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.decrementPrice();
            }
        });
    }
    if (pricePlus) {
        pricePlus.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.incrementPrice();
            }
        });
    }
    
    // Total buttons
    const totalMinus = document.getElementById('total-minus');
    const totalPlus = document.getElementById('total-plus');
    if (totalMinus) {
        totalMinus.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.decrementTotal();
            }
        });
    }
    if (totalPlus) {
        totalPlus.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.app) {
                window.app.incrementTotal();
            }
        });
    }

    // Modal event listeners
    // Product edit modal
    const closeProductModal = document.getElementById('close-edit-produto-modal');
    if (closeProductModal) {
        closeProductModal.addEventListener('click', () => {
            if (window.app) {
                window.app.closeEditProductModal();
            }
        });
    }
    
    const saveProductBtn = document.getElementById('save-edit-produto');
    if (saveProductBtn) {
        saveProductBtn.addEventListener('click', () => {
            if (window.app) {
                window.app.updateProduct();
            }
        });
    }

    // Client edit modal
    const closeClientModal = document.getElementById('close-edit-cliente-modal');
    if (closeClientModal) {
        closeClientModal.addEventListener('click', () => {
            if (window.app) {
                window.app.closeEditClientModal();
            }
        });
    }
    
    const saveClientBtn = document.getElementById('save-edit-cliente');
    if (saveClientBtn) {
        saveClientBtn.addEventListener('click', () => {
            if (window.app) {
                window.app.updateClient();
            }
        });
    }

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        const productModal = document.getElementById('edit-produto-modal');
        const clientModal = document.getElementById('edit-cliente-modal');
        
        if (e.target === productModal && window.app) {
            window.app.closeEditProductModal();
        }
        if (e.target === clientModal && window.app) {
            window.app.closeEditClientModal();
        }
    });
});
