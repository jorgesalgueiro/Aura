# Aura Health Journal

Diário de saúde para **enxaquecas + pressão atmosférica**, construído a partir do plano
[*Ecrãs e Arquitetura — iOS Health Journal*](../Ecr%C3%A3s%20e%20Arquitetura%20-%20iOS%20Health%20Journal.pdf).
É uma **web app que se instala no telemóvel como PWA** — no iPhone pelo Safari, no Android pelo
Chrome: abre em ecrã inteiro, tem tab bar própria, funciona offline e guarda tudo no dispositivo.

Registos em menos de 5 segundos: quatro abas, deslizadores para intensidade, um toque
para marcar medicação, temporizador de crise a contar desde o primeiro toque.

---

## Correr a app

Sem compilação, sem dependências, sem CDN — são ES modules servidos como estão:

```bash
node tools/serve.mjs                # → http://127.0.0.1:4173/
node tools/serve.mjs <pasta> <porta>   # outras opções, por posição
```

Precisa de servidor (não funciona com `file://`) por causa dos módulos, do service worker
e do IndexedDB. Qualquer outro estático serve; este existe só para não haver que instalar nada.
Node 18+. O `tools/serve.mjs` escuta apenas em `127.0.0.1` e é HTTP — serve para desenvolver
no computador.

## Publicar e instalar

O iOS só instala aplicações web a partir de **HTTPS público**, e só no **Safari**. Não há
loja, conta Apple nem assinatura: é só alojar a pasta e adicionar ao ecrã principal. O
`127.0.0.1` do computador não chega ao telefone, e um `http://192.168.x.x` da rede local
não é contexto seguro.

### 1 · Construir os pacotes

```bash
node tools/empacotar.mjs
```

Produz:

| Saída | Para quê |
|---|---|
| `dist/site/` | pasta pronta a publicar |
| `dist/aura-v11.zip` | arrastar para um hosting estático |
| `dist/aura-v11.tar.gz` | copiar para um servidor |

O script confirma primeiro que todos os ficheiros listados no `SHELL` do service worker
existem — um deploy com um ficheiro em falta falha aqui, não no telefone.

### 2 · Pôr online (escolha uma)

