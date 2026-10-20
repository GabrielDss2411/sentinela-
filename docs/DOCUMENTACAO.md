# Sentinela · Documentação técnica

**Informação · Planejamento · Ação.** Central de comando para quem circula pelo Rio de Janeiro. Reúne num só painel:

- **Ocorrências:** tiroteios e ações policiais em tempo quase real, do Instituto Fogo Cruzado.
- **Territórios:** 1.671 áreas mapeadas com presença de facções e milícias.
- **Rotas seguras:** rotas no estilo Waze/Google Maps, com tempo, distância e nota de exposição a áreas mapeadas e a tiroteios recentes.
- **Saúde:** 317 unidades públicas de emergência 24h (hospitais, UPAs, prontos-socorros e maternidades).
- **Alerta de proximidade:** aviso por GPS ao se aproximar de uma área mapeada ou de um tiroteio recente.

Todos os serviços usados são gratuitos.

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha o login do Fogo Cruzado (veja "Ocorrências")
npm run dev                  # http://localhost:5173
npm run build                # checagem de tipos + build de produção
npm run lint
```

> O `npm run dev` também serve a função `api/fogo-cruzado.ts` em `/api/fogo-cruzado` (plugin em `vite.config.ts`).
> Assim o app funciona igual no seu computador e na Vercel.

## Estrutura

```
api/fogo-cruzado.ts        Função de servidor (Vercel): login, cache e proxy da API do Fogo Cruzado
bot/                       Bot do Telegram (Docker): alertas de ocorrências para chats privados
scripts/fetch-hospitals.mjs  Gera public/data/hospitais.geojson a partir do CNES
public/data/               zonas.geojson (áreas mapeadas) e hospitais.geojson (unidades de saúde)
src/
  App.tsx                  Estado global e layout da central (topo, menu, mapa, coluna lateral, rodapé)
  index.css                Tema visual (tokens em :root) e layout responsivo
  components/              Telas e painéis: TopBar, SideNav, MapView, MapControls, IncidentsScreen,
                           HealthScreen, RoutePlanner, MonitorPanel, DashboardCards, Panels, Modals…
  hooks/                   useIncidents (Fogo Cruzado), useProximityMonitor (GPS), useWeather, useClock
  lib/                     Lógica sem React: zones, safety (pontuação), routing, geocode, hospitals,
                           basemaps, mapTheme, modules, alerts, municipios, text
