# Painel Tecelagem

Leitor + tela só de produção. Roda no **PC da tecelagem** (24 h). Não abre o Estoque de Peças.

## No PC da tecelagem

1. Node.js instalado  
2. Esta pasta do projeto (não precisa usar `Iniciar.bat` da raiz)  
3. Rede até a **RENATA** (Syntech)  
4. Clique em `Iniciar-Painel-Tecelagem.bat` (na raiz) ou `painel-tecelagem\Iniciar.bat`

A TV e os outros PCs abrem no Chrome:

`http://IP-DO-PC-DA-TECELAGEM:3850`

Deixe a janela preta aberta.

Se o Windows perguntar o firewall, permita o Node na porta **3850** (rede privada). Sem isso a TV não abre.

A tela atualiza sozinha a cada 1 minuto. Peças da ordem aberta só mudam na **troca de turno**.

Não use o `Iniciar.bat` da raiz neste PC — aquele abre o Estoque de Peças.
