# Notas técnicas

Para quem mexe no código, publica a app ou quer saber onde é que as coisas vivem.
O manual para quem usa a app está no [README](../README.md).

## Correr localmente

Sem compilação e sem CDN — são ES modules servidos como estão. A única biblioteca externa é o
**Quagga2** (MIT), incluído localmente em `js/vendor/quagga.min.js` para ler códigos de barras.

```bash
node tools/serve.mjs                  # → http://127.0.0.1:4173/
node tools/serve.mjs <pasta> <porta>  # outras opções, por posição
```

Precisa de servidor (não funciona com `file://`) por causa dos módulos, do service worker e
do IndexedDB. Node 18+. O `tools/serve.mjs` escuta apenas em `127.0.0.1` e é HTTP: serve para
desenvolver no computador, não para instalar no telefone.

## Construir os pacotes

```bash
node tools/empacotar.mjs
```

| Saída | Para quê |
|---|---|
| `dist/site/` | pasta pronta a publicar |
| `dist/aura-v21.zip` | arrastar para um hosting estático |
| `dist/aura-v21.tar.gz` | copiar para um servidor / imagem Docker |
| `dist/BUILD.json` | versão + hash do conteúdo (para comparar builds) |

O script confirma primeiro que todos os ficheiros listados no `SHELL` do service worker
existem — um deploy com um ficheiro em falta falha aqui, não no telefone. No fim compara o
build com o `dist/BUILD.json` anterior e avisa se os ficheiros mudaram sem o `VERSAO` subir:

```
⚠  Os ficheiros mudaram mas o VERSAO continua aura-v21.
   Quem já tem a app instalada não recebe esta alteração — avance o VERSAO em sw.js.
```

## Pôr online

Todas as opções servem a mesma pasta: a app usa caminhos relativos, por isso também funciona
numa subpasta (caso do GitHub Pages de projeto).