```

## Interface

Painel no estilo central de comando (`src/App.tsx`, `src/index.css`):

- **Topo:** busca global de comunidades e endereços, relógio, clima atual (Open-Meteo) e usuário.
- **Menu lateral:** lista os módulos (veja abaixo). É retrátil: o botão no rodapé do menu alterna entre o menu completo e só os ícones.
  A escolha fica salva no navegador; em telas de até 1440 px o menu começa recolhido.
- **Centro:** mapa com seletor de região, filtros de camadas (ocorrências, comunidades, saúde) e janela de ocorrências (3, 12 ou 24 h).
  Os controles do mapa centralizam no Rio, dão zoom, mostram a sua localização e trocam o estilo do mapa.
- **Coluna direita:** na visão geral mostra as últimas ocorrências; nos outros módulos, o painel do módulo.
  Embaixo fica o panorama territorial, com áreas por facção.
- **Rodapé:** status da conexão, horário da última atualização e fontes dos dados.
- **Celular** (até 900 px): o mapa fica em cima, o painel embaixo, e o menu vira uma barra de abas.

### Módulos

Os módulos ficam definidos em `src/lib/modules.ts`. Só os listados em `NAV_MODULES` aparecem no menu. Para mostrar outro, adicione o `id` dele lá.

| Módulo | Onde aparece | Situação |
|---|---|---|
| Mapa (visão geral) | Menu | Pronto |
| Ocorrências | Menu, tela cheia | Pronto |
| Saúde | Menu, tela cheia | Pronto |
| Rotas e Trajetos | Pelo botão "Rota" de uma unidade de saúde | Pronto |
| Comunidades | Pelo card "panorama territorial" | Pronto |
| Alerta de Proximidade | Fora do menu | Pronto |
| Configurações | Fora do menu (estilo do mapa e janela de ocorrências) | Pronto |
| Viaturas, Pessoas e Mandados, Inteligência, Comunicações, Documentos | Fora do menu | Previstos: mostram "em breve" |

## Fontes de dados e serviços

| Parte | Arquivo | Serviço |
|---|---|---|
| Mapa base | `src/components/BaseLayer.tsx`, `src/lib/basemaps.ts` | Satélite Esri World Imagery (padrão), OpenFreeMap (vetorial, via MapLibre) ou tiles do OSM |
| Tema do mapa | `src/lib/mapTheme.ts` | Cores dos estilos Sentinela, Waze dia e Waze noite |
| Clima | `src/hooks/useWeather.ts` | Open-Meteo (sem chave, atualiza a cada 15 min) |
| Áreas mapeadas | `public/data/zonas.geojson`, `src/lib/zones.ts` | Extraído de dadosderiscos.com.br (base jul/2026) |
| Ocorrências | `api/fogo-cruzado.ts`, `src/hooks/useIncidents.ts` | API do Instituto Fogo Cruzado (por função no servidor) |
| Hospitais e UPAs | `public/data/hospitais.geojson`, `src/lib/hospitals.ts` | CNES / Ministério da Saúde (API de dados abertos) |
| Rotas | `src/lib/routing.ts` | OSRM público (routing.openstreetmap.de): carro, bicicleta e a pé |
| Busca de endereços | `src/lib/geocode.ts` | Photon (komoot), limitado ao estado do RJ |
| Pontuação de rotas | `src/lib/safety.ts` | Calculada no navegador |

## Ocorrências (Fogo Cruzado)

O app consulta `/api/fogo-cruzado` a cada 2 minutos, enquanto a aba está visível. Essa função roda no servidor:

- faz login na [API do Fogo Cruzado](https://api.fogocruzado.org.br/docs) e renova o token sozinha;
- busca as ocorrências dos últimos 30 dias no RJ;
- devolve uma versão enxuta, com nº do registro, localidade, unidade policial, motivos e vítimas por grupo.

As respostas ficam em cache por 60 s, então vários usuários não multiplicam as chamadas à API. O login nunca chega ao navegador.

Onde as ocorrências aparecem:

- **Tela Ocorrências** (`src/components/IncidentsScreen.tsx`): ocupa a área do mapa e tem:
  - período de 24 h, 7, 15 ou 30 dias;
  - busca e filtros por município, motivo, "com vítimas" e "ação policial";
  - totais e uma tabela ordenável. O detalhe de cada linha mostra endereço, localidade, unidade, vítimas por grupo e o botão "Ver no mapa";
  - gráficos por dia, motivos, bairros e perfil das vítimas;
  - **Exportar CSV**, com as mesmas colunas do export do Fogo Cruzado.

  A gravidade é calculada pelo app: Alta com mortos ou chacina, Média com feridos ou ação policial, Baixa nos demais casos.
- **Mapa:** marcadores pela idade da ocorrência (vermelho pulsando < 1 h, laranja < 6 h, cinza depois), na janela de 3, 12 ou 24 h escolhida na barra do mapa.
- **Aviso na tela** quando entra uma ocorrência nova das últimas 24 h.
- **Rotas:** cada tiroteio das últimas 6 h a menos de 300 m da rota tira 8 pontos da nota (máximo de 40).
- **Destino:** aviso quando há tiroteios a menos de 1 km.
- **Alerta de proximidade:** um tiroteio das últimas 3 h dentro do raio dispara a janela de alerta, vibração e voz.

### Configurar

1. Solicite acesso em https://api.fogocruzado.org.br/ (a equipe libera um login).
2. Copie `.env.example` para `.env.local` e preencha `FOGOCRUZADO_EMAIL` e `FOGOCRUZADO_PASSWORD`.
   Os arquivos `.env*` ficam fora do git; só o `.env.example` é versionado.
3. Reinicie o `npm run dev`.

Enquanto o acesso não sai, `FOGOCRUZADO_DEMO=1` mostra 5 ocorrências **fictícias** com o aviso "Dados de demonstração".

**Limitação:** a API manda as datas no horário de Brasília, mesmo com o sufixo `Z` (`parseBrt` em `api/fogo-cruzado.ts`).
Se os horários aparecerem com 3 h de diferença, o ajuste é nessa função.

## Bot do Telegram

O bot (`bot/`) manda as ocorrências novas do Fogo Cruzado para o seu Telegram privado. Ele roda à parte do site, em Docker,
e reaproveita o cliente da API (`api/fogo-cruzado.ts`). Não depende de pacotes npm: o Node 24 executa TypeScript direto.

- **Ocorrências:** toda ocorrência nova do RJ chega **em silêncio**. As que acontecem a até X km de um local seu chegam **com som** e o destaque "⚠️ PERTO DE CASA".
- **Consulta:** a cada 2 min (`POLL_SECONDS`).
- **Primeira execução:** só registra o que já existe, sem disparar mensagens.
- **Registros atrasados:** os com mais de 12 h não são enviados.
- **Fonte fora do ar:** se o Fogo Cruzado ficar indisponível por mais de 15 min, o bot avisa uma vez e avisa de novo quando voltar.
- **Privado:** só responde aos chats em `TELEGRAM_ALLOWED_CHAT_IDS`. Para os demais, informa apenas o chat id em resposta a `/start`.
- **Estado:** locais, preferências e ocorrências já enviadas ficam em `/data/state.json`, num volume Docker.

**Comandos**

| Comando | O que faz |
|---|---|
| 📎 Localização + nome | Cadastra um local (ex.: envie a localização e depois "Casa") |
| `/addlocal Casa = Rua X 100, Tijuca` | Cadastra um local por endereço (Photon) ou por `lat, lng` |
| `/locais`, `/remover N` | Lista e apaga locais |
| `/raio 3` | Raio de proximidade em km (0,5 a 20) |
| `/modo todas` / `/modo perto` | Recebe tudo do RJ, ou só o que for perto dos locais |
| `/ultimas`, `/status` | Últimas 10 ocorrências em 24 h; situação do bot |
| `/pausar`, `/retomar` | Pausa ou retoma os alertas |

### Configurar

1. No Telegram, fale com o **@BotFather**, envie `/newbot` e guarde o token.
2. Copie `.env.bot.example` para `.env.bot` e preencha `TELEGRAM_BOT_TOKEN` e o login do Fogo Cruzado.
3. Suba o bot e envie `/start` para ele. Ele responde com o seu chat id.
4. Coloque o chat id em `TELEGRAM_ALLOWED_CHAT_IDS` e reinicie o bot.

**Para testar no seu computador:**

```bash
npm run bot   # lê .env.local e .env.bot; guarda o estado em .bot-data/
```

### Publicando na VPS (Docker)

```bash
# no seu computador: empacote só o que o bot usa
tar czf sentinela-bot.tgz package.json .dockerignore .env.bot api/fogo-cruzado.ts src/lib/incidentTypes.ts bot
scp sentinela-bot.tgz usuario@IP_DA_VPS:~/