* **Netlify Drop** — [app.netlify.com/drop](https://app.netlify.com/drop) → arraste
  `dist/site` (ou o `.zip`). Dá um endereço `https://…netlify.app` em segundos. Conta
  gratuita.
* **Cloudflare Pages** — *Create a project → Direct upload* → `dist/site`. Domínio
  `https://…pages.dev`, com CDN.
* **GitHub Pages** — o repositório inclui `.github/workflows/publicar.yml`; basta
  *Settings → Pages → Source: GitHub Actions*. Cada push para `main` reconstrói e publica
  em `https://<utilizador>.github.io/<repositório>/`.
* **Servidor próprio / NAS** — `docker compose up -d --build` e abrir em `http://…:8080`.
  Para o iPhone, ponha um certificado à frente (Caddy, Traefik ou Cloudflare Tunnel):
  sem HTTPS o Safari não instala.
* **Só para experimentar hoje** — `cloudflared tunnel --url http://127.0.0.1:4173` com o
  `node tools/serve.mjs` a correr. O endereço é temporário e muda a cada arranque.

Todas as opções servem a mesma pasta: a app usa caminhos relativos, por isso também
funciona numa subpasta (caso do GitHub Pages de projeto).

### 3 · Instalar no iPhone / iPad

1. Abra o endereço no **Safari** (o Chrome e o Firefox no iOS não instalam aplicações web).
2. Toque em **Partilhar** — o quadrado com a seta para cima.
3. **Adicionar ao Ecrã Principal** → **Adicionar**.

Dentro da app, o cartão **Instalar o Aura** no Dashboard e o botão em
Definições → Aplicação mostram estes mesmos passos (no Android há um botão de um toque).

Depois de instalada abre sem ligação: o shell vem da cache do service worker e o barómetro
mostra a última leitura real guardada. Os dados continuam no IndexedDB — apagar o ícone
**não** apaga registos; para isso é Definições → Apagar registos.

### 4 · Instalar no Android

No **Chrome** (ou Edge): abrir o endereço → menu **⋮** → **Instalar aplicação**. A app
oferece um botão *Instalar agora* quando o browser expõe `beforeinstallprompt`. Premir
longamente o ícone dá os atalhos *Iniciar crise*, *Beber água* e *Relatórios* (o iOS ainda
não suporta `shortcuts` do manifest — lá, os atalhos estão dentro da app).

### Sem lojas

Isto é uma PWA, não uma app nativa: não há `.ipa`, `.apk` nem App Store. Para publicar na
App Store seria preciso empacotar com Capacitor, Xcode e uma conta Apple Developer
(99 USD/ano) — e o resultado seria a mesma app, com um WebView à volta.

## Os seus dados

Tudo vive em **IndexedDB neste dispositivo** (`js/store.js`). Não há servidor, conta,
analítica nem sincronização. Os únicos pedidos de rede são ao **Open-Meteo**, com as
coordenadas que escolher em Definições, e — só se ligar o Garmin — ao **Intervals.icu**
(ver abaixo).

| | |
|---|---|
| Ver / levar tudo | Definições → **Exportar cópia** (JSON com todos os registos) |
| Trazer de volta | Definições → **Restaurar cópia** |
| Apagar | Definições → **Apagar registos** (pede confirmação; mantém a lista de medicação) |

No iOS, o **modo de navegação privada bloqueia o IndexedDB** — use uma janela normal.

## O que é real, e o que o iOS não deixa

* **Pressão atmosférica: real.** Série horária de 45–90 dias do Open-Meteo — previsão para os
  dias recentes e arquivo histórico para completar os 90 dias — com cache de 15 min. Sem rede,
  a app usa a última leitura boa guardada e avisa que o valor pode estar desatualizado. É isto
  que alimenta o barómetro, o risco meteorológico e todas as correlações.
* **Sono, peso, passos, calorias, HRV: reais, por importação ou automáticos.** Uma PWA no
  iOS **não consegue ler o HealthKit** nem o Garmin Connect directamente. A app aceita o
  export oficial de cada serviço (ver abaixo) ou, com o Garmin, sincroniza sozinha através
  do Intervals.icu. A camada de dados não depende do meio: um wrapper nativo mais tarde
  não muda nenhum ecrã.
* **Widgets nativos do plano** (WidgetKit) e o **feedback háptico** dos deslizadores não existem
  em PWA no iOS — o iOS não expõe nem a API de widgets nem a `vibration`. A app mantém o
  háptico onde ele existe (Android/desktop) e mostra os números do dia no topo do Dashboard,
  que é o papel que o widget teria.

## Importar do Apple Saúde e do Garmin Connect

Definições → **Importar Saúde / Garmin** aceita:

* **Apple Saúde** — `export.xml` (ou o texto colado). Reconhece peso, passos, calorias ativas,
  sono (as fases) e HRV.
  *No iPhone: app Saúde → perfil → **Exportar todos os dados** → aguarde → na app **Ficheiros**
  descomprima o `Archive.zip` → escolha o `export.xml`.*
* **Garmin Connect** — qualquer CSV exportado, com cabeçalhos em inglês ou português:
  `Steps.csv`, `Weight.csv`, `Sleep.csv`, `Heart Rate Variability.csv`… As colunas que a app
  não sabe usar são listadas no pré-visualizador, nada é inventado.

Cada campo importado guarda a sua **proveniência** (`__src`): um registo escrito à mão nunca é
substituído silenciosamente por um ficheiro, e vice-versa. O pré-visualizador mostra sempre
quantos dias e que campos vão entrar antes de aplicar.

Em `tools/fixtures/` há exemplos de cada formato — inclusive um `peso-libras.csv` em unidades
imperiais e um `export-exemplo.xml` — para testar a importação sem dados pessoais.

## Garmin automático (via Intervals.icu)

O Garmin Connect não fala directamente com uma PWA: isso exigiria um servidor e um segredo
de OAuth. A ponte usada é o **Intervals.icu**, que tem a integração oficial com o Garmin e
uma API com **CORS aberto ao origin** — a app chama-a do próprio browser, sem backend, e
funciona igual no Safari do iPhone e no Chrome do Android.

**Ligar (uma vez):**

1. Criar a conta gratuita em [intervals.icu](https://intervals.icu).
2. **Definições → Garmin Connect** → ligar a conta e activar **Download wellness data**
   (e *Import all Garmin data* para trazer o histórico).
3. No fim das Definições, **Developer Settings** → copiar a **API key**.
4. Aura → Definições → **Garmin · automático** → colar a chave → **Ligar**.

Depois disso a app sincroniza ao abrir, ao voltar ao primeiro plano e no *pull-to-refresh*,
no máximo de 20 em 20 minutos (**Sincronizar agora** força). Entram **sono, VFC, passos,
peso** e as **calorias das actividades**.

Regras do sync:

* **Só preenche o que está vazio.** Um valor escrito à mão — ou vindo do Apple Saúde — nunca
  é substituído. Só se actualiza o que já tinha vindo de uma sincronização anterior do
  Garmin (por exemplo, um sono que o relógio corrigiu depois).
* O sono é atribuído **ao dia em que acordou**, como na importação por CSV.
* A chave é validada contra o Intervals.icu **antes** de ser guardada. Fica em IndexedDB,
  só é enviada para `intervals.icu`, **não entra no Exportar cópia** e é apagada quando
  desliga.
* O Intervals.icu limita pedidos; a app respeita o `Retry-After` e diz quanto falta esperar.
* A Garmin mudou os termos em Outubro de 2026 e o Intervals.icu avisou que poderá ter de
  limitar o acesso a dados Garmin pela API. Se isso acontecer, a importação por CSV
  continua a funcionar.

## Ecrãs

| Rota | Ecrã do plano | O que faz |
|---|---|---|
| `#dashboard` | 1 · Dashboard Diário | Sono, peso, passos, calorias ativas; barómetro (temperatura + hPa) e risco meteorológico; atalhos de água, medicação, crise e refeição |
| `#sintomas/diario` | Diário do dia | Seletor de data e cronologia do dia; notas e ações rápidas (água, medicação, digestivo, refeição) aplicadas **ao dia escolhido** |
| `#sintomas/enxaquecas` | 2 · Enxaquecas | **Iniciar Crise** com temporizador; mapa interativo da cabeça (Frontal, Laterais, Occipital, Ocular); intensidade 1–10; gatilhos; medicação SOS à hora exata; variação de pressão nas 6 h anteriores. Toque numa crise antiga para a **editar** sem criar duplicado |
| `#sintomas/digestivo` | 3 · Digestivo/Sintomas | Escala de Bristol 1–7 com pictogramas e hora; hemorroides (desconforto 1–10 + sangramento); afrontamentos com intensidade, hora e notas; doenças pontuais (Gripe, Dores de Costas, Febre, Cansaço Extremo, Náuseas, Tontura, Insónia, Alergia) |
| `#sintomas/estado` | 5 · Estado Geral e Stress | Seletor de dia; energia e stress em dois deslizadores 1–10 + notas livres |
| `#farmacia/farmacia` | 4 · Farmácia | Medicação criada por si, marcar a toma com um toque no horário |
| `#farmacia/agua` | 4 · Água | Contador com objetivo e incremento personalizáveis (250 ml por omissão) |
| `#farmacia/comida` | 4 · Nutrição | Refeições por texto, com hora; preparado para uma API de calorias |
| `#relatorios` | 6 · Relatórios e Análise | Correlação pressão × crises, crises por banda de pressão, variação nas 6 h anteriores, comparar duas variáveis, dispersão pressão no início × intensidade, gatilhos e zonas da cabeça; **PDF para o médico** |

Teclas `1`–`4` mudam de aba no computador.

## Relatório em PDF

Em `#relatorios` → **Preparar PDF para o médico** abre um resumo e chama a pré-visualização de
impressão. `styles/print.css` troca o tema escuro por papel branco, esconde a barra de
navegação, põe cabeçalho com o nome da app e o intervalo de datas, e força os títulos de
gradiente a tinta sólida para saírem legíveis. Escolha **Guardar como PDF** na pré-visualização.

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
js/intervals.js       Garmin automático: API do Intervals.icu e regras de fusão
js/instalar.js        instalação no ecrã principal (Safari/iOS e Chrome/Android)
js/seed.js            dados de exemplo determinísticos (45 dias)
js/screens/           dashboard, sintomas, farmacia, relatórios, folhas de ação
tools/serve.mjs       servidor estático para desenvolvimento
tools/empacotar.mjs   gera dist/site + .zip + .tar.gz (sem dependências)
tools/check-imports.mjs   verifica se todas as importações resolvem
tools/mkicon.mjs      desenha e gera os ícones PNG da PWA (sem dependências)
tools/fixtures/       ficheiros de exemplo para testar importações
deploy/nginx.conf     cache e tipos MIME para servir a app
Dockerfile            imagem nginx (docker compose up -d --build)
.github/workflows/    publicação automática no GitHub Pages
```

Esquema de dados — espelho 1:1 do SwiftData do plano: `RegistoDiario` (chave = data, com
hidratação, estado, notas e `afrontamentos`), `RegistoEnxaqueca`, `RegistoFezes`,
`ItemMedicacao`, mais `TomaMedicacao`, `Refeicao`, `PressaoCache` e `Meta`.

## Desenvolvimento

O service worker serve o shell **cache-first**: um ficheiro acabado de editar pode ser servido
velho. Ao testar localmente, ou active *Disable cache* nas DevTools, ou limpe tudo:

```js
// consola do browser
const rs = await navigator.serviceWorker.getRegistrations();
for (const r of rs) await r.unregister();
for (const c of await caches.keys()) await caches.delete(c);
location.reload();
```

Ao mexer em qualquer ficheiro do `SHELL` de `sw.js`, avance `VERSAO` (`aura-v11` agora) para que
as instalações existentes revalidem de uma vez.

Verificações usadas no projeto:

```bash
node tools/check-imports.mjs              # importações coerentes
node --check js/ficheiro.js               # sintaxe
node tools/serve.mjs                      # http://127.0.0.1:4173/
node tools/empacotar.mjs                  # pacotes em dist/
```

Para uma pré-visualização rápida sem dados próprios, Definições → **Carregar dados de exemplo**
insere 45 dias determinísticos; **Apagar registos** limpa-os.
