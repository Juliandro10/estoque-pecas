# Rascunho — aba Desenv-M1 (densidade + regulagem + histórico)

Documento de desenho para implementação futura. Alinhado às decisões da equipe e ao que o projeto já possui (`sin-machine`, `sin-yarn`, `stoll-time`, `syntech-fios`).

---

## Decisões fechadas

| Tópico | Decisão |
|--------|---------|
| Navegação | Nova aba dedicada (não seção dentro do Desenv-Cadastro) |
| Medição | Pano **sem lavar** — tricot não passa por lavagem na fábrica |
| Densidade | Do `.sin`: malhas (agulhas) + passadas; cm informados manualmente; NPs do `.sin` / `.setx` |
| Regulagem | `.setx` prioritário quando existir (mais específico); fallback NP do `.sin` |
| Fio | Nome/descrição do `.sin` comparado ao cadastro Syntech + código Syntech quando houver match |
| Histórico | Completo — comparações e evolução das medições |
| Mockup símbolos + IA | Roadmap futuro; mesma aba quando integrar IA na programação |

---

## 1. Nome e rota

| Item | Proposta |
|------|----------|
| **Menu** | `Desenv-M1` |
| **Rota** | `/desenv-m1` |
| **Arquivo UI** | `src/pages/dev/DesenvM1Page.tsx` |
| **Posição no menu** | Abaixo de **Desenv-Cadastro** |

Motivo do nome: cobre densidade e regulagem agora; mockup de símbolos e IA entram na mesma aba depois.

---

## 2. Layout da tela (wireframe)

