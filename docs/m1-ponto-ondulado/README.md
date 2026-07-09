# Ponto ondulado / rendado — referência M1 Plus

Salvo em 09/07/2026 para retomar depois.

## Resultado

- Referência original (pano azul): `01-referencia-original-azul.png`
- Resultado aceitável (corpo): `02-resultado-aceito-corpo.png`
- Resultado aceitável (barra/bicos): `03-resultado-aceito-barra.png`
- Módulo M1 que funcionou (vista de símbolos): `04-modulo-m1-vista-simbolos.png`
- Tentativa da IA que deu errado (tela diagonal): `05-tentativa-ia-errada-tela.png`

## O que funcionou (módulo humano)

Lógica real no M1 — **não** é Feather and Fan com miss no vale.

1. **Bloco troca frente/trás** (largura cheia)
   - alça frente
   - seta transfer F→T (`U 0`)
   - alça atrás
   - seta transfer T→F (`U 0`)

2. **Bloco deslocamento** (faz a onda)
   - setas diagonais com variador
   - coluna **U**: `R1`, `R2`, `L1` (e variações)
   - desenho abre em **V / zigue-zague** no meio do módulo

3. O bloco se **repete** várias vezes (~53 fileiras no módulo salvo)

## Regras do M1 (aprendidas nesta sessão)

- **Alça** = malha. **Seta** = só transferência. Nunca misturar.
- Coluna **U** (variador) desloca a **frontura inteira** → sentidos diferentes = passadas separadas.
- Nas fileiras de **malha**, o guia-fio percorre a extensão: não deixar buraco onde ele tricota (flutuação).
- Tentativa “vale miss / crista YO” gerou **tela diagonal** — descartada.

## Status

Aceitável, ainda não idêntico à referência azul. Próximo passo (quando retomar): refinar o bloco de deslocamento / rapport para aproximar da foto original.
