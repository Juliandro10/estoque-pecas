# Rascunho — leitor de medidas de molde + cálculo automático (M1 Plus)

Documento de ideias gerais para implementação futura. Complementa o painel **Desenv-M1** (densidade, malhas e passadas) e o fluxo de **Desenv-Cadastro**.

---

## Objetivo

Automatizar a leitura de medidas de **moldes de papel** (kraft, como os usados na programação) e enviar largura/altura (e medidas técnicas por peça) para o painel M1 Plus, que já calcula **malhas (agulhas)** e **passadas (altura de malhas)** com base na densidade do swatch.

**Meta:** colocar o molde na mesa, tirar foto, revisar contorno/medidas na tela, enviar ao PC — **sem fita métrica em cima de cada molde** e sem digitar cm manualmente.

---

## Contexto no painel atual

O **Desenv-M1** (`/desenv-m1`) já possui:

- Entrada manual de **largura cm** e **altura cm** do pano
- Densidade derivada do swatch / programa: **colunas por 10 cm** e **carreiras por 10 cm**
- Fórmulas (ver `docs/Desenv-M1-rascunho.md`):

```
malhas_necessarias   ≈ round(largura_cm  / 10 × colunas_por_10cm)
passadas_necessarias ≈ round(altura_cm   / 10 × carreiras_por_10cm)
```

A nova funcionalidade **substitui ou alimenta** a parte manual de largura/altura — o cálculo de malhas/passadas permanece no painel M1.

---

## Problema a resolver

Moldes reais **não são retângulos simples**: têm cava, ombro inclinado, gola, etc. Medidas como “largura” e “comprimento” precisam ser definidas por **tipo de peça** (CT, FT-D, FT-E, MG…) ou por **linhas de medida** sobre o contorno.

Câmera sozinha **não sabe escala em cm** sem referência fixa ou calibração. Apps genéricos de medição (AR, scan de documento) não cobrem molde no chão + integração com programação Stoll.

---

## Decisão de arquitetura (rascunho)

| Tópico | Decisão |
|--------|---------|
| Produto | **App nosso** (não depender de apps de terceiros) |
| Escala | **Mesa com régua fixa em cm** — linhas horizontais (largura) e verticais (altura), como fita permanente embaixo do molde |
| Fita no molde | **Não** — escala vem só da mesa |
| Contorno | Detecção automática do papel marrom + **ajuste manual** de pontos na v1 |
| Medidas | Automáticas a partir do contorno (altura total, largura máx.) + linhas ajustáveis (ex.: largura no busto) |
| Processamento | **Foto no celular → servidor local** (mesma rede do painel, ex. porta 3847) com visão computacional (OpenCV) |
| Integração | Medidas confirmadas → API/cadastro M1 da peça → densidade existente → malhas/passadas |

---

## Estação de captura (hardware)

- **Mesa ou chão** com área útil graduada (ex.: ~70×80 cm, conforme maior molde)
- **Grade em cm**: linhas a cada 1 cm (marca maior a cada 5 ou 10 cm); eixo X = largura, eixo Y = altura
- **Câmera fixa** (tripé/suporte) na mesma posição sempre — reduz erro de perspectiva
- Molde plano dentro da área; sem objetos sobre o contorno na hora da foto

Alternativa equivalente: 4 **marcadores** (ArUco) nos cantos da área + grade impressa — mesma lógica de escala fixa.

---

## Fluxo do app (MVP)

```
1. Usuário coloca molde na mesa graduada
2. Tira foto (PWA / app mobile na rede local)
3. Upload para o servidor local
4. Servidor:
   a. Corrige perspectiva usando a grade (homografia → vista de cima)
   b. Detecta contorno do papel (cor + maior contorno fechado)
   c. Calcula medidas iniciais em cm (altura total, largura máxima)
5. Tela de revisão:
   a. Overlay do contorno sobre a imagem corrigida
   b. Arrastar pontos para corrigir borda (cava, vinco, sombra)
   c. (Opcional) Linha horizontal/vertical arrastável → largura naquela altura
   d. Exibir cm com 1 casa decimal
6. Confirmar → enviar medidas ao Desenv-M1 / cadastro da peça
7. Painel aplica densidade do swatch → malhas e passadas
```

