# Rascunho — controle de prioridades de desenvolvimento

Documento de ideias para uma parte nova no **mesmo programa** (Estoque de Peças). Ainda não é escopo fechado: o patrão e a patroa já usam o quadro da tecelagem para ver o chão de fábrica; esta tela entra depois, aos poucos.

Anotado em set/2026 a partir das diretrizes iniciais.

---

## Objetivo

Uma tela para **acompanhar e priorizar os desenvolvimentos** (modelos novos), em vez de só cadastrar ficha técnica no **Desenv-Cadastro**.

Eles precisam:

1. Cadastrar o desenvolvimento **direto no nosso programa**
2. **Editar prioridades** (quem entra primeiro na fila)
3. Marcar **onde aquele modelo está agora**
4. Quando estiver na hora, **enviar o modelo para o Syntech** (mesmo espírito do botão do cadastro de produto)

---

## Situação hoje

| O que já existe | O que falta |
|-----------------|-------------|
| **Desenv-Cadastro** — ficha, fios, PDF, push para o Syntech | Fila de prioridade dos desenvolvimentos |
| Quadro da tecelagem — chão de fábrica (produção) | Visão do **pipeline de amostra / modelo novo** |
| Syntech — ERP; referência de produto (`COD_PROD`) | Cadastro do desenvolvimento **antes** de ir para o Syntech |

O Syntech continua sendo o ERP. O painel vira o lugar onde o desenvolvimento nasce, anda pelas etapas e só então vira produto no Syntech.

---

## Etapas do modelo (status)

Uma opção de controle para marcar em que ponto o modelo está:

1. Ainda esperando a ficha de desenvolvimento
2. No setor de modelagem, esperando o molde
3. Na programação
4. Pronto para costura e acabamento
5. Enviado para o cliente

A lista pode crescer; a ideia é um status único, visível na fila.

---

## Prioridade

- A fila precisa ser **editável**.
- Ainda não está definido se é número, arrastar na tela, ou os dois.
- Quem mexe: a definir (programação, patrão/patroa, os dois).

---

## Cadastro no nosso programa

O desenvolvimento entra primeiro aqui, não só no Syntech.

Ainda não está fechado o que vai no cadastro além do essencial (nome/modelo, cliente, prioridade, status). O **Desenv-Cadastro** já cuida da ficha técnica e dos fios quando o modelo chegar nessa fase.

---

## Enviar para o Syntech

Botão no mesmo espírito do cadastro de produto: **enviar para o Syntech**.

Comportamento combinado:

- O modelo **cadastra sozinho** no Syntech.
- Usa a **próxima referência livre**.
- Lê até onde o Syntech parou (`COD_PROD` / numeração atual) e **segue daquele número em diante**.

Não inventar referência na mão se o Syntech já tiver a sequência.

---

## Fora desta anotação (ainda sem diretriz)

- Campos exatos do cadastro (cliente, foto, prazo, responsável…)
- Quem pode editar prioridade e status
- Se a tela é lista, kanban por etapa, ou os dois
- Relação com o **Desenv-Cadastro** (é a mesma ficha ou uma fila à parte que depois abre o cadastro)
- Se o quadro da tecelagem mostra desenvolvimento em máquina (hoje “Desenvolvimento” já existe como motivo de parada no Syntech)

---

## Próximo passo

Completar estas diretrizes e só então implementar. Não misturar com o Painel Tecelagem da TV/celular até isso estar combinado.
