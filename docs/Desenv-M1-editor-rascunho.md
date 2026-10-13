# Rascunho — editor de imagem na aba Desenv-M1

Documento de desenho. Aba Editor em `/desenv-m1/editor`, ligada ao agente do Cursor no scanner local. A chave `CURSOR_API_KEY` fica no `.env`.

A qualidade das edições do Mickey e da onça veio de um agente que lê o pedido e aplica operação exata no arquivo (medida em pixel, cor do fio, repetir o desenho, queixo numa linha contada de baixo). O editor do Estoque-Peças segue esse caminho.

---

## Decisões fechadas

| Tópico | Decisão |
|--------|---------|
| Lugar | Aba nova dentro de Desenv-M1, ao lado de Densidade e Malhas |
| Tela | Chat à esquerda, prévia da imagem à direita |
| Cérebro | Agente do Cursor, pelo SDK TypeScript `@cursor/sdk`, chamado pelo Express |
| Onde o agente roda | Local, no PC que sobe o servidor. A pasta de trabalho é a pasta da arte da peça |
| Modelo | Composer 2.5 no dia a dia. A conta do Cursor lista os outros modelos disponíveis |
| Internet | Ferramenta `webSearch` do agente. A imagem baixada entra como referência; o BMP da malha só muda com confirmação |
| Saída da máquina | BMP de 24 bits, na medida pedida |
| Versões | Cada pedido grava uma versão nova. A costa aprovada permanece até o pedido de usá-la |

O Cursor não entra como a janela do editor dentro do site. A aba é o chat do Estoque-Peças. O servidor cria o agente, manda a mensagem e devolve o texto e o arquivo.

---

## O que o chat abre e converte

- Imagem: BMP, PNG, JPG, WEBP, GIF, TIFF, SVG, de um formato para outro
- PDF e Illustrator (`.ai` da ficha é PDF): página vira imagem no tamanho em pixel pedido. Vetor (logo) pode ser usado pelo traço, para o contorno não borrar
- Photoshop (`.psd`): arte achatada vira imagem, inclusive CMYK como a onça
- HTML: página salva ou endereço vira imagem

Hoje o Desenv-M1 só guarda foto de ponto em PNG, JPG, BMP, WEBP, GIF e SVG. PDF só abre no programa do Windows. PSD, Illustrator e HTML entram neste degrau.

---

## Como o agente entra no servidor

Pacote `@cursor/sdk` no servidor Express (o projeto já é TypeScript). Node.js 22.13 ou mais novo.

Forma da conversa: `Agent.create` e, a cada mensagem, `agent.send`, com o texto chegando em fluxo. O id do agente fica salvo na peça para `Agent.resume` continuar o mesmo chat depois.

Chave `CURSOR_API_KEY` só no servidor (Cursor Dashboard → API Keys). O uso conta na mesma conta do Cursor.

Runtime local, com a pasta da arte daquela referência. O agente lê e grava ali. A pasta do código do Estoque-Peças fica de fora, para um pedido de imagem não alterar o programa.

Ferramentas próprias do servidor, expostas ao agente (`local.customTools`):

- converter PDF, PSD, AI e HTML em imagem
- medir tamanho, cores e linha contada de baixo
- reduzir o desenho e repetir até fechar a medida, sem cor nova
- colocar a cabeça, largura e altura separadas, com o queixo numa linha
- gravar BMP de 24 bits como versão nova

O agente também usa as ferramentas dele: ler arquivo, escrever, rodar comando e buscar na internet. Sem sandbox ligado, a rede fica disponível. Revisão automática (`local.autoReview`) ligada, no mesmo critério do Cursor.

O SDK está em beta público.

---

## Degraus

1. Aba, chat, prévia e agente local em cima de um BMP, com versão nova a cada pedido
2. Conversores de PDF, PSD, AI e HTML, e as ferramentas de malha (repetir, paleta, linha de baixo)
3. Busca na internet e vínculo da arte com a referência da peça, junto da densidade
