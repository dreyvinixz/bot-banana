@echo off
echo ==============================================
echo 🍌 INICIANDO O ECOSSISTEMA DO BOTBANANA 🍌
echo ==============================================
echo.

echo [1/2] Iniciando o Forge WebUI (Gerador de Imagens)...
start "Forge WebUI (IA de Imagens)" cmd /k "cd stable-diffusion-webui-forge && call webui-user.bat"

echo Aguardando 30 segundos para o Forge carregar os modelos pesados...
timeout /t 30 /nobreak >nul

echo.
echo [2/2] Iniciando o BotBanana...
start "Bot Banana - Terminal" cmd /k "node ."

echo.
echo ✅ Tudo foi iniciado! 
echo Duas novas janelas pretas foram abertas: uma para o Forge e outra para o Bot.
echo Você pode fechar esta janela agora.
pause
exit
