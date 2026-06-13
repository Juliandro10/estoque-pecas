# Escopo — aba Desenv-Máquinas (envio de programa via rede)

Documento de escopo para substituir o fluxo de **pendrive** por envio de **`.zip` MC Program** (`.sin` + `.jac` + `.setx`) via **FTP**, começando pela **MAQ-12**.

Alinhado ao que o painel já possui (`programs-scanner`, `sin-machine`, pastas `PROGRAMAS`) e ao que foi validado na rede em jun/2026.

---

## Objetivo

Nova aba no **Estoque de Peças** para:

1. Escolher referência / parte (mesmo fluxo do Desenv-Cadastro)
2. Localizar o **`.zip`** gerado pelo M1plus
3. **Apagar** o programa antigo na máquina (comando remoto — ver seção abaixo)
4. **Enviar** o `.zip` novo via **FTP** (`KnitLAN / ftp / MAQ-xx / pattern / …`)
5. Registrar log (apagar + envio, sucesso, erro, caminho remoto)

> **Importante:** só fazer upload por cima do zip antigo **não basta** — é preciso apagar o programa na máquina antes, como o M1plus faz. O fluxo correto é **apagar → enviar novo**.

**Piloto:** MAQ-12 (`192.168.1.12`). Depois expandir MAQ-01…15.

**Fora do escopo inicial:** substituir o Explorador M1plus por completo, processar `.mdv` no painel, comandos online na máquina (start/stop), Syntech/OP.

---

## Situação hoje

