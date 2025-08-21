# Sistema de Vendas - Backend Node.js

## 🚀 Migração de Python para Node.js

Este é o novo backend em Node.js/Express para o Sistema de Vendas, substituindo a versão em Python.

## 📋 Pré-requisitos

### 1. Instalar Node.js
Baixe e instale o Node.js LTS da página oficial:
- **URL**: https://nodejs.org/
- **Versão recomendada**: 18.x ou superior
- Durante a instalação, marque a opção "Add to PATH"

### 2. Verificar instalação
Após instalar, abra um novo PowerShell e execute:
```powershell
node --version
npm --version
```

## 🛠️ Configuração

### 1. Instalar dependências
```powershell
cd "backend-js"
npm install
```

### 2. Configurar banco de dados
O arquivo `.env` já está configurado com as credenciais do Neon PostgreSQL.

### 3. Iniciar servidor
```powershell
# Modo desenvolvimento (com auto-reload)
npm run dev

# Ou modo produção
npm start
```

## 📡 Endpoints da API

### Autenticação
- `POST /api/auth` - Login

### Dashboard
- `GET /api/dashboard` - Métricas gerais

### Produtos
- `GET /api/produtos` - Listar produtos
- `GET /api/produtos/:id` - Buscar produto por ID
- `POST /api/produtos` - Criar produto
- `PUT /api/produtos/:id` - Editar produto

### Clientes
- `GET /api/clientes` - Listar clientes
- `GET /api/clientes/:id` - Buscar cliente por ID
- `POST /api/clientes` - Criar cliente
- `PUT /api/clientes/:id` - Editar cliente

### Vendas
- `POST /api/vendas` - Criar venda

### Fiados
- `GET /api/fiados` - Listar clientes com dívidas
- `GET /api/fiados/cliente/:id` - Detalhes das vendas fiado de um cliente
- `POST /api/fiados/pay/:vendaId` - Marcar venda específica como paga
- `POST /api/fiados/payall/:clienteId` - Quitar todas as vendas de um cliente

## 🌐 Acesso

Após iniciar o servidor:
- **PC**: http://localhost:8000
- **Celular**: http://SEU_IP:8000

Para descobrir seu IP:
```powershell
ipconfig
```

## 🔧 Tecnologias Utilizadas

- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **PostgreSQL** - Banco de dados (Neon)
- **CORS** - Middleware para requisições cross-origin
- **dotenv** - Gerenciamento de variáveis de ambiente

## 📂 Estrutura

```
backend-js/
├── server.js      # Servidor principal
├── database.js    # Conexão com banco
├── package.json   # Dependências e scripts
├── .env          # Configurações
└── README.md     # Este arquivo
```

## 🚀 Vantagens da migração para Node.js

- **Performance**: Melhor para aplicações I/O intensivas
- **Ecossistema**: NPM com milhões de pacotes
- **JavaScript**: Mesmo idioma no frontend e backend
- **Deploy**: Mais fácil deploy em plataformas como Vercel, Netlify
- **Comunidade**: Grande comunidade ativa

## 🔄 Compatibilidade

O backend em Node.js é 100% compatível com o frontend existente. Todos os endpoints foram mantidos iguais.
