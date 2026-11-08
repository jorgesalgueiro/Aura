# Aura Health Journal

Um diário de saúde para quem tem enxaquecas — e para perceber se o tempo tem alguma coisa a
ver com isso.

Registas o que te apetece registar (dor, medicação, água, digestivo, comida, energia), a app
guarda tudo no telemóvel e cruza com a **pressão atmosférica real** da tua localidade. No fim,
mostra gráficos e um PDF para levares à consulta.

**Em 30 segundos:**

* Não há conta, login nem subscrição. Abres e usas.
* Instala-se no iPhone, no Android e no computador — fica com ícone e abre em ecrã inteiro.
* Funciona sem internet. As leituras de clima são a única coisa que precisa de rede.
* **Os dados não saem do teu aparelho.** Não há servidor, nem analítica, nem sincronização.

> Manual técnico (publicar, construir, mexer no código): [docs/tecnico.md](docs/tecnico.md).

---

## Índice

* [Instalar](#instalar)
* [Primeira vez](#primeira-vez)
* [Como usar](#como-usar)
  * [Dashboard](#dashboard)
  * [Sintomas](#sintomas)
  * [Farmácia](#farmácia)
  * [Relatórios](#relatórios)
* [De onde vêm os números](#de-onde-vêm-os-números)
* [Os teus dados](#os-teus-dados)
* [Sem internet e atualizações](#sem-internet-e-atualizações)
* [Limites honestos](#limites-honestos)
* [Se algo não funciona](#se-algo-não-funciona)
* [Definições, campo a campo](#definições-campo-a-campo)
* [Atalhos](#atalhos)
* [Para quem mexe no código](#para-quem-mexe-no-código)

---

## Instalar

A app é uma **PWA**: um site que se instala como aplicação. Não há App Store, não há `.ipa`
nem `.apk`, e não precisas de conta Apple nem Google.

Precisas de um endereço `https://` público — é o mesmo que estás a usar para ler isto. (Se
ainda não houver um, quem publica tem os passos em [docs/tecnico.md](docs/tecnico.md).)

### iPhone / iPad

O iOS só instala a partir do **Safari**. O Chrome e o Firefox no iPhone não conseguem.

1. Abre o endereço no **Safari**.
2. Toca em **Partilhar** — o quadrado com a seta para cima, na barra de baixo.
3. Desliza a lista e escolhe **Adicionar ao Ecrã Principal**.
4. Confirma em **Adicionar**.

Ficas com o ícone do Aura no ecrã principal. Abre em ecrã inteiro, sem barra de endereço.

> Se a opção não aparecer: garante que estás num separador normal do Safari (não numa
> pré-visualização de link) e que a página começa por `https://`. Fecha e reabre num separador
> novo, se for preciso.

### Android

1. Abre o endereço no **Chrome** (ou Edge).
2. Menu **⋮** → **Instalar aplicação**.
3. Confirma.

Em muitos telemóveis aparece um botão **Instalar agora** dentro da própria app, que faz o
mesmo sem passar pelo menu.

### Computador

Não é obrigatório. No Chrome e no Edge aparece um ícone de instalação na barra de endereço, se
quiseres uma janela própria. Numa aba normal funciona exatamente igual.

### O que muda depois de instalar

| | |
|---|---|
| Ícone no ecrã principal | sim |
| Ecrã inteiro, sem barra do browser | sim |
| Funciona offline | sim |
| Dados movidos para outro sítio | **não** — continuam os mesmos |
| Precisa de loja ou conta | não |

Instalar não envia nada para lado nenhum e não apaga registos. É só um atalho para o mesmo
site, a correr em modo aplicação.

Dentro da app, o cartão **Instalar o Aura** no Dashboard (em telemóvel) e o botão em
**Definições → Aplicação** mostram estes passos. Se disseres "Agora não", o cartão desaparece;
o botão nas Definições continua disponível.

---

## Primeira vez

São dois minutos, e só duas coisas são mesmo necessárias:

1. **Nome (opcional)** — aparece na saudação do Dashboard.
2. **Localidade** — abre **Definições** (roda no canto superior direito) e escreve a cidade em
   *Localização para o clima*. Toca em **Procurar** e escolhe o resultado certo, ou usa
   **Usar GPS**. Sem isto, o clima fica em Lisboa por omissão.

No mesmo sítio podes ajustar o **objetivo de água** (2000 ml por omissão) e o **tamanho do
copo** (250 ml). Carrega em **Guardar**.

Depois, escolhe uma destas:

* **Começar a sério** — fecha as Definições e usa o Dashboard. Os gráficos ganham forma ao fim
  de uns dias.
* **Ver como fica primeiro** — **Definições → Carregar dados de exemplo** cria 45 dias de
  registos fictícios coerentes com o clima. Quando te fartares, **Apagar registos** limpa-os.
  Os exemplos nunca passam por cima de registos teus.

Se usares Garmin, vale a pena ligar já: [Garmin automático](#garmin-automático).

---

## Como usar

A app tem quatro abas, sempre no fundo do ecrã:

| Aba | Para quê |
|---|---|
| **Dashboard** | o resumo de hoje e os registos de um toque |
| **Sintomas** | o diário, as crises, o digestivo e o estado geral |
| **Farmácia** | medicação, água e alimentação |
| **Relatórios** | correlações com o tempo e PDF para o médico |

No topo, a pastilha do clima mostra a temperatura, a pressão e o estado do tempo. Toca nela
para forçar uma atualização. A roda à direita abre as Definições.

### Dashboard

É a primeira coisa que vês, pensada para responder em dois segundos a "como estou hoje?".

* **Cabeçalho** — data, saudação com o teu nome e o resumo das crises dos últimos 7 dias.
* **Crise em curso** — se houver uma, aparece logo abaixo um cartão com o cronómetro a andar,
  a intensidade e as zonas. Tem **Editar** e **Terminar**.
* **Registo rápido** — seis botões que evitam andar à procura:

| Botão | O que faz |
|---|---|
| **Água** | abre o contador e soma copos |
| **Medicação** | marca tomas de hoje com um toque |
| **Iniciar crise** | abre a folha da crise (o cronómetro começa ao gravar) |
| **Registo digestivo** | escala de Bristol + hemorroidas |
| **Refeição** | texto, calorias e fotografia |
| **Energia e stress** | leva-te aos dois deslizadores do dia |

* **Barómetro atmosférico** — pressão ao nível do mar em hPa, variação das últimas 6 horas e um
  gráfico das últimas 30 horas. À direita, temperatura, sensação e humidade. A etiqueta de
  risco resume a tendência:

| Etiqueta | Quando aparece |
|---|---|
| **Estável** | variação pequena nas últimas 6 h |
| **Queda ligeira** | descida de 2 hPa ou mais em 6 h |
| **Queda acentuada** | descida de 5 hPa ou mais em 6 h |
| **Subida rápida** | subida de 4 hPa ou mais em 6 h |

  As descidas rápidas são um gatilho conhecido de enxaqueca. O valor é indicativo, não é
  aconselhamento médico.

* **Sono, corpo e movimento** — sono total (com barra de fases, se existirem), peso com a
  diferença face ao último registo, passos, HRV, calorias ativas e o estado geral do dia.
  Por baixo, quando há dados importados, aparece a origem de cada número (Apple Saúde, Garmin,
  Open-Meteo). Os passos mostram a referência "meta pessoal 8 000" — é só informativa, não há
  objetivo configurável.
* **Hidratação e medicação** — anel com a percentagem do objetivo, quantos ml já bebeste, e a
  lista das tomas de hoje com a hora.
* **Últimas crises** — as 4 mais recentes dos últimos 7 dias, com intensidade, variação de
  pressão e duração. O botão leva aos relatórios.
* **Notas de hoje** — só aparece se escreveres notas no Diário.
* **Lembrete de cópia** — quando passam 14 dias sem cópia, um cartão com **Fazer cópia** e
  **Agora não** (ver [Os teus dados](#os-teus-dados)).

**Puxa o ecrã para baixo** (a partir do topo) para atualizar o clima e forçar uma sincronização
do Garmin. No iPhone isto substitui o "pull to refresh" que as apps nativas têm.

### Sintomas

Quatro separadores: **Diário**, **Enxaquecas**, **Digestivo** e **Estado**.

Os três primeiros têm um seletor com os últimos 8 dias. **Hoje** é o primeiro; os outros
mostram a data. O dia escolhido aplica-se aos registos que fizeres a partir dali — útil para
preencher ontem à noite no dia seguinte.

#### Diário

É a vista cronológica do dia.

* **Números do dia** — água, sono, peso, passos, pressão e HRV num só cartão, com etiquetas da
  origem.
* **Linha do tempo** — crises, tomas, evacuações, afrontamentos e refeições, por ordem da hora,
  com os detalhes de cada um (intensidade, zona, duração, Δ6 h, tipo de Bristol, calorias…).
* **Notas do dia** — texto livre. Fica guardado quando sais do campo; não há botão de guardar.
* **Ações** — enxaqueca (só no dia de hoje), registo digestivo, refeição, água, tomar medicação
  e estado/stress.

Numa data passada, os registos ficam nessa data. As crises antigas editam-se no separador
**Enxaquecas**, porque têm hora de início e de fim próprias.

#### Enxaquecas

É o coração da app.

* **Iniciar crise** abre uma folha com:
  * um **mapa da cabeça** interativo e cinco zonas (Frontal, Lateral Esquerda, Lateral Direita,
    Occipital, Ocular) — podes tocar no mapa ou nas etiquetas;
  * **intensidade de 1 a 10**, com etiqueta (Ligeira até 2, Moderada até 5, Severa até 8, Muito
    severa acima disso);
  * **gatilhos** — 18 opções, de queda de pressão a cafeína, ecrãs ou alteração hormonal;
  * **medicação SOS** — marca o que tomaste, com a hora exata;
  * **notas** da crise (aura, náuseas, visão turva, o que estavas a fazer).
* Ao gravar, o **cronómetro começa** e a app guarda automaticamente a **pressão do momento** e a
  **variação das 6 horas anteriores**. É essa leitura que alimenta os relatórios.
* Se já houver uma crise em curso, o botão reabre essa crise em vez de criar outra. Uma crise
  só termina quando carregas em **Terminar** no cartão do cronómetro.
* No **histórico**, toca numa crise para editar zona, intensidade, gatilhos, medicação e notas.
* No topo, quatro números dos últimos 30 dias: crises, intensidade média, duração média e
  quantas tiveram medicação SOS.

#### Digestivo

* **Registar evacuação** — escolhe o aspeto na **escala de Bristol (1 a 7)**, com pictogramas e
  descrição. A hora é a de agora, mas podes corrigi-la.
* No mesmo registo podes marcar **desconforto 0–10**, **sangramento** e fatores (esforço,
  stress, pouca fibra, pouca água, viajar, ficar muito sentado).
* **Distribuição de Bristol** nos últimos 60 dias, numa barra por tipo.
* **Afrontamentos** — calor súbito, suores ou rubor: intensidade de 1 a 10, hora e nota. Ficam
  listados no dia escolhido e podem ser apagados.
* **Doenças pontuais** — oito etiquetas (Gripe, Dores de Costas, Febre, Cansaço Extremo,
  Náuseas, Tontura, Insónia, Alergia). Tocar marca ou desmarca no dia escolhido.

#### Estado

Dois deslizadores, ambos de 1 a 10:

* **Energia** — de "sem energia" a "no máximo".
* **Stress** — de "muito calmo" a "tensão máxima".

O valor fica guardado assim que largas o deslizador. Por baixo, um gráfico dos últimos 14 dias
com as duas linhas, e um campo de **notas livres** para o contexto que os números não mostram.

### Farmácia

Três separadores: **Farmácia**, **Hidratação** e **Alimentação**.

#### Farmácia

* **Aderência de hoje** — anel com a percentagem de tomas feitas, mais tomadas, programadas, em
  falta e SOS.
* **A tua lista** — separada em Medicamento e Suplementos. Cada item mostra um botão por
  horário habitual; tocar marca (ou desmarca) a toma. O botão **+ agora** regista com a hora
  exata, mesmo fora do horário.
* **Novo item** — nome, dosagem, categoria e horários habituais (08:00, 14:00, 21:00 ou uma
  hora à medida).
* O lápis edita, o caixote apaga o item. **As tomas já registadas ficam** no diário.

#### Hidratação

* Anel com o total do dia e um quadradinho por copo.
* Botões **+ copo**, **+ 2 copos**, **+ 3 copos**, **− copo** e **Quantidade à medida**.
* Podes mudar o **objetivo diário** (500–6000 ml) e o **tamanho do copo** (50–1000 ml) aqui
  mesmo; ficam guardados de imediato.
* Gráfico dos últimos 14 dias, com verde quando atingiste o objetivo.

#### Alimentação

* **Registar refeição** — texto livre, calorias (opcional), hora e até 3 fotografias tiradas na
  hora. As fotos ficam no próprio aparelho.
* Lista das refeições de hoje, com miniaturas. Toca numa foto para a ver em grande.
* **Calorias por dia** nos últimos 30 dias, somando o que tiveres registado.
* Não há base de dados de alimentos nem contagem automática — o número é o que escreveres.

### Relatórios

Escolhe o período: **7**, **30** ou **90 dias**.

* **Números do período** — crises, intensidade média, duração média, dias com crise e dias com
  leitura real de pressão.
* **Pressão atmosférica vs crises** — linha da pressão média de cada dia e barras da
  intensidade máxima da crise, no mesmo gráfico.
* **Crises por banda de pressão** — compara quatro faixas: ≥1016 hPa, 1008–1015, 1000–1007 e
  <1000 hPa. Mostra quantos dias caíram em cada faixa, quantas crises houve e a intensidade
  média.
* **Variação nas 6 h anteriores** — quantas crises tiveram leitura capturada, quantas foram
  precedidas por uma queda de 2 hPa ou mais, e a variação média.
* **Comparar duas variáveis** — escolhe uma linha e umas barras entre pressão, intensidade,
  sono, água, passos, stress, energia, HRV, peso e calorias das refeições. Dá para procurar
  padrões que não têm nada a ver com o tempo.
* **Pressão no início × intensidade** — cada ponto é uma crise. Precisa de pelo menos 3 crises
  com pressão capturada.
* **Gatilhos assinalados** e **zonas da cabeça** — contagens, para ver o que se repete.
* **PDF para o médico** — o botão abre um resumo e a pré-visualização de impressão. Escolhe
  **Guardar como PDF**. A folha de impressão passa para fundo claro, esconde a navegação e
  põe um cabeçalho com o período. Nada sai do teu aparelho.

No fim de cada relatório está o aviso certo: **correlação não é causalidade**. Isto serve para
conversar com o médico, não para diagnosticar.

---

## De onde vêm os números

A app não inventa dados — mas também não tem poderes mágicos. Isto é o que é real e o que não é:

| Dado | De onde vem |
|---|---|
| Pressão, temperatura, humidade | **Open-Meteo**, com as coordenadas das Definições |
| Crises, água, digestivo, comida, notas, energia, stress | **escritos por ti** |
| Sono, peso, passos, HRV, calorias ativas | **importados** do Apple Saúde / Garmin, ou **automáticos** pelo Garmin |

### O clima

É real. A app pede ao Open-Meteo a série horária dos últimos 45 dias (e o arquivo histórico
quando precisas de 90) e atualiza de 15 em 15 minutos no máximo. Sem rede, usa a última leitura
boa que guardou e avisa que o valor pode estar desatualizado.

Isto alimenta o barómetro, o risco meteorológico, a pressão de cada crise e todos os
relatórios. O valor de pressão é sempre **ao nível do mar**, para poder ser comparado entre
locais e dias.

### Importar do Apple Saúde

Uma PWA no iPhone **não consegue ler o HealthKit** — o iOS só dá essa permissão a apps nativas.
O caminho oficial é exportar e importar:

1. App **Saúde** → toca no teu nome, no topo.
2. **Dados e dispositivos** → **Exportar todos os dados** → *Transferir para o iPhone*.
3. Guarda o `Archive.zip` na app **Ficheiros** e descomprime-o.
4. No Aura: **Definições → Importar Saúde / Garmin → Escolher ficheiros** → `export.xml`.

A app reconhece **peso, passos, calorias ativas, sono (com fases) e HRV**. Um `export.xml` de
centenas de MB é lido aos pedaços, por isso não bloqueia o telefone.

### Importar do Garmin por CSV

1. No computador, em **connect.garmin.com**, abre **Saúde → Passos**, **Peso** ou **Sono**.
2. No gráfico, menu **⋯ → Exportar .csv**.
3. No Aura: **Importar Saúde / Garmin → Escolher ficheiros**. Podes escolher vários de uma vez —
   os campos juntam-se por dia.

Aceita cabeçalhos em inglês ou português. O que não souber usar aparece listado no
pré-visualizador como "colunas não usadas" — nada é inventado.

Em qualquer importação vês primeiro **"O que encontrámos"**: que campos, de que data a que data
e quantos dias. Só grava quando carregas em **Gravar no diário**. O sono é atribuído ao dia em
que acordaste, e datas com mais de 400 dias são ignoradas.

Também podes colar o conteúdo em vez de escolher um ficheiro, para ficheiros pequenos.

### Garmin automático

O Garmin Connect não fala diretamente com uma PWA. A ponte é o **Intervals.icu**, que tem a
integração oficial com a Garmin e uma API que a app pode chamar do próprio browser — sem
servidor e sem backend.

**Ligar (uma vez):**

1. Cria a conta gratuita em [intervals.icu](https://intervals.icu).
2. **Definições → Garmin Connect** → liga a conta e ativa **Download wellness data**
   (e *Import all Garmin data* para trazer o histórico).
3. No fim das Definições, em **Developer Settings**, copia a **API key**.
4. No Aura: **Definições → Garmin · automático** → cola a chave → **Ligar**.

O campo *ID de atleta* pode ficar em `0` — quer dizer "a conta da chave". Para a conta de
outra pessoa (por exemplo, um atleta que acompanhas), usa o ID que aparece no site, como
`i12345`.

Depois disso, a app sincroniza ao abrir, ao voltar ao primeiro plano e no *pull-to-refresh*, no
máximo de 20 em 20 minutos. **Sincronizar agora** força. Entram **sono, VFC/HRV, passos, peso**
e as **calorias das atividades**.

Regras:

* **Só preenche o que está vazio.** Um valor vindo do Apple Saúde, de um exemplo ou escrito por
  ti nunca é substituído por uma sincronização. Só se atualiza o que já tinha vindo do Garmin
  (por exemplo, um sono que o relógio corrigiu depois).
* O sono é atribuído **ao dia em que acordaste**.
* A chave é validada contra o Intervals.icu **antes** de ser guardada. Fica só neste
  dispositivo, não entra nas cópias de segurança e é apagada se desligares.
* O Intervals.icu limita pedidos; a app respeita o `Retry-After` e diz quanto falta esperar.

> A Garmin mudou os termos em outubro de 2026 e o Intervals.icu avisou que poderá ter de
> limitar o acesso a dados Garmin pela API. Se isso acontecer, o CSV continua a funcionar como
> sempre.

---

## Os teus dados

Tudo vive no **IndexedDB**, uma base de dados do browser, **neste aparelho e neste endereço**.
Não há conta, servidor, backup automático nem sincronização entre dispositivos.

### Cópia encriptada (recomendada)

Em **Definições → Cópia de segurança → Exportar encriptada** escolhes uma **passphrase** e a app
cria um ficheiro `aura-AAAA-MM-DD.aura`. Esse ficheiro vai cifrado (AES-256-GCM) e **só abre com
essa passphrase**.

* **A passphrase não é guardada em lado nenhum.** Se a perderes, a cópia deixa de abrir — nem a
  app nem ninguém a consegue recuperar. Guarda-a fora do telemóvel (um gestor de passwords serve).
* Usa uma **frase de quatro palavras** em vez de uma palavra curta com símbolos: é mais fácil de
  lembrar e mais difícil de adivinhar.
* Depois de criada, o ficheiro **não fica dentro da app**. No iPhone aparece **Guardar em
  Ficheiros…** → escolhe a pasta `Aura` (ou iCloud Drive). No computador e no Android é um
  download normal.
* Para repor: **Abrir cópia encriptada** → escolhe o `.aura` → escreve a passphrase. A cópia
  substitui os dados atuais; a lista de medicação da cópia também substitui a atual.

### Lembrete de cópia

Se passarem **14 dias** sem nenhuma cópia, e já houver pelo menos dois dias de registos nos
últimos 30, aparece um cartão no Dashboard com **Fazer cópia** e **Agora não**. "Agora não"
esconde o aviso durante uma semana. O risco mais comum não é um ataque: é limpar os dados do
Safari ou trocar de telemóvel.

### Exportar e restaurar JSON

O JSON simples continua disponível em **Definições → Os seus dados**, mas é uma opção **sem
passphrase**: qualquer pessoa que abra o ficheiro lê tudo. Serve para mover dados entre
aparelhos ou para inspeção; para guardar, usa a cópia encriptada.

| Quero… | Onde |
|---|---|
| Guardar uma cópia segura | **Definições → Exportar encriptada** (`.aura`) |
| Repor uma cópia segura | **Definições → Abrir cópia encriptada** |
| Levar dados para outro aparelho, sem passphrase | **Definições → Exportar JSON** |
| Repor um JSON | **Definições → Restaurar JSON** |
| Apagar os registos | **Definições → Apagar registos** |
| Ver dados de exemplo | **Definições → Carregar dados de exemplo** |

* **Exportar JSON** cria um ficheiro com os registos, crises, medicação, tomas, refeições e
  definições. A chave da API do Garmin **não** vai no ficheiro.
* **Restaurar** substitui o que está no aparelho pelo conteúdo da cópia (não faz fusão); a chave
  do Garmin que já tenhas ligada mantém-se. Usa quando mudas de telefone ou reinstalas o sistema.
* **Apagar registos** limpa o diário, crises, digestivo, tomas e refeições. **Mantém a base de
  medicação e as definições** — não tens de voltar a criar a lista de comprimidos.

Três coisas que apanham muita gente:

* **Cada browser e cada endereço têm dados separados.** Safari e Chrome no mesmo iPhone não
  partilham. `https://` e `http://` também não. Se mudares de endereço, exporta primeiro.
* **A navegação privada bloqueia o IndexedDB no iOS.** A app avisa; usa uma janela normal.
* Se limpar os dados de sites do Safari, os registos vão com eles. Uma cópia de vez em quando
  é a única rede de segurança.

---

## Sem internet e atualizações

* A app **abre e funciona offline**: o service worker guarda o esqueleto da aplicação no
  telemóvel. Registrar crises, água, medicação e afrontamentos funciona na mesma.
* O clima é a exceção: mostra a última leitura guardada, com um aviso de que pode estar
  desatualizada. Quando a rede volta, atualiza sozinho.
* Quando ficas sem ligação, aparece a faixa **"Sem ligação — a mostrar dados em cache"**.
* **Atualizações**: quando há uma versão nova, aparece **"Nova versão disponível — a
  atualizar…"** e a app recarrega sozinha. Se ficar presa, fecha e reabre.

---

## Limites honestos

* **Não é uma app nativa.** Não lê o HealthKit, não acede ao Garmin Connect diretamente e não
  tem widgets nem notificações.
* **Não há lembretes de medicação.** Os horários são botões para marcar tomas, não alarmes.
* **A vibração só funciona no Android.** O iOS não expõe a API de vibração às web apps.
* **Não sincroniza entre aparelhos.** Sem conta, não há nuvem. Exportar/restaurar é o caminho.
* **Não é um dispositivo médico.** Os relatórios descrevem o que registaste; não diagnosticam
  nem recomendam tratamento. Leva o PDF à consulta e fala com quem te acompanha.
* **A correlação com o tempo é indicativa.** Dá para ver padrões, não para provar causas.

---

## Se algo não funciona

| O que vês | Porquê | O que fazer |
|---|---|---|
| Não há **Adicionar ao Ecrã Principal** | Não estás no Safari, ou estás numa pré-visualização | Abre num separador novo do Safari, em `https://` |
| Instalei e continuo a ver a versão antiga | O service worker guarda o esqueleto | Fecha e reabre; se persistir, limpa os dados do site e volta a abrir |
| **"Os meus dados desapareceram"** | Mudaste de browser, endereço ou estás em navegação privada | Volta ao browser/endereço original ou restaura a cópia |
| A importação não reconhece nada | Escolheste o `Archive.zip` em vez do `export.xml` | Descomprime na app Ficheiros e escolhe o XML |
| O Garmin não sincroniza | Chave errada, conta sem *wellness* ativo, ou limite de 20 min | Confirma os 3 passos, usa **Sincronizar agora**, lê a mensagem de espera |
| Os gráficos estão vazios | Ainda há poucos registos | Usa uns dias ou carrega os dados de exemplo |
| A pressão não muda | Sem rede, ou a localidade está errada | Toca na pastilha do topo; confirma a localidade nas Definições |
| O PDF sai estranho | O browser não aplicou a folha de impressão | Na pré-visualização, escolhe **Guardar como PDF** e ativa "gráficos de fundo" se for preciso |
| A vibração não acontece | Estás no iPhone | Normal — o iOS não a expõe a web apps |
| Aparece "bloqueado" ao abrir | Navegação privada no iOS | Usa uma janela normal |
| Esqueci a passphrase da cópia `.aura` | Não é guardada em lado nenhum | Não há recuperação; usa uma cópia anterior ou o JSON, se o tiveres |

---

## Definições, campo a campo

Abre pela roda no canto superior direito.

**Perfil** — nome que aparece na saudação. Opcional.

**Localização para o clima** — escreve a cidade e usa **Procurar**, ou **Usar GPS**. As
coordenadas ficam visíveis por baixo. O clima usa exatamente estas coordenadas.

**Hidratação** — objetivo diário (500–6000 ml) e tamanho do copo (50–1000 ml). Podes também
mudar isto na aba Farmácia → Hidratação.

**Sensações** — liga ou desliga o feedback háptico (só tem efeito onde o browser o permite,
ou seja, no Android).

**Garmin · automático** — chave da API, ID de atleta (`0` = a conta da chave), **Ligar**,
**Sincronizar agora** e **Desligar**. Os três passos para obter a chave estão num bloco
expansível.

**Cópia de segurança** — **Exportar encriptada** cria o `.aura` com passphrase;
**Abrir cópia encriptada** restaura-o. Por baixo aparece a data da última cópia.

**Os seus dados** — importar Apple Saúde/Garmin, **Exportar JSON**, **Restaurar JSON** (sem
passphrase, legível por qualquer pessoa), carregar exemplos e apagar registos.

**Aplicação** — diz se já estás a correr a partir do ícone e tem o botão **Instalar no ecrã
principal** quando ainda não estás.

As alterações de perfil, localidade, água e háptico só ficam guardadas quando carregas em
**Guardar**. As ações do Garmin aplicam-se logo.

---

## Atalhos

* **Teclado**: `1`–`4` mudam de aba no computador.
* **Android**: prime e mantém o ícone para **Iniciar crise**, **Beber água** e **Relatórios**.
* **Pull-to-refresh**: puxa o ecrã para baixo para atualizar clima e Garmin.
* **Pastilha do topo**: toca para forçar uma leitura nova do clima.
* **Crise no histórico**: toca para editar em vez de criar uma nova.

---

## Para quem mexe no código

Isto é uma PWA sem build, sem dependências e sem CDN: ES modules servidos tal como estão.

```bash
node tools/serve.mjs          # http://127.0.0.1:4173/
node tools/empacotar.mjs      # dist/site + .zip + .tar.gz
node tools/check-imports.mjs  # importações coerentes
```

O service worker serve o shell *cache-first*: ao alterar ficheiros, avança o `VERSAO` em
`sw.js` para as instalações existentes revalidarem. O `tools/empacotar.mjs` avisa quando te
esqueces disso.

Publicação, estrutura de ficheiros, esquema de dados e as regras de fusão das importações
estão em [docs/tecnico.md](docs/tecnico.md).
