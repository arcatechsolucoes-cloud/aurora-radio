@echo off
rem ============================================
rem  Rádio Aurora FM — inicia o painel local
rem  Pré-requisito: Node.js >= 18 instalado
rem ============================================
cd /d "%~dp0"

if not exist data\db.json (
  echo [setup] Primeira execucao: instalando dependencias e criando dados iniciais...
  call npm install
  call npm run seed
)

echo [painel] Iniciando em http://localhost:3000
echo          Player/ouvintes: http://localhost:3000/listen
echo          Pressione Ctrl+C para parar.
call npm start