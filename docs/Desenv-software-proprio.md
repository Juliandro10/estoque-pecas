# Desenvolvimento de software próprio — avaliação Syntech vs painel Tricot

Documento de referência para decisão estratégica: substituir, integrar ou estender o Syntech Têxtil com o painel **Estoque de Peças** / **Desenv-Cadastro**.

**Data da avaliação:** junho/2026  
**Base técnica:** mapeamento do banco Firebird `FABRICA.MDB` (RENATA `192.168.1.69:3050`) + estado atual do repositório.

---

## 1. Resumo executivo

O Syntech não é um cadastro simples — é um **ERP têxtil completo** com centenas de tabelas, décadas de regras de negócio e módulos que a Tricot nem utiliza no dia a dia (NF, financeiro, e-commerce, integrações).

O painel atual já cobre o **gargalo real** da fábrica: leitura do `.sin` / Sintral, consolidação de fios, validação de códigos e **push parcial ao Syntech** — eliminando redigitação manual da ficha técnica.

| Abordagem | Dificuldade | Prazo estimado | Recomendação |
|-----------|-------------|----------------|--------------|
| **C — Clonar Syntech sem NF** | 9/10 | 3–5 anos | Não recomendado |
| **B — ERP próprio (cadastro → loja)** | 7/10 | 10–22 meses | Só se sair do Syntech |
| **A — Painel integrado ao Firebird** | 4/10 | 5–12 meses | **Caminho natural** |
| **D — Manter Syntech + painel pontual** | 2/10 | Contínuo | **Onde estamos hoje** |

---

## 2. Como o Syntech está organizado (visão do banco)

### 2.1 Números reais (FABRICA.MDB)

| Item | Volume |
|------|--------|
| Tabelas no banco | **413** |
| Produtos (`PRODUTOS`) | **2.754** |
| Ordens de serviço (`ORDEM_SERVICO`) | **2.627** |
| Tipos de fio (`TIPO_FIO`) | **69** |
| Guias-fio (`GUIA_FIO`) | **22.032** |
| Tamanhos por produto (`TAMANHO_PROD`) | **4.511** |
| Partes de produto (`PARTES_PROD`) | **6.093** |
| Matéria-prima por produto (`MAT_PRIMA_PROD`) | **1.826** |
| Produtos com estoque na fábrica | **324** |

### 2.2 Fluxo macro (cadastro → loja)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. CADASTRO DE PRODUTO                                                  │
│    PRODUTOS · TAMANHO_PROD · CORES · TEMPO_PESO_PROD · GUIA_FIO         │
│    PARTES_PROD · MAT_PRIMA_PROD · Processos fábrica (bicos 1–16)        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. FIO / MATÉRIA-PRIMA                                                  │
│    TIPO_FIO · CORES · PEDIDO_FIO · ENTR_CONES · QUANT_CONES             │
│    RESERVA_FIOS_PROD (reserva por OP) · baixas de consumo               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. CONTROLE DE PRODUÇÃO                                                 │
│    ORDEM_SERVICO · STATUS_OP · ORDEM_SERVICO_MAQ · follow-up             │
│    BAIXA_PRODUCAO (saída / defeito)                                     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. PRODUTO ACABADO (FÁBRICA)                                            │
│    ENTR_ESTOQUE · PRODUTOS.ESTOQUE_ATUAL · RESERVA_ESTOQUE              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. LOJA (banco separado — ex.: LOJA.MDB)                                │
│    Transferência fábrica → loja · estoque e venda na loja               │
└─────────────────────────────────────────────────────────────────────────┘

        ┌──────────────────────────────────────────┐
        │ FORA DO ESCOPO TRICOT (mas existe no ERP) │
        │ NF · SPED · financeiro · boletos · Bling  │
        │ Shopee · app · auditoria · e-commerce     │
        └──────────────────────────────────────────┘
```

### 2.3 Telas Syntech × tabelas

| Tela / função | Tabelas principais | Complexidade |
|---------------|-------------------|--------------|
| Lista / cadastro produto | `PRODUTOS` (+150 campos) | Alta |
| Ficha técnica (tempo, peso, guias) | `TEMPO_PESO_PROD`, `GUIA_FIO` | Média |
| Processos fábrica (bicos, %, peso) | `PRODUTOS` PARTE/TIPO_FIO/PERC/PESO/CABO | Alta |
| Partes do produto | `PARTES_PROD` | Baixa |
| Sugestão matéria-prima | `MAT_PRIMA_PROD` | Média |
| Ordem de serviço / OP | `ORDEM_SERVICO`, `RESERVA_FIOS_PROD` | Muito alta |
| Estoque de fio | `PEDIDO_FIO`, `QUANT_CONES`, reservas | Alta |
| Estoque peça pronta | `PRODUTOS`, `TAMANHO_PROD`, `CORES_PROD` | Média |
| Envio para loja | transferência + `LOJA.MDB` | Média–alta |

### 2.4 Exemplo integrado — referência 5534

| Módulo | Campo / tabela | Valor gravado pelo painel |
|--------|----------------|---------------------------|
| Cadastro | `PRODUTOS.PROGRAMA` | `5534-REGATA-LISTRA` |
| Máquina | `PRODUTOS.MAQUINA` | 5 (CMS 502 E6.2) |
| Peso bruto | `PRODUTOS.PESO` | 0,200 |
| Tempos | `TEMPO_PESO_PROD` | CORPO×2 + GOLA |
| Guia-fios | `GUIA_FIO` | 7 guias |
| Partes | `PARTES_PROD` | CORPO 2 · GOLA 1 |
| Bicos máquina | `PRODUTOS` bicos 1–10 | 7 bicos com TIPO_FIO |
| Matéria-prima | `MAT_PRIMA_PROD` | fios consolidados |

---

## 3. O que o painel Tricot já faz (jun/2026)

### 3.1 Módulos implementados

| Módulo | Descrição | Status |
|--------|-----------|--------|
| **Programação** | Extra R$ 150, busca em `PROGRAMAS`, Firestore | ✅ |
| **Desenv-Cadastro** | Partes, tempos Sintral, pesos, fios `.sin`/`.simx` | ✅ |
| **Fios consolidados** | % consumo, bicos, validação visual | ✅ |
| **Catálogo fios Syntech** | `data/syntech-fios.json` (tipo + código + cores) | ✅ |
| **Coluna Cod. fio** | Resolução antes do envio | ✅ |
| **Máquina no painel** | CMS + calibre do `.sin` | ✅ |
| **Push Syntech** | Firebird direto (sem API Syntech) | ✅ Parcial |
| **Scanner local** | `Iniciar.bat` → painel :3847 + scanner :3848 | ✅ |

### 3.2 Push Syntech — o que grava hoje

- `TEMPO_PESO_PROD` — tempos e pesos por parte
- `GUIA_FIO` — guias do `.sin` (tipo, cabo, cor)
- `PRODUTOS` — programa, máquina, peso, bicos 1–10
- `PARTES_PROD` — quantidade por parte
- `MAT_PRIMA_PROD` — fios consolidados

### 3.3 Regras fixas de negócio (bicos)

| Bico | TIPO_FIO | Observação |
|------|----------|------------|
| 1 | 70 | RESTO DE FIO — separação, cabo 1 |
| 2 | 13 | LASTEX — elástico pente, cabo 1 |
| 8 | 70 | RESTO DE FIO — remonte, cabo do `.sin` |

### 3.4 Fora do escopo atual (confirmado)

- Roteiro dos processos
- Cores do produto acabado
- Nota fiscal e financeiro
- Ordem de serviço / OP completa
- Estoque de fio operacional (entrada/saída/reserva)
- Estoque loja

### 3.5 Limitação operacional

O **Iniciar.bat** precisa ficar rodando (painel + scanner). Futuro: serviço Windows ou ícone na bandeja (~1–2 semanas de trabalho).

### 3.6 Estimativa de cobertura

O painel cobre **~8–12%** de um ERP têxtil completo, mas ataca **~70% da dor de digitação** no fluxo de desenvolvimento de malha.

---

## 4. Opções de desenvolvimento (do mais complexo ao mais simples)

---

### Opção C — Clonar o Syntech inteiro (sem NF)

**Dificuldade: 9/10** · **Risco: alto** · **Não recomendado**

#### O que seria

Reimplementar ERP têxtil com 400+ tabelas, todos os setores, relatórios, exceções acumuladas em 20+ anos — apenas omitindo módulo fiscal.

#### Caminho de desenvolvimento

1. Reverse engineering completo do Firebird (413 tabelas, triggers, procedures)
2. Modelagem de domínio têxtil (malha, fio, OP, grades, cores, aviamentos…)
3. Backend próprio (Postgres/Firebird) + frontend web
4. Migração de dados históricos (2.754 produtos, 2.627 OPs…)
5. Treinamento e convivência paralela Syntech ↔ sistema novo

#### Prazo

| Equipe | Prazo |
|--------|-------|
| 1 dev part-time | 3–5 anos |
| 2 devs full-time | 2–3 anos |
| Equipe ERP (4+) | 18–24 meses |

#### Prós

- Independência total do fornecedor
- UX moderna em tudo

#### Contras

- Custo enorme
- Risco de perder regras ocultas no Syntech
- NF ainda seria necessária em outro sistema
- Paralisa operação durante migração

---

### Opção B — ERP próprio focado na Tricot (cadastro → fio → OP → loja)

**Dificuldade: 7/10** · **Risco: médio** · **Só se a meta for sair do Syntech**

#### O que seria

Sistema novo **sem NF**, cobrindo apenas o fluxo real da malharia Tricot, integrado ao painel atual como front-end.

#### Caminho de desenvolvimento (fases)

| Fase | Entrega | Escopo | Prazo* |
|------|---------|--------|--------|
| **B1** | Cadastro produto | ref, partes, tempos, pesos, guias, grades, cores | 3–4 meses |
| **B2** | Estoque de fio | catálogo, entrada, saldo kg/cones, reserva, baixa | 2–3 meses |
| **B3** | Ordem de produção | OP, máquina, status, reserva fio, baixa produção | 4–6 meses |
| **B4** | Produto acabado | entrada PA, defeito, estoque fábrica | 2–3 meses |
| **B5** | Loja | transferência fábrica → loja, estoque por loja | 2–3 meses |
| **B6** | Infra | auth, permissões, auditoria, backup, serviço Windows | 2–3 meses |

\*1 dev experiente part-time; dividir por ~1,5–2 com dev dedicado ou dupla.

#### Prazo total

| Equipe | Prazo |
|--------|-------|
| 1 dev part-time | **15–22 meses** |
| 2 devs | **10–14 meses** |
| Equipe enxuta full-time + validação semanal | **8–10 meses** |

#### Stack sugerida

- **Front:** React (painel atual — Vite + TypeScript)
- **Back:** Node (scanner evoluído) ou API dedicada
- **Dados:** Firestore (cadastro leve) + Postgres (estoque/OP) **ou** Firebird próprio
- **Integração Stoll:** leitura `PROGRAMAS`, `.sin`, `.simx`, Sintral (já feito)

#### Prós

- Sistema enxuto, só o que a Tricot usa
- UX unificada no painel
- Sem licença Syntech no longo prazo

#### Contras

- Duplicar regras que o Syntech já resolve
- Migração de estoque e OP históricas
- Manutenção própria para sempre
- Loja pode continuar precisando de outro módulo

---

### Opção A — Painel como “casca” do Syntech (integração Firebird)

**Dificuldade: 4/10** · **Risco: baixo** · **Recomendado**

#### O que seria

Manter Syntech como **banco de verdade**; o painel substitui telas de digitação e consulta. Evolução natural do que já funciona com o push do 5534.

#### Caminho de desenvolvimento (fases)

| Fase | Entrega | Status | Prazo* |
|------|---------|--------|--------|
| **A0** | Cadastro desenvolvimento + push parcial | ✅ Em produção | — |
| **A1** | Push completo ficha + processos + validações | Em andamento | 2–3 meses |
| **A2** | Consulta OP e estoque fio (somente leitura) | Pendente | 2–3 meses |
| **A3** | Abrir OP simples + reservar fio (escrita) | Pendente | 2–3 meses |
| **A4** | Scanner em background (sem terminal) | Pendente | 1–2 semanas |
| **A5** | Consulta estoque PA + transferência loja (leitura) | Pendente | 2 meses |

\*1 dev part-time; **5–7 meses** com dev dedicado.

#### Arquitetura

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Navegador   │────▶│  Painel :3847   │────▶│  Scanner :3848   │
│  (React)     │     │  (Vite)         │     │  (Node/Express)  │
└──────────────┘     └─────────────────┘     └────────┬─────────┘
                                                       │
                       ┌───────────────────────────────┼───────────────┐
                       ▼                               ▼               ▼
                 PROGRAMAS/                    Firebird              Firestore
                 .sin / Sintral                 FABRICA.MDB          (programação)
                 Stoll M1                       LOJA.MDB
```

#### Prós

- Aproveita 100% do estoque, OP e histórico existentes
- Menor prazo e menor risco
- Reversível (Syntech continua funcionando)
- Já provado com referência 5534

#### Contras

- Dependência do Firebird e schema Syntech
- Scanner local ainda necessário (até fase A4)
- UX limitada pelas regras do banco legado

---

### Opção D — Manter status quo + melhorias pontuais

**Dificuldade: 2/10** · **Risco: mínimo** · **Situação atual**

#### O que seria

Syntech continua sendo o ERP principal. Painel cobre desenvolvimento, programação extra e push de cadastro. Melhorias incrementais conforme necessidade.

#### Caminho de desenvolvimento

- Completar push para todos os campos usados na ficha
- Sincronizar catálogo de fios quando houver cadastro novo
- PDF / relatórios de custo no painel (sem depender do Syntech)
- Serviço Windows quando incomodar o terminal

#### Prazo

Contínuo — entregas de **1–4 semanas** por melhoria.

#### Prós

- Custo mínimo
- Zero risco operacional
- Foco no que dói hoje

#### Contras

- Dois sistemas para sempre
- OP e estoque continuam só no Syntech
- Redigitação em módulos não integrados

---

## 5. Comparativo rápido

| Critério | C — Clonar | B — ERP próprio | A — Integrado | D — Pontual |
|----------|------------|-----------------|---------------|-------------|
| Prazo | Anos | 8–22 meses | 5–12 meses | Contínuo |
| Custo | Muito alto | Alto | Médio | Baixo |
| Risco operacional | Alto | Médio | Baixo | Mínimo |
| Independência Syntech | Total | Total | Não | Não |
| Reaproveita painel atual | Parcial | Sim | **Sim** | **Sim** |
| Cobre OP + estoque fio | Sim | Sim | Leitura → escrita | Não |
| NF | Fora | Fora | Fora | Fora |

---

## 6. Recomendação estratégica

### Curto prazo (6 meses)

**Opção A + D:** completar integração Firebird (fase A1), catálogo de fios, validação no painel, serviço em background (A4).

### Médio prazo (6–18 meses)

Avaliar **A2/A3** (consulta e OP simples no painel). Só então decidir se **Opção B** ainda faz sentido.

### Longo prazo

**Opção C** só se houver equipe dedicada e motivo forte para sair do Syntech (custo de licença, limitação técnica, fim do suporte).

---

## 7. Infraestrutura técnica atual (referência)

| Item | Valor |
|------|-------|
| Servidor Firebird | `192.168.1.69:3050` |
| Banco fábrica | `C:\Textil\Empresas\FABRICA.MDB` |
| Banco loja | `LOJA.MDB` (separado) |
| Pasta programas | `PROGRAMAS` (Stoll) |
| Painel local | `http://127.0.0.1:3847` |
| Scanner API | `http://127.0.0.1:3848` |
| Catálogo fios | `data/syntech-fios.json` |
| Sync catálogo | `npx tsx scripts/sync-syntech-fios.ts` |
| Teste push | `npx tsx scripts/test-syntech-push-5534.ts` |

### Arquivos principais da integração

| Arquivo | Função |
|---------|--------|
| `server/syntech-push.ts` | Orquestra push ao Firebird |
| `server/syntech-db.ts` | Conexão Firebird |
| `server/syntech-guia-fio.ts` | Parse e gravação guia-fios |
| `server/syntech-processos.ts` | Partes produto e bicos máquina |
| `server/syntech-yarn-catalog.ts` | Sync catálogo TIPO_FIO + cores |
| `server/sin-machine.ts` | Máquina CMS + calibre |
| `server/programs-scanner.ts` | API local (scanner v22) |
| `src/pages/dev/DesenvCadastroPage.tsx` | UI Desenv-Cadastro |
| `src/lib/syntech-yarn-match.ts` | Resolução código fio no painel |

---

## 8. Próximos passos sugeridos (quando retomar)

1. [ ] Completar push — roteiro e cores PA (se entrarem no escopo)
2. [ ] Serviço Windows / bandeja — eliminar terminal visível
3. [ ] Tela consulta OP (leitura `ORDEM_SERVICO`)
4. [ ] Tela estoque fio (leitura `QUANT_CONES` + reservas)
5. [ ] Documentar telas Syntech que a Tricot **realmente** usa (workshop 1h)
6. [ ] Decidir marco para avaliar Opção B vs continuar Opção A

---

## 9. Histórico deste documento

| Data | Alteração |
|------|-----------|
| jun/2026 | Criação — avaliação pós-integração 5534, catálogo fios, máquina no painel |

---

*Documento vivo — atualizar conforme novas fases forem concluídas ou decisão estratégica mudar.*