* **Netlify Drop** — [app.netlify.com/drop](https://app.netlify.com/drop) → arrastar
  `dist/site` (ou o `.zip`). Dá um endereço `https://…netlify.app` em segundos. Conta gratuita.
* **Cloudflare Pages** — *Create a project → Direct upload* → `dist/site`. Domínio
  `https://…pages.dev`, com CDN.
* **GitHub Pages** — este repositório inclui `.github/workflows/publicar.yml`. Basta
  *Settings → Pages → Source: GitHub Actions*; cada push para `main` reconstrói e publica em
  `https://<utilizador>.github.io/<repositório>/`.
* **Servidor próprio / NAS** — `docker compose up -d --build` e abrir em `http://…:8080`.
  Para o iPhone, pôr um certificado à frente (Caddy, Traefik ou Cloudflare Tunnel): sem HTTPS
  o Safari não instala.
* **Só para experimentar hoje** — `cloudflared tunnel --url http://127.0.0.1:4173` com o
  `node tools/serve.mjs` a correr. O endereço é temporário e muda a cada arranque.

O iOS só instala aplicações web a partir de **HTTPS público**, e só no **Safari**:
`127.0.0.1` não chega ao telefone e `http://192.168.x.x` não é contexto seguro.

### Porque não há `.ipa` nem App Store

Isto é uma PWA, não uma app nativa. Para a App Store seria preciso empacotar com Capacitor,
Xcode e uma conta Apple Developer (99 USD/ano) — e o resultado seria a mesma app com um
WebView à volta. O `Dockerfile` e o `deploy/nginx.conf` existem para alojar a PWA; não
produzem um binário iOS.

## Estrutura

```
index.html            casca: topbar, #view, tab bar, definições de iOS/manifest
manifest.webmanifest  nome, ícones, atalhos, standalone
sw.js                 service worker (VERSAO + 3 estratégias de cache)
styles/app.css        tema escuro, cartões, deslizadores, tab bar
styles/print.css      folha de estilo de impressão (media="print")
js/app.js             router de abas, pill de clima, folha de Definições
js/nav.js             rota "#tab/sub" + re-render
js/store.js           IndexedDB + definições + exportar/importar/apagar
js/weather.js         Open-Meteo: série de pressão, cache, risco, geocodificação
js/clima.js           estado do clima partilhado pelos ecrãs
js/charts.js          SVG desenhados à mão: linhas, barras, dispersão, bandas
js/health-import.js   export.xml do Saúde + CSV do Garmin, com pré-visualização
js/alimentos.js       Open Food Facts, cache de produtos e alimentos personalizados
js/alimentos-comuns.js tabela local de alimentos comuns (pesquisa offline)
js/nutricao.js        grupos alimentares, análise dos últimos 7 dias e aviso semanal
js/scanner.js         leitura de códigos de barras com a câmara (Quagga2)
js/vendor/quagga.min.js  Quagga2 1.8.4 (MIT), leitor EAN/UPC local
js/intervals.js       Garmin automático: API do Intervals.icu e regras de fusão
js/instalar.js        instalação no ecrã principal (Safari/iOS e Chrome/Android)
js/cofre.js           cópia encriptada .aura (PBKDF2 + AES-GCM) e lembrete de cópia
js/seed.js            dados de exemplo determinísticos (45 dias)
js/screens/           dashboard, sintomas, farmacia, relatórios, comida e folhas de ação
tools/serve.mjs       servidor estático para desenvolvimento
tools/empacotar.mjs   gera dist/site + .zip + .tar.gz (sem dependências)
tools/check-imports.mjs   verifica se todas as importações resolvem
tools/mkicon.mjs      desenha e gera os ícones PNG da PWA (sem dependências)
tools/fixtures/       ficheiros de exemplo para testar importações
deploy/nginx.conf     cache e tipos MIME para servir a app
Dockerfile            imagem nginx (docker compose up -d --build)
.github/workflows/    publicação automática no GitHub Pages
```

## Dados

Esquema espelho 1:1 do SwiftData do plano: `RegistoDiario` (chave = data, com hidratação,
estado, notas e `afrontamentos`), `RegistoEnxaqueca`, `RegistoFezes`, `ItemMedicacao`, mais
`TomaMedicacao`, `Refeicao` (com `itens` de alimentos e total em `calorias`), `AlimentoCache`
(produtos do Open Food Facts já consultados), `AlimentoCustom` (alimentos criados pelo
utilizador e pratos compostos, com `tipo: 'prato'`), `PressaoCache` e `Meta`.

Cada item de refeição guarda `grupoAnalise` (o grupo usado no resumo alimentar) e, nos pratos,
`composicao` com as frações dos ingredientes. A análise em `js/nutricao.js` usa esses dados;
alimentos antigos sem grupo são classificados por nome. O resumo compara a média dos dias com
refeições com referências genéricas (hortícolas, fruta, cereais, proteínas, laticínios, gorduras
e doces/processados) e só alerta com pelo menos 3 dias e 50% dos alimentos classificados.

Tudo vive em **IndexedDB**, na origem (esquema + domínio + porta) onde a app corre. Não há
servidor, conta, analítica nem sincronização entre dispositivos. Os únicos pedidos de rede são
ao **Open-Meteo**, com as coordenadas escolhidas em Definições, ao **Open Food Facts** quando se
procura um alimento ou se lê um código (sem dados pessoais), e — só com o Garmin ligado — ao
**Intervals.icu**.

`exportarTudo()` inclui todas as lojas, exceto a linha `meta/intervals` (a chave da API) e a
`alimentoCache` (cache descartável). Os alimentos personalizados entram, porque são dados do
utilizador. O `importarTudo()` usado pelo "Restaurar cópia" limpa as lojas e escreve o conteúdo
do ficheiro: uma restauração substitui os dados atuais, não faz fusão. A chave do Intervals.icu
existente no aparelho é lida antes da limpeza e reposta no fim, para restaurar uma cópia não
desligar o Garmin.

`limparDadosPessoais()` apaga registos diários, crises, fezes, tomas e refeições; mantém a base
de medicação, os alimentos personalizados, as definições e a cache de clima.

`semearMedicacaoComum()` corre no arranque e adiciona uma vez as sugestões que ainda não existam
na farmácia: a lista de crise/SOS (v19), depois os exemplos crónicos e os suplementos (v20). As
marcas `meta/medicacaoEnxaquecaSemeada` e `meta/medicacaoSugeridaV2` impedem que voltem depois de
apagadas. Cada item tem `grupo` (`Crise / SOS`, `Crónicos / prevenção`, `Vitaminas e minerais`,
`Ómega 3`, `Outros suplementos` ou `Outros medicamentos`), `sos` e, quando o utilizador escolhe,
`favorito`. Os favoritos aparecem no topo da farmácia e primeiro na lista SOS.

### Cópia encriptada (`.aura`)

`js/cofre.js` exporta o mesmo payload de `exportarTudo()` num envelope JSON cifrado:

```json
{
  "app": "Aura Health Journal",
  "formato": "aura-cofre",
  "versao": 1,
  "criadoEm": "2026-11-06T...",
  "kdf":   { "nome": "PBKDF2-SHA256", "iteracoes": 600000, "salt": "<base64>" },
  "cifra": { "nome": "AES-GCM-256", "iv": "<base64>" },
  "dados": "<base64 do ciphertext>"
}
```

* Chave derivada da passphrase com **PBKDF2-SHA256, 600 000 iterações**, salt de 16 bytes.
* Cifra **AES-256-GCM** com IV de 12 bytes; o cabeçalho (`formato|versao|kdf|iteracoes|salt`) é
  `additionalData`, pelo que alterar parâmetros invalida a decifra em vez de produzir lixo.
* A passphrase é normalizada (NFKC + trim), exige **8 caracteres** e **nunca é guardada** — não há
  recuperação. O import valida `formato`, `versao` e o intervalo de iterações (100 000–2 000 000).
* O ficheiro é entregue por download; no iOS usa `navigator.share({ files })` para "Guardar em
  Ficheiros". O restore usa `<input type="file" accept=".aura">` e substitui tudo, tal como o JSON.

Definições novas em `DEFAULT_SETTINGS`: `ultimaCopia` (ISO da última exportação, JSON ou `.aura`)
e `copiaAdiada` (ISO até quando o lembrete fica escondido). O lembrete aparece ao fim de
**14 dias** sem cópia, só se houver **≥ 2 dias com registos nos últimos 30**; "Agora não" adia
**7 dias**.

### Fusão de origens

Cada campo do dia guarda a sua origem (`healthkit`, `garmin`, `manual`, `open-meteo`,
`exemplo`). As regras não são todas iguais:

* **Garmin automático** — `podeEscrever()` só deixa escrever num campo vazio ou cuja origem já
  seja `garmin`. Um valor do Apple Saúde, um exemplo ou um valor escrito à mão nunca é
  substituído por uma sincronização.
* **Importação por ficheiro** (Apple Saúde / CSV) — é explícita e aplica os campos que o
  ficheiro traz para os dias correspondentes, mesmo que já exista um valor. O pré-visualizador
  mostra o que vai entrar antes de gravar.
* **Sono** — é sempre atribuído ao dia em que a pessoa acordou.
* **Limite** — datas fora dos últimos 400 dias são ignoradas na importação.

## Câmara, códigos de barras e Open Food Facts

* `js/scanner.js` carrega `js/vendor/quagga.min.js` (Quagga2 1.8.4, MIT) só quando é preciso.
  O ficheiro está no `SHELL` e fica em cache para funcionar offline.
* `getUserMedia` só existe em **HTTPS** ou localhost. No iPhone, a autorização da câmara pode
  voltar a ser pedida depois de fechar a PWA; se a câmara falhar, o campo para escrever os
  8–14 dígitos do código está sempre disponível.
* `js/alimentos.js` usa a API v2 do Open Food Facts (`/api/v2/product/...` e `/api/v2/search`),
  com timeout de 8 s. Só o texto da pesquisa/código sai do dispositivo; não há dados pessoais.
* Produtos consultados ficam em `alimentoCache` (não entra nas cópias). Os alimentos
  personalizados ficam em `alimentoCustom` e entram no JSON exportado.
* Os valores do Open Food Facts são colaborativos. A UI mostra a fonte, permite corrigir a
  quantidade e introduzir calorias à mão; a tabela local (`alimentos-comuns.js`) é aproximada.

## Service worker e versões

O service worker serve o shell **cache-first**: um ficheiro acabado de editar pode ser servido
velho. Ao testar localmente, ou se ativa *Disable cache* nas DevTools, ou limpa tudo:

```js
// consola do browser
const rs = await navigator.serviceWorker.getRegistrations();
for (const r of rs) await r.unregister();
for (const c of await caches.keys()) await caches.delete(c);
location.reload();
```

Ao mexer em qualquer ficheiro do `SHELL` de `sw.js`, avança `VERSAO` (`aura-v21` agora) para
que as instalações existentes revalidem de uma vez. A app mostra "Nova versão disponível — a
atualizar…" e recarrega sozinha quando o novo worker ativa.

## Verificações usadas no projeto

```bash
node tools/check-imports.mjs              # importações coerentes
node --check js/ficheiro.js               # sintaxe
node tools/serve.mjs                      # http://127.0.0.1:4173/
node tools/empacotar.mjs                  # pacotes em dist/
```

Para uma pré-visualização sem dados próprios, Definições → **Carregar dados de exemplo**
insere 45 dias determinísticos (marcados como `exemplo`, sem apagar registos manuais);
**Apagar registos** limpa-os.

Em `tools/fixtures/` há exemplos de cada formato — inclusive um `peso-libras.csv` em unidades
imperiais e um `export-exemplo.xml` — para testar a importação sem dados pessoais.
