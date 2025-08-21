// API Configuration - Auto detecta ambiente
const API_BASE = (() => {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Desenvolvimento local
        return 'http://localhost:8000/api';
    } else if (hostname.includes('netlify.app') || hostname.includes('tabacariafabio')) {
        // Produção - Netlify apontando para Render
        return 'https://sistema-vendas-api.onrender.com/api';
    } else {
        // Fallback para desenvolvimento
        return 'http://localhost:8000/api';
    }
})();

// API Helper Functions
class API {
    static async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Erro de conexão' }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Authentication
    static async login(senha) {
        return this.request('/auth', {
            method: 'POST',
            body: JSON.stringify({ senha })
        });
    }

    // Dashboard
    static async getDashboard() {
        return this.request('/dashboard');
    }

    // Products
    static async getProducts() {
        return this.request('/produtos');
    }

    static async createProduct(produto) {
        return this.request('/produtos', {
            method: 'POST',
            body: JSON.stringify(produto)
        });
    }

    // Clients
    static async getClients() {
        return this.request('/clientes');
    }

    static async createClient(cliente) {
        return this.request('/clientes', {
            method: 'POST',
            body: JSON.stringify(cliente)
        });
    }

    static async updateProduct(id, produto) {
        return this.request(`/produtos/${id}`, {
            method: 'PUT',
            body: JSON.stringify(produto)
        });
    }

    static async updateClient(id, cliente) {
        return this.request(`/clientes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(cliente)
        });
    }

    static async getProduct(id) {
        return this.request(`/produtos/${id}`);
    }

    static async getClient(id) {
        return this.request(`/clientes/${id}`);
    }

    // Sales
    static async createSale(venda) {
        return this.request('/vendas', {
            method: 'POST',
            body: JSON.stringify(venda)
        });
    }

    // Fiados
    static async getFiados() {
        return this.request('/fiados');
    }

    // Get detailed fiado information for a client
    static async getClientFiadoDetails(clienteId) {
        return this.request(`/fiados/cliente/${clienteId}`);
    }

    // Pay a specific debt
    static async payDebt(vendaId) {
        return this.request(`/fiados/pay/${vendaId}`, {
            method: 'POST'
        });
    }

    // Pay all debt for a client
    static async payAllClientDebt(clienteId) {
        return this.request(`/fiados/payall/${clienteId}`, {
            method: 'POST'
        });
    }
}