# na VPS
mkdir -p ~/sentinela && tar xzf ~/sentinela-bot.tgz -C ~/sentinela && cd ~/sentinela
docker compose -f bot/docker-compose.yml up -d --build
docker compose -f bot/docker-compose.yml logs -f      # acompanhar
```

**Para atualizar:** repita o empacotamento e o `up -d --build`. O volume `bot-data` preserva os locais e o histórico.
O container reinicia sozinho (`restart: unless-stopped`) e tem healthcheck: fica *unhealthy* se o laço de consulta parar por 10 min.

## App Android (APK)

O app Android empacota o mesmo site com o [Capacitor](https://capacitorjs.com) (pasta `android/`, configuração em `capacitor.config.ts`).
Mapa, rotas, comunidades, saúde e alerta de proximidade rodam dentro do app. Só as **ocorrências** dependem de um servidor:
o APK chama a API publicada na VPS, porque o login do Fogo Cruzado nunca vai dentro do app.

### 1. Publicar a API na VPS (uma vez)

A pasta `deploy/` sobe a API (`server/api-server.ts`), o **Caddy** (HTTPS automático com Let's Encrypt) e o bot do Telegram.
Sem domínio próprio, use o [sslip.io](https://sslip.io): um IP `203.0.113.5` vira `203-0-113-5.sslip.io` e já aponta para a VPS.

```bash
# no computador
tar czf sentinela-vps.tgz package.json .dockerignore .env.bot api/fogo-cruzado.ts src/lib/incidentTypes.ts bot server deploy
scp sentinela-vps.tgz usuario@IP_DA_VPS:~/