| Etapa | Como é feito |
|--------|----------------|
| Processar | M1plus gera MC Program; `.zip` com sin/jac/set(x) |
| Extrair manual | Botão direito no `.mdv` → Extrair (sin/jc/setup) → pendrive ou pasta |
| Carregar na máquina | Operador leva pendrive (`F:\` USB) |
| Rede | Máquinas **já** na Ethernet; **não** usada para envio de programa |

---

## O que já foi validado (MAQ-12)

| Item | Resultado |
|------|-----------|
| IP | `192.168.1.12` (padrão configurado: `192.168.1.{n}` = MAQ-{n}) |
| Ping | OK a partir do PC de programação |
| FTP porta 21 | Aberta; login **anônimo** (user/senha vazios na máquina) |
| Caminho na máquina | `ftp://MAQ-12/pattern/{pasta-referência}/` |
| Conteúdo remoto | Pastas por referência (ex.: `1046-BLUSA-FANG-EXTRA`) com arquivos `CMS502.*.zip` |
| Leitura na máquina | Tela **Knit LAN → ftp → MAQ-12 → pattern** (mesma árvore) |
| SMB (445) | Fechado — **FTP é o caminho** |

Exemplo remoto (5455):

```
/pattern/5455-TOP-PONTO-CROCHE/
  CMS502.5455-TOP-CROCHE-LEIA-CT-P.zip
  CMS502.5455-TOP-CROCHE-LEIA-FT-P.zip
  CMS502+.5455-TOP-CROCHE-LEIA-CT-P.zip
  …
```

Conclusão: se a máquina **lê** da rede, o painel **pode enviar** para o mesmo destino.

---

## Apagar programa na máquina — descoberta M1plus (jun/2026)

No **Explorador de máquinas M1plus** → botão direito na máquina → **“Carregar dados para a máquina”**.

É a **mesma lógica da tela da máquina**, mas rodando no PC (Online ID = número da máquina, ex.: **12** para MAQ-12).

### Diálogo “Carregar dados para a máquina: CMS 502 HP(12)”

| Campo | Valor típico | Significado |
|--------|----------------|-------------|
| Arquivos | ☑ `.sin` ☑ `.jac` ☑ `.setx` | MC Program (Setup2 neste piloto); M1 **extrai do zip** na hora |
| **EALL** | ☑ marcado | **Apagar todos os dados na máquina** antes de enviar |
| **EAY** | ☐ opcional | **Excluir dados dos guia-fios** na máquina |
| Caminho | Pasta do **PROGRAMAS** (zip selecionado) ou KnitLAN | Ver fluxo validado abaixo |
| Ação | **Iniciar** | Protocolo online → `192.168.1.{id}` |

### Fluxo validado em fábrica — MAQ-12 (13/jun/2026) ✅

Operador confirmou: **programa na máquina, transferência com êxito.**

```
1. Processar no M1 (ou já processado)
2. Extrair MC Program → pasta do programa (botão direito .mdv ou atalho M1)
      → gera CMS502*.zip na pasta da referência
3. Explorador M1plus → CMS 502 HP(12) → Carregar dados para a máquina
4. ☑ sin  ☑ jac  ☑ setx   ☑ EALL   ☐ EAY
5. Procurar → selecionar o .zip dentro da pasta do programa
6. Iniciar
```

**Log M1plus (sucesso):**

| Ordem | Mensagem |
|-------|----------|
| 1 | Sintral extraído de arquivo zip |
| 2 | Jacquard extraído de arquivo zip |
| 3 | Setup2 extraído de arquivo zip |
| 4 | Conexão com máquina Nº 12 (**192.168.1.12**) iniciada |
| 5 | Transferir dados de amostra (**arquivo zip**) |
| 6 | Conexão perdida (normal ao fechar sessão) |
| 7 | Arquivos temporários apagados |
| 8 | **Transferência dos dados efetuada com êxito** |

**Conclusões:**

- Origem pode ser **pasta do programa + zip** — não obrigatoriamente só KnitLAN.
- O M1 **lê o zip** e extrai sin/jac/setx internamente antes de enviar.
- **EALL** faz parte do fluxo real de substituição de programa.
- O envio online usa o **zip como pacote**, via protocolo Stoll (não FTP manual na `/pattern/`).

### Salvar dados da máquina (PC ← máquina)

Explorador → botão direito → **“Salvar dados da máquina”** — fluxo **inverso** do carregar.

| Campo | Valor típico | Significado |
|--------|----------------|-------------|
| Arquivos | ☑ `.sin` ☑ `.jac` ☑ `.setx` | Lê o programa **que está na máquina** agora |
| Arquivo ZIP | ☑ (fixo/cinza) | Salva sempre como **zip** |
| Nome da amostra | ex. `5472-CARDIGAN-CASULO-MG` | Nome base do arquivo |
| Destino | `D:\Stoll\KnitLan\` | Pasta KnitLAN no PC |
| Ação | **Iniciar** | Baixa da MAQ-12 via rede |

**Uso na fábrica:** backup do que está rodando na máquina, recuperar programa alterado na máquina, ou conferir o que foi carregado.

**No painel (fase futura — Fase 2/3):**

| Função | Descrição |
|--------|-----------|
| **Salvar da máquina** | Chamar protocolo inverso → zip em pasta escolhida (ex. pasta do `PROGRAMAS`) |
| **Comparar** | Zip na máquina vs zip local (mesma ref/parte) |
| **Restaurar cadastro** | Programa só na máquina → trazer pro PC para arquivo |

Fora do MVP (Fase A): só **enviar** PC → máquina. Salvar máquina → PC entra depois que o envio estiver estável.

---

### Implicações para o painel

1. **Fluxo operacional confirmado:** extrair zip na pasta do programa → selecionar zip → EALL → Iniciar.
2. **Fluxo completo** = `EALL` + transferência do **zip** (M1 extrai sin/jac/setx) — **não** FTP manual solto na `/pattern/`.
3. O M1plus usa protocolo **online Stoll** (conexão `192.168.1.12`, “dados de amostra”).
4. **EAY** opcional; no teste ficou desmarcado.

### Estratégia de implementação (revisada)

| Abordagem | Descrição | Quando |
|-----------|-----------|--------|
| **A — Híbrida (rápida)** | Painel acha zip na pasta do programa + abre checklist / copia caminho para M1 | **Próximo piloto UI** |
| **B — Protocolo Stoll** | Replicar sessão M1: EALL + zip → `192.168.1.{id}` | Objetivo final (sem abrir M1) |
| **C — Só FTP zip** | Upload em `/pattern/` | **Não validado** — fluxo real passa pelo diálogo M1 |

**Fase 1 revisada:** começar com **A** (preparar arquivos + checklist EALL) enquanto investigamos **B** (captura de rede ou log knitFTP durante um “Iniciar” de teste).

### Pré-requisitos operacionais (manual Stoll)

- Carrinho parado no **ponto de reversão esquerdo**
- Máquina selecionada no Explorador com **Online ID** correto
- Rede Ethernet ativa (já configurada)

---

## Apagar programa na máquina (histórico — substituído pela seção acima)

<details>
<summary>Notas anteriores (FTP DELE)</summary>

Hipótese inicial: apagar só o `.zip` via FTP `DELE`. Com o diálogo M1plus, o apagar oficial é o flag **EALL** no protocolo online, não necessariamente delete de arquivo em `/pattern/`.

</details>

---

## Formato do arquivo

| Item | Regra |
|------|--------|
| Enviar | **`.zip`** MC Program (M1 extrai sin/jac/setx na transferência) |
| Conteúdo do zip | `.sin` + `.jac` + `.setx` (Setup2) ou `.set` (Setup1) |
| Nome típico | `CMS502.{parte}.zip` ou `CMS502+.{parte}.zip` (prefixo = CMS do `.sin`) |
| Origem no PC | **Pasta do programa** após “Extrair” no M1 (fluxo validado jun/2026) |

**Regra de busca local (proposta):** procurar `CMS*.zip` cujo nome contenha o `part_base` da parte selecionada, em:

1. Raiz da pasta do modelo
2. `dados do programa/`
3. `dados do programa/{parte}/`
4. (fase 2) pasta configurável de extração M1 / KnitLAN local

Se não achar zip → mensagem: *“Processe ou extraia no M1plus antes de enviar.”*

---

## Cadastro de máquinas

Arquivo local (proposta): `data/maquinas-rede.json`

```json
{
  "machines": [
    {
      "id": 12,
      "label": "MAQ-12",
      "hostname": "MAQ-12",
      "ip": "192.168.1.12",
      "cms": "CMS502",
      "online_id": 12,
      "enabled": true
    }
  ]
}
```

| Campo | Uso |
|--------|-----|
| `id` / `online_id` | Número da máquina (1–15) |
| `ip` | `192.168.1.{id}` — editável se mudar config |
| `cms` | Validar prefixo do zip vs máquina destino (aviso, não bloqueio na fase 1) |
| `enabled` | Piloto só MAQ-12 ativa; demais entram depois |

---

## Nome da pasta remota em `/pattern/`

**Incerteza:** o nome da subpasta nem sempre coincide com a pasta local do `PROGRAMAS`.

| Local (PROGRAMAS) | Remoto (MAQ-12) |
|-------------------|-----------------|
| `5455-TOP-CROCHE-LEIA` | `5455-TOP-PONTO-CROCHE` |

**Estratégia fase 1 (MAQ-12):**

1. Listar subpastas de `ftp://192.168.1.12/pattern/`
2. Sugerir match por **referência numérica** (ex.: `5455`) ou nome parcial
3. Operador **confirma ou escolhe** pasta destino antes do envio
4. Se pasta não existir → criar via FTP (se permitido) ou avisar para criar na máquina

**Estratégia fase 2:** mapa `referência → pasta remota` salvo após primeiro envio bem-sucedido.

---

## Fases de implementação

### Fase 0 — Escopo + protocolo M1plus

- [x] Validar FTP MAQ-12
- [x] Mapear estrutura `/pattern/`
- [x] Confirmar padrão de IP e formato zip
- [x] **Diálogo “Carregar dados para a máquina”** — EALL, EAY, sin/jac/set, KnitLAN
- [x] **Teste MAQ-12:** extrair zip → Carregar dados → EALL → sucesso
- [ ] Capturar tráfego/log knitFTP num envio (para Fase B)
- [ ] Decidir piloto UI: híbrido (A) vs protocolo (B)
- [ ] Aprovação para codar Fase 1

### Fase 1 — Piloto MAQ-12 (MVP revisado)

**Opção A (híbrida — primeiro entregável):**

| Bloco | Conteúdo |
|--------|----------|
| Máquina | MAQ-12, Online ID 12, status rede |
| Programa | Referência + parte → achar `.sin` `.jac` `.set` (ou extrair do zip) |
| KnitLAN | Copiar os 3 arquivos para pasta staging (`C:\Stoll\KnitLAN\…`) |
| Checklist | ☑ EALL necessário · carrinho à esquerda · abrir M1 → Iniciar |
| Log | Arquivos preparados + caminho KnitLAN |

**Opção B (objetivo — após entender protocolo):**

| Bloco | Conteúdo |
|--------|----------|
| Flags | EALL (+ EAY opcional) |
| Transfer | knitFTP / ticket Stoll → MAQ-12 |
| UI | **[Apagar + Enviar]** sem abrir M1 |

**UI wireframe (com flags M1plus):**

```
☑ Apagar todos os dados (EALL)    ☐ Apagar guia-fios (EAY)
☑ .sin  ☑ .jac  ☑ .set
[ Preparar KnitLAN ]  ou  [ Apagar + Enviar ]  (quando B pronto)
```

**Backend:** `server/m1-machine-transfer.ts` + rotas em `programs-scanner.ts`

| API (proposta) | Função |
|----------------|--------|
| `GET /api/machines` | Lista cadastro + teste rápido online |
| `GET /api/machines/:id/pattern-dirs` | Lista pastas em `/pattern/` |
| `GET /api/machines/:id/pattern-files?dir=` | Lista zips já na máquina (para apagar) |
| `GET /api/programs/zip-for-part?ref=&part=` | Acha zip local da parte |
| `DELETE /api/machines/:id/pattern-file` | Apaga zip remoto (ou comando Stoll — TBD) |
| `POST /api/machines/:id/upload` | Upload zip → pasta remota |
| `POST /api/machines/:id/replace` | Orquestra apagar + enviar (transação lógica) |

**Entregável:** enviar um zip teste para MAQ-12; operador abre na máquina via Knit LAN (sem pendrive).

### Fase 2 — Confiabilidade

- Histórico de envios (data, ref, parte, máquina, arquivo, resultado)
- Mapa referência → pasta remota
- Comparar zip local vs remoto (nome, tamanho, data)
- Aviso se CMS do zip ≠ CMS da máquina destino
- MAQ-01…15 no select (cadastro completo)

### Fase 3 — Ler / gravar programa (bidirecional)

- **Gravar:** PC → máquina (Carregar dados + EALL + zip) — herda Fase 1/2
- **Ler:** máquina → PC (Salvar dados → zip sin/jac/setx)
- Comparar zip **máquina vs local**
- MAQ-01…15 no cadastro
- Envio para **várias máquinas** (mesmo zip)

### Fase 4 — Reporte de turnos de trabalho (futuro)

Módulo separado, **depois** da comunicação estável com a máquina (Fases 1–3).

| Objetivo | Ler da rede o **reporte de turno** de cada máquina (MAQ-01…15) e consolidar no painel |
|----------|----------------------------------------------------------------------------------------|
| Base técnica | Mesma infra: IP `192.168.1.{n}`, protocolo Stoll/knitFTP, pastas FTP da máquina (`mmilog`, `savelog`, `tickets` — a mapear) |
| UI proposta | Aba **Turnos** ou seção em Desenv-Máquinas: máquina, período, peças/tecidos, paradas, operador |
| Relação com painel | Complementa Desenv-Controle (programação extra) e relatórios mensais de peças — foco **produção na máquina**, não retirada de estoque |

**Entregáveis (quando retomar):**

1. Descobrir formato do reporte de turno na CMS502 OKC (arquivo, FTP, ou “Salvar” M1)
2. API `GET /api/machines/:id/shift-report?from=&to=`
3. Tela de consulta + export PDF/planilha
4. (Opcional) histórico Firestore ou arquivo local por máquina/dia

**Dependências:** Fase B (protocolo online) ou leitura FTP dos logs da máquina.

---

## Visão do módulo Desenv-Máquinas (longo prazo)

```
Desenv-Máquinas
├── Enviar programa      (Fase 1–2)  ← agora
├── Salvar da máquina    (Fase 3)
├── Comparar local × máq (Fase 3)
└── Reporte de turnos    (Fase 4)    ← leitor produção
```

---

## Wireframe (MVP)

```
┌─────────────────────────────────────────────────────────────┐
│ Desenv-Máquinas                                             │
├─────────────────────────────────────────────────────────────┤
│ Máquina: [MAQ-12 ▼]  192.168.1.12  ● Online  FTP OK         │
├─────────────────────────────────────────────────────────────┤
│ Referência: [5455        ] [Carregar]                       │
│ Parte:      [CT-P-4 ▼]                                      │
├─────────────────────────────────────────────────────────────┤
│ Zip local:  CMS502.5455-TOP-CROCHE-LEIA-CT-P-4.zip          │
│             C:\...\5455-TOP-CROCHE-LEIA\...    [Procurar]   │
├─────────────────────────────────────────────────────────────┤
│ Pasta na máquina (pattern):                                 │
│   [5455-TOP-PONTO-CROCHE ▼]  ← sugerido por ref 5455        │
│   Apagar antes de enviar:                                   │
│   ☑ CMS502.5455-...-CT-P.zip  ☑ CMS502+....-FT-P.zip         │
├─────────────────────────────────────────────────────────────┤
│ [Testar conexão]  [Apagar + Enviar para MAQ-12]             │
├─────────────────────────────────────────────────────────────┤
│ Log: Apagado CMS502...CT-P.zip → Enviado ... → OK           │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquitetura técnica

```
Browser (Desenv-Maquinas)
    → proxy :3847
    → programs-scanner :3848
        → m1-machine-transfer.ts (FTP client)
            → ftp://192.168.1.12/pattern/...
        → programs-scanner (ref, partes, busca zip)
        → data/maquinas-rede.json
```

**Dependência nova (proposta):** cliente FTP Node (`basic-ftp`) — upload stream, listagem, mkdir se necessário.

**Segurança:** API só em `127.0.0.1`; FTP limitado à rede local da fábrica; sem expor credenciais (anônimo na LAN).

---

## Riscos e mitigação

| Risco | Mitigação |
|--------|-----------|
| Nome pasta remota ≠ pasta local | Match por ref + escolha manual (fase 1) |
| Zip não encontrado no PC | Mensagem clara + link mental “extrair no M1” |
| Sobrescrever zip sem apagar | Fluxo **apagar → enviar**; nunca só upload por cima |
| Apagar incompleto (só zip, índice na máquina) | Validar com teste M1plus; pode precisar protocolo Stoll |
| CMS502 vs CMS502+ | Ler prefixo do `.sin`; aviso se divergir da máquina |
| FTP anônimo desabilitado no futuro | Campo user/senha no cadastro da máquina |
| Máquina offline | Ping + disable botão Enviar |

---

## Perguntas em aberto (resolver na Fase 1)

1. **Como o M1plus apaga** o programa na máquina? (menu, sequência, só FTP ou comando extra?)
2. Apagar = **deletar `.zip`** ou também limpar pasta / `control` / `transfer`?
3. O zip fica **sempre** em alguma pasta fixa após processar, ou só após “Extrair” manual?
4. Nome remoto = **idêntico** ao zip local ou a máquina encurta (ex. `CT-P-4` → `CT-P`)?
5. Criar subpasta nova em `/pattern/` via FTP é permitido ou só escolher existente?
6. Após apagar + enviar, o programa **aparece direto** na Knit LAN ou precisa passo na máquina?

---

## Critério de sucesso (piloto)

- [x] Zip extraído na pasta do programa + enviado via M1 (MAQ-12)
- [x] EALL + programa carregado na máquina
- [ ] Mesmo fluxo iniciado **pelo painel** (Fase A ou B)
- [ ] Log no painel (caminho zip, máquina, horário, sucesso)

---

## Próximo passo

**Aprovar este escopo** → implementar **Fase 1** (aba + APIs + upload MAQ-12).

Estimativa Fase 1: 1 sessão de backend (FTP + busca zip) + 1 sessão de UI + teste na fábrica com MAQ-12.