```
┌─────────────────────────────────────────────────────────────────┐
│ Desenv-M1                                                       │
├─────────────────────────────────────────────────────────────────┤
│ Referência: [5534        ] [Carregar]  ← mesmo fluxo do cadastro│
│ Máquina: CMS 530 E7,2 (do .sin)                                 │
├─────────────────────────────────────────────────────────────────┤
│ Parte: [CORPO ▼]  .sin ✓  .setx ✓                               │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Medição do pano (manual) ─────────────────────────────────┐  │
│ │ Largura (cm):  [____]    Altura (cm):  [____]               │  │
│ │ Observação:    [________________________]                   │  │
│ └─────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Do programa (automático) ───────────────────────────────────┐  │
│ │ Malhas (agulhas): 539        Passadas: 245                   │  │
│ │ YDF: 2   YGC: /1F=A 2F=B …                                   │  │
│ └─────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Graduação ─────────────────────────────────────────────────┐  │
│ │ Fonte: (.sin) NP  │  (.setx) NP — prioriza .setx se existir │  │
│ │ NP1  10,0  Setup Row    NP4  10,5  CANELADO   …             │  │
│ │ [filtrar por tipo de ponto ▼]  ← opcional fase 2            │  │
│ └─────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Densidade calculada ────────────────────────────────────────┐  │
│ │ Colunas / 10 cm:  100,0    Carreiras / 10 cm:  73,5         │  │
│ │ (malhas ÷ cm_larg × 10)     (passadas ÷ cm_alt × 10)        │  │
│ └─────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Fios desta medição ────────────────────────────────────────┐  │
│ │ Bico │ Nome (.sin)      │ Cod. Syntech │ %                    │  │
│ │  1   │ MESCLA SHINE     │ 32           │ 45                   │  │
│ └─────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ Tipo de ponto: [Meia malha ▼]  (manual ou inferido depois)     │
│ [Salvar medição]  [Salvar e comparar]                            │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Histórico & similares ──────────────────────────────────────┐  │
│ │ Esta ref │ Outras refs │ Mesmo fio+máquina+ponto             │  │
│ │ 5534 CORPO 73/100  NP4=10,5  2026-06-01                      │  │
│ │ 5500 CORPO 71/98   NP4=10,5  2026-05-12  ← similar          │  │
│ └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Campos: automático vs manual

| Campo | Origem | Observação |
|-------|--------|------------|
| Referência / partes | Scanner `PROGRAMAS` | Igual Desenv-Cadastro |
| Máquina CMS + calibre | `.sin` linha 1 | `sin-machine.ts` |
| Malhas (agulhas) | `.sin` | Parser novo `sin-density.ts` |
| Passadas | `.sin` | Idem |
| Largura cm / Altura cm | **Manual** | Pano sem lavar |
| NPs | `.setx` (prioridade) → `.sin` | `.setx` mais completo |
| YDF, YGC, fios | `.sin` + match Syntech | Reutiliza `sin-yarn` + `syntech-yarn-match` |
| Colunas/carreiras por 10 cm | **Calculado** | Ver fórmulas abaixo |
| Tipo de ponto | Manual (v1) | Inferência do `.sin` depois |
| Notas | Manual | Livre |

---

## 3. Fórmulas de densidade

Medição no pano cru (sem lavagem):

```
colunas_por_10cm   = (malhas   / largura_cm) × 10
carreiras_por_10cm = (passadas / altura_cm)   × 10
```

Inverso (calculadora futura, já usada no Programa-o-STOLL):

```
malhas_necessarias   ≈ round(largura_cm  / 10 × colunas_por_10cm)
passadas_necessarias ≈ round(altura_cm   / 10 × carreiras_por_10cm)
```

Arredondamento na UI: exibir 1 casa decimal; gravar valor completo no histórico.

---

## 4. Arquivos de dados

### 4.1 `data/m1-knowledge.json` (catálogo + histórico)

Evolução do `library.json` do Programa-o-STOLL, com histórico embutido.

```json
{
  "version": 2,
  "stitchTypes": [
    { "id": "mm-frente", "code": "M.M", "name": "Meia malha frente" },
    { "id": "canelado-2x2", "code": "2x2", "name": "Canelado 2x2" }
  ],
  "measurements": []
}
```

Máquinas e fios **não duplicar** em catálogo próprio: derivar de `.sin` + `syntech-fios.json` no momento da leitura.

### 4.2 Registro de medição (`measurements[]`)

```json
{
  "id": "uuid",
  "createdAt": "2026-06-10T14:30:00.000Z",
  "updatedAt": "2026-06-10T14:30:00.000Z",

  "reference": "5534",
  "programFolder": "5534-REGATA-LISTRA",
  "partBase": "5534-REGATA-LISTRA-CORPO",
  "partLabel": "CORPO",

  "machine": {
    "cms": "CMS530",
    "gauge": "E7.2",
    "label": "CMS 530 E7,2",
    "syntechMaquina": 1
  },

  "swatch": {
    "widthCm": 25.0,
    "heightCm": 20.0,
    "fabricState": "raw"
  },

  "programCounts": {
    "wales": 539,
    "courses": 245,
    "source": "sin"
  },

  "density": {
    "walesPer10cm": 215.6,
    "coursesPer10cm": 122.5
  },

  "regulation": {
    "primarySource": "setx",
    "sinNps": [
      { "np": 1, "value": 10.0, "label": "Setup Row" },
      { "np": 4, "value": 10.5, "label": "CANELADO" }
    ],
    "setxNps": [
      { "np": 7, "value": 14.5 }
    ],
    "ydf": 2,
    "ygc": "/1F=A 2F=B"
  },

  "stitchTypeId": "mm-frente",
  "stitchTypeCode": "M.M",

  "yarns": [
    {
      "bico": 1,
      "sinDescription": "MESCLA SHINE",
      "sinDescriptionKey": "MESCLA SHINE",
      "syntechCod": 32,
      "syntechDesc": "MESCLA SHINE",
      "pct": 45.0,
      "letter": "A"
    }
  ],

  "files": {
    "sin": "5534-...-CORPO.sin",
    "setx": "5534-...-CORPO.setx",
    "sinPath": "...",
    "setxPath": "..."
  },

  "notes": ""
}
```

### Chaves de busca para “similares”

Ordem de match (do mais forte ao mais fraco):

1. `syntechCod` + `machine.cms` + `machine.gauge` + `stitchTypeCode`
2. `sinDescriptionKey` normalizada + máquina + tipo ponto (se cod. Syntech faltar)
3. Só máquina + tipo ponto + faixa de NP principal (ex.: NP4 ≈ ±0,3)

---

## 5. APIs no scanner (`:3848`)

Seguindo o padrão de `/api/programs/syntech-fios`:

| Método | Rota | Função |
|--------|------|--------|
| `GET` | `/api/programs/m1-density?ref=&part=` | Malhas, passadas, NPs, máquina, fios |
| `GET` | `/api/programs/m1-knowledge` | Catálogo + histórico |
| `POST` | `/api/programs/m1-measurements` | Gravar medição |
| `GET` | `/api/programs/m1-similar?...` | Similares por fio+máquina+ponto |
| `POST` | `/api/programs/m1-calc-size` | cm → malhas/passadas (fase 4) |

Resolução de arquivos: mesma lógica de `stoll-time.ts` (pasta da parte → `C:\Stoll\Tmp` → `McDataTmp`).

---

## 6. Módulos server (novos)

| Arquivo | Responsabilidade |
|---------|------------------|
| `server/sin-density.ts` | Malhas e passadas do `.sin` |
| `server/sin-regulation.ts` | NP* do `.sin` (com rótulo) |
| `server/setx-regulation.ts` | `<NPn Value="…">`, `<MSECn>`, etc. |
| `server/m1-knowledge.ts` | Leitura/gravação `m1-knowledge.json` |
| `server/m1-similar.ts` | Busca no histórico |

Reutilizar:

- `sin-machine.ts` — máquina
- `sin-yarn.ts` — fios
- `stoll-time.ts` — localizar `.setx`
- `src/lib/syntech-yarn-match.ts` — cod. Syntech

---

## 7. Ordem de implementação

| Fase | Entrega | Estimativa |
|------|---------|------------|
| **1** | `data/m1-knowledge.json`, importar `library.json`, APIs GET/POST medições, rota + item menu | ~1–2 dias |
| **2** | Parsers `.sin` (malhas, passadas, NP) + `.setx` (NP/MSEC); endpoint `m1-density` | ~2–3 dias |
| **3** | UI Desenv-M1: carregar ref, cm manual, densidade calculada, salvar | ~2 dias |
| **4** | Histórico por ref + painel “similares” | ~1–2 dias |
| **5** | Calculadora cm ↔ malhas/passadas | ~1 dia |
| **6** | Mockup `stoll-vista-simbolos-m1plus.html` via scanner + gancho IA | depois |

**Nota fase 2:** na implementação, abrir 2–3 `.sin` reais e confirmar os campos exatos de malhas/passadas (nomes podem variar por versão M1).

---

## 8. Roadmap anotado (fora do escopo imediato)

- Servir mockup de símbolos em `/repo/...` (como no projeto antigo na porta 3777)
- IA na programação usando densidade + símbolos como contexto
- Opcional: espelhar amostras consolidadas no Syntech (`REGULAGEM_PROD`) — só se fizer sentido depois

---

## 9. Origem do projeto anterior

Base conceitual em `C:\Stoll-Pr\Programa-o-STOLL\starter\knowledge-base\`:

- `library.json` — yarns, machines, stitchTypes, densitySamples
- Calculadora agulhas/carreiras
- Mockup `stoll-vista-simbolos-m1plus.html`

Integração proposta: absorver no fluxo do Estoque de Peças (scanner `:3848`), sem servidor separado na 3777.

---

## 10. Próximo passo quando for codar

1. Confirmar no `.sin` os campos de malhas/passadas (1 programa real).
2. Implementar **fase 1 + 2** no scanner.
3. Subir a aba mínima (carregar ref → cm → densidade → salvar).
