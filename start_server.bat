@echo off
title Sistema de Vendas - Backend Node.js

echo ======================================
echo   SISTEMA DE VENDAS - BACKEND NODE.JS
echo ======================================
echo.

:: Verificar se Node.js está instalado
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js não encontrado!
    echo.
    echo 📥 Para instalar Node.js:
    echo 1. Acesse: https://nodejs.org/
    echo 2. Baixe a versão LTS
    echo 3. Execute a instalação
    echo 4. Reinicie o computador
    echo 5. Execute este arquivo novamente
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js encontrado
node --version

:: Verificar se as dependências estão instaladas
if not exist "node_modules" (
    echo.
    echo 📦 Instalando dependências...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Erro ao instalar dependências
        pause
        exit /b 1
    )
)

echo.
echo 🚀 Iniciando servidor...
echo.
echo 📱 Acesse pelo celular: http://SEU_IP:8000
echo 💻 Acesse pelo PC: http://localhost:8000
echo.
echo ⚡ Pressione Ctrl+C para parar o servidor
echo ======================================
echo.

npm start
