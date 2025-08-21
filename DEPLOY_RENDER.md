# Sistema de Vendas - Deploy no Render

## 🚀 Instruções para Deploy no Render

### 1. Preparar o repositório
- Faça push do código para GitHub
- Certifique-se que o arquivo `package.json` está na raiz do projeto backend

### 2. Configurar no Render
1. Acesse https://render.com/
2. Clique em "New +" → "Web Service"
3. Conecte seu repositório GitHub: `https://github.com/KaikeWSL/fabiotabacaria`
4. Configure:
   - **Name**: sistema-vendas-api
   - **Environment**: Node
   - **Root Directory**: `backend-js`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 3. Variáveis de ambiente
Adicione no Render Dashboard → Settings → Environment:
```
NODE_ENV=production
DATABASE_URL=postgresql://neondb_owner:npg_AVFCR6hYz2Bb@ep-square-base-achvt3fs-pooler.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require
PORT=10000
```

### 4. URL do backend
Após o deploy, a URL será algo como:
`https://sistema-vendas-api.onrender.com`

### 5. Configurar CORS
O backend já está configurado para aceitar requisições de qualquer origem.