# na VPS (portas 80 e 443 liberadas)
mkdir -p ~/sentinela && tar xzf ~/sentinela-vps.tgz -C ~/sentinela && cd ~/sentinela
echo "API_DOMAIN=203-0-113-5.sslip.io" > deploy/.env          # troque pelo IP da VPS
docker compose -f deploy/docker-compose.yml up -d --build
curl https://203-0-113-5.sslip.io/health                       # deve responder "ok"
```

A API só libera CORS para o app (`https://localhost`, a origem do Capacitor). Para liberar outros sites, ajuste `API_ALLOWED_ORIGINS`.
Para testar a API no computador: `npm run api` (porta 8787).

### 2. Gerar o APK

Requisitos: JDK 21 (`JAVA_HOME`) e Android SDK 36.

```bash
cp .env.android.example .env.android    # VITE_API_BASE=https://203-0-113-5.sslip.io
npm run apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run build:android` só atualiza o código web dentro de `android/`, para abrir o projeto no Android Studio.
Os ícones e a tela de abertura vêm de `assets/`. Para regenerar:
`npx @capacitor/assets generate --android --iconBackgroundColor '#060d17' --splashBackgroundColor '#060d17'`.

### 3. Instalar no celular

Copie o `app-debug.apk` para o celular (cabo, Drive, Telegram…), abra o arquivo e permita "instalar apps desconhecidos" para o app que abriu o arquivo.
Ou, com o celular em modo depurador USB: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

**Limitações no app:**
- O alerta por **voz** não funciona, porque a WebView do Android não tem síntese de fala. Vibração e bipes funcionam.
- Como no navegador, o GPS pausa com a tela desligada. Alerta em segundo plano exige um plugin nativo (próximo passo).
- O APK de *debug* serve para uso pessoal. Para a Play Store, é preciso um APK/AAB de *release* assinado com uma chave própria.

## Rotas e pontuação

O planejador (`src/components/RoutePlanner.tsx`) recebe a origem e o destino pela busca, por "minha localização" ou por clique no mapa.

**Candidatos de rota:** até 3 alternativas do OSRM, mais 2 "desvios" forçados por pontos de passagem perpendiculares ao trajeto direto.
Os desvios que levam mais que o dobro do tempo da rota mais rápida são descartados.

**Pontuação (0–100):**
- A rota é amostrada a cada 25 m. Cada trecho conta como *dentro* (dentro de um polígono) ou *perto* (a até 150 m de um).
- A exposição é `(m dentro + m perto / 3) / distância total`.
- Pontuação = `100 − exposição × 250 − 3 × áreas atravessadas`.
- As áreas "neutras" não contam.
- Os tiroteios recentes descontam pontos (veja acima).

É uma heurística: os pesos ficam em `computeScore` e `withIncidents`. A rota sugerida por padrão é a de maior nota; em caso de empate, a mais rápida.

**Destino:** mostra a área mapeada mais próxima e quantas existem num raio de 1 km.

## Alerta de proximidade

O alerta (`src/hooks/useProximityMonitor.ts`, `src/lib/alerts.ts`) acompanha o GPS com `watchPosition` e mantém a tela ligada (Wake Lock).
Avisa quando você entra numa área mapeada, se aproxima de uma ou passa perto de um tiroteio recente.

- **Raio:** 500 m, 1 km ou 2 km.
- **Formas de aviso:** janela na tela, vibração, bipes ou voz.
- **Voz:** só fala a até 500 m, no máximo uma vez a cada 10 min por área.
- **Repetição:** cada área só alerta de novo depois que você sai a mais de 1,3× o raio.
- **Limitação:** no navegador, com a tela desligada, o GPS pausa. Alerta em segundo plano exige um PWA com push ou um app nativo.