---

## O que o app faz vs. o que a mesa resolve

| Componente | Função |
|------------|--------|
| Mesa graduada | Escala real (1 cm na mesa = 1 cm no molde, após correção) |
| Correção de perspectiva | Alinha foto inclinada com os eixos X/Y da grade |
| Detecção de contorno | Acha borda externa do molde (automático) |
| Edição manual | Garante precisão em recortes e dobras |
| Linhas de medida | Define largura em altura específica (não só retângulo envolvente) |
| M1 Plus | Densidade + fórmula malhas/passadas (já existente) |

A grade **não mede o molde sozinha** — ela fornece o sistema de coordenadas. O contorno (ou linhas sobre ele) define **onde** medir.

---

## Medidas por tipo de peça (fase 2)

Templates por peça, por exemplo:

| Peça | Medidas sugeridas |
|------|-------------------|
| CT (costas) | Altura total, largura máx., largura no busto |
| FT-D / FT-E (frentes) | Idem + atenção a molde espelhado / metade |
| MG (manga) | Comprimento, largura no punho, largura no ombro da manga |

App posiciona linhas padrão; usuário confirma ou ajusta levemente.

---

## Precisão esperada

- Com mesa graduada + câmera fixa + contorno revisado: **±2–3 mm** (realista)
- Foto livre no chão, sem estação: **não confiável** para produção
- Encolhimento do tecido: molde = tecido plano; malha **crua** — alinhar com regra do M1 (pano sem lavar); fator de correção por cliente/fio pode ser fase posterior

---

## Stack técnica (proposta)

| Camada | Proposta |
|--------|----------|
| Mobile | PWA ou Capacitor (câmera + upload); mesma identidade visual do painel |
| Servidor | Endpoint no Express local (`server/`) — processamento de imagem |
| Visão | OpenCV (Node nativo ou serviço auxiliar Python) — homografia, contorno, distâncias em cm |
| Painel | Desenv-M1 recebe medidas; preenche largura/altura; mantém histórico em `m1-knowledge.json` |

---

## O que **não** fazer na v1

- OCR dos números de fita métrica
- Foto sem mesa graduada / escala “adivinhada” por IA
- Contorno 100% automático sem revisão (vinco, sombra, dobra quebram detecção)
- Apps de terceiros (Medidas AR, scan A4, etc.) — não integrados ao M1

---

## Roadmap sugerido

| Fase | Entrega |
|------|---------|
| **A** | Mesa graduada (impressão/fixação) + captura + homografia + altura/largura máx. + envio manual ao M1 |
| **B** | Edição de contorno + linha de largura ajustável |
| **C** | Templates por tipo de peça (CT, FT, MG) |
| **D** | Múltiplas linhas / contorno completo para shaping (cavas, entretamentos) — só se necessário na programação |

---

## Referências no repositório

- `docs/Desenv-M1-rascunho.md` — densidade, fórmulas, layout M1
- `src/pages/dev/DesenvM1Page.tsx` — UI atual (pano manual + malhas/passadas)
- `data/m1-knowledge.json` — histórico de medições e tipos de ponto
- `server/m1-knowledge.ts`, `server/m1-density-read.ts` — leitura de densidade do programa

---

## Notas da conversa (jun/2026)

- Moldes físicos: papel kraft, ~60 cm de altura, formas irregulares (cardigan, frente D/E, etc.)
- Fix aplicado no cadastro de fios: yarnParts FT-D e FT-E dividindo peso quando uma única linha de peso FT existe no cadastro (contexto separado; não faz parte deste app de molde)
- Usuário confirmou direção: **marcadores/régua fixa na mesa em cm**; app faz detecção de borda, medidas e envio ao painel

---

*Rascunho — sem implementação. Retomar quando for prioridade.*