## Saúde (emergências públicas)

A tela **Saúde** (`src/components/HealthScreen.tsx`) lista as 317 unidades públicas com atendimento 24h:
hospitais, UPAs, prontos-socorros e maternidades.

- **Minha localização:** calcula a distância em linha reta até cada unidade, ordena da mais próxima e destaca a mais próxima entre as que passam nos filtros.
- **Filtros:** busca por nome, endereço ou bairro, município, distância máxima (2, 5, 10 ou 20 km), esfera (municipal ou estadual),
  tipo de unidade, "fora de áreas mapeadas" e "com telefone".
- **Ações por unidade:** traçar rota, ligar e ver no mapa. A tela também tem atalhos para 192, 193 e 190.
- Cada unidade mostra se fica dentro de uma área mapeada. O nome do município vem do código IBGE do CNES (`src/lib/municipios.ts`).

## Mapa base e temas

O estilo padrão é o **satélite** (Esri World Imagery, com camadas de vias e nomes por cima).
A troca de estilo fica nos controles do mapa ou em Configurações, e a escolha fica salva no navegador.

Os estilos **Sentinela**, **Waze dia** e **Waze noite** são estilos do OpenFreeMap recoloridos pelos temas em
`src/lib/mapTheme.ts` (`SENTINELA_THEME`, `WAZE_DAY_THEME`, `WAZE_NIGHT_THEME`).

- Cada tema define as cores de fundo, água, parques, prédios, rodovias, ruas, trilhos e rótulos. A lista `hide` esconde camadas.
- **Novo tema:** crie outro objeto de cores e adicione um item em `BASEMAPS` (`src/lib/basemaps.ts`).
- **Edição visual:** abra um estilo do OpenFreeMap no [Maputnik](https://maplibre.org/maputnik/), exporte o JSON para `public/styles/` e aponte o `style` do mapa base para ele.

## Atualizando os dados

**Unidades de saúde (CNES):**

```bash
node scripts/fetch-hospitals.mjs
```

O script mantém só unidades de natureza jurídica pública (1xxx) com turno 24h.
Exclui as militares, psiquiátricas e prisionais, e também os hospitais especializados sem porta de emergência.
As coordenadas vêm do próprio CNES, e algumas estão erradas.

**Áreas mapeadas:** o site de referência embute o GeoJSON na própria página, dentro de `<script id="zonas" type="application/json">`.
Para atualizar, baixe a página e extraia esse bloco para `public/data/zonas.geojson`.
Antes de redistribuir ou usar comercialmente, verifique os termos da fonte.

## Publicando (Vercel)

O projeto é um app Vite. A função em `api/` é publicada automaticamente como Vercel Function. Cadastre as variáveis do servidor:

```bash
vercel env add FOGOCRUZADO_EMAIL
vercel env add FOGOCRUZADO_PASSWORD
```

O GPS do navegador só funciona em HTTPS ou em `localhost`. Para testar no celular, publique ou use um túnel HTTPS.

## Dicas de desenvolvimento

- **Instalou pacotes com o `npm run dev` rodando?** Reinicie com `npx vite --force`. Sem isso, o cache de dependências fica velho e a página abre em branco.
- **Worker do MapLibre:** o MapLibre v6 roda num web worker que o Vite precisa empacotar. Por isso `BaseLayer.tsx` usa `setWorkerUrl` com import `?worker&url`, e `vite.config.ts` define `worker.format: 'es'`.
- **Créditos do mapa:** os créditos do OpenStreetMap, OpenFreeMap e Esri são obrigatórios. Só o prefixo "Leaflet" foi trocado por texto simples, porque o padrão traz um ícone de bandeira.

## Aviso

O controle territorial muda com frequência, e os dados podem estar desatualizados ou imprecisos.
A pontuação estima a exposição a áreas mapeadas e a tiroteios recentes. Ela não garante segurança.
Uma área no mapa não é acusação contra moradores ou estabelecimentos locais.
Os servidores públicos de rota e de busca servem para uso pessoal ou de teste. Para produção, hospede seu próprio OSRM ou Valhalla e seu próprio geocoder.
