# Rádio Aurora FM — Painel de Controle

Console próprio para rádio internet (estilo Centova), totalmente funcional, com **transmissão de áudio real**:
AutoDJ toca os arquivos da biblioteca e locutores podem entrar **ao vivo** usando qualquer programa de
transmissão padrão (BUTT, Mixxx, RadioDJ) pelo protocolo Icecast.

Funciona **pela internet** em provedores gratuitos (Fly.io, Oracle Cloud Free, Render) — veja as guias em `deploy/`.

---

## O que o painel faz

| Recurso | Descrição |
|---|---|
| 🔐 Login | Administrador e locutores, senhas com hash (scrypt), sessão segura |
| 📊 Painel | Ouvintes ao vivo, pico, tempo no ar, "tocando agora", fila, armazenamento |
| ▶️ Transmissão | Botão liga/desliga o AutoDJ; ouvintes conectam em `/stream` |
| 📻 Fonte ao vivo | Locutores conectam pelo protocolo Icecast na mesma porta do painel e assumem a transmissão |
| 🎶 AutoDJ | Toca playlists da biblioteca em sequência ou aleatório; quando a fonte ao vivo cai, o AutoDJ retoma |
| 🎚 Stream | Configura formato, bitrate, mount, limites e metadata |
| 🗂 Playlists | **Programador por blocos**: música e vinheta entram automaticamente (sorteio); você posiciona os programetes, comerciais e hora certa na ordem exata |
| 🎧 Mídia | Upload **categorizado por tipo** (Música, Vinheta, Programete, Hora certa), filtro por tipo, mudar tipo depois, prévia, exclusão |
| 👥 Usuários | Contas admin/locutor, bloqueio, redefinição de senha |
| ⚙️ Config | Nome da rádio, fuso, description, playlist padrão do AutoDJ, preferências |
| 📈 Estatísticas | Pico de ouvintes, conexões, histórico de faixas |
| 🔁 Auto-reinício | Se o servidor reiniciar, o AutoDJ volta sozinho (pode desligar em Config) |

## Arquitetura

```
                    ┌─────────────────────────────┐
  Locutor ──Icecast─▶  Painel + Motor de stream   │
  (BUTT/Mixxx)       │  Node.js (mesma porta)     │
                    └──────┬──────────────────────┘
                           │ áudio (MP3)
                    ┌──────▼──────────────────────┐
  Ouvinte  ──HTTP──▶  Listener do navegador        │
                     /stream e player /listen      │
                    └─────────────────────────────┘
```

- **Fonte ao vivo**: protocolo SOURCE/PUT do Icecast (vários softwares compatíveis),
  embutida no mesmo servidor HTTP do painel (funciona em qualquer hospedagem de 1 porta).
- **AutoDJ**: o próprio painel lê os MP3 da biblioteca e transmite sem parar.
- **Dados**: JSON em `data/` (banco + uploads). Em produção, monte um volume persistente.

## Rodar localmente (desenvolvimento)

Pré-requisito: [Node.js](https://nodejs.org) 18 ou superior.

```bash
npm install      # instala dependências
npm run seed     # cria os dados iniciais (admin + playlists + mídia de exemplo)
npm start        # sobe o painel em http://localhost:3000
```

Ou, no Windows, dê dois cliques em **`run-local.bat`**.

> **Acesso inicial:** usuário `admin`, senha `aurora2024` → troque a senha
> no primeiro acesso (aba Usuários).

Endereços:
- Painel: `http://localhost:3000`
- Player público (ouvintes): `http://localhost:3000/listen`
- Stream bruto: `http://localhost:3000/stream`

## Publicar na internet (provedores gratuitos)

Escolha a guia que combina com você:

- [`deploy/render.md`](deploy/render.md) — **Render** (grátis **sem cartão**; o free "dorme" sem tráfego por 15 min)
- [`deploy/fly.md`](deploy/fly.md) — **Fly.io** (instância sempre ligada no nível gratuito + volume pequeno)
- [`deploy/oracle.md`](deploy/oracle.md) — **Oracle Cloud Always Free** (VPS ARM com 200 GB grátis, melhor custo/benefício)

Todos os passos usam a mesma base: este código é um app Node padrão.

## Configuração (variáveis de ambiente)

Copie `.env.example` para `.env` e ajuste:

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP do painel |
| `STREAM_PORT` | `3000` | Porta anunciada da fonte ao vivo (embutida na mesma porta HTTP; use `80` em produção) |
| `PUBLIC_HOST` | `localhost` | Endereço público exibido aos locutores |
| `DATA_DIR` | `./data` | Onde ficam banco e áudios (use volume persistente) |
| `SESSION_SECRET` | — | **Troque** por uma frase longa e aleatória |
| `MAX_UPLOAD_BYTES` | 200 MB | Tamanho máximo de cada upload |
| `PERSIST_INTERVAL` | 30 | Gravação das estatísticas (s) |

## Como os locutores transmitem ao vivo

### Opção A — Direto do navegador (funciona em qualquer hospedagem)

1. No painel → aba **Ao vivo** → **🎙️ Transmitir do navegador** → **Iniciar transmissão**.
2. Permita o microfone: o áudio é codificado em **MP3 128 kbps** no próprio navegador (lamejs) e
   enviado pela internet para o servidor (POST `/live/ingest`).
3. Para parar: **Parar** — o AutoDJ retoma na hora.

É a opção recomendada no **Render free**, onde o proxy bloqueia o método Icecast `SOURCE` (HTTP 405).

### Opção B — Programa de locução (BUTT / Mixxx / RadioDJ)

1. No painel → aba **Ao vivo**, copie servidor/porta/mount/usuário/senha.
2. No programa do locutor cadastre:
   - Endereço: `PUBLIC_HOST`, Porta: `STREAM_PORT`, Mount: `/live`
   - Usuário/senha da fonte ao vivo.
3. Ao conectar, o painel mostra **Ao vivo**, o AutoDJ pausa e os ouvintes passam a receber a transmissão.
4. Ao desconectar, o AutoDJ **retoma automaticamente**.

> ⚠️ O Render free **não aceita** `SOURCE` (Icecast) — ele redireciona a porta 80 para HTTPS e responde
> 405 para métodos não padrão. Em provedores com porta aberta (Fly, Oracle Cloud, VPS) o fluxo nativo
> `SOURCE` funciona normalmente. No Render, um cliente com "shoutcast v2 / HTTPS + PUT" pode usar
> `https://…/live`; os demais usam a **Opção A**.

> **Nota v1:** o AutoDJ reproduz apenas arquivos **MP3** (o stream é MP3 direto para o navegador).
> AAC/OGG/WAV podem ser enviados e usados como fonte ao vivo, mas não no AutoDJ ainda.
> O locutor do navegador envia MP3, então é 100% compatível com o player.

## Organizar mídia por tipo e programar a playlist

**Enviar mídia categorizada:**

1. Aba **Mídia** → **Enviar arquivos**.
2. Escolha o **tipo** antes de enviar: **Música, Vinheta, Programete, Hora certa ou Comercial**.
3. Cada arquivo entra na categoria escolhida (dá para mudar o tipo depois, pelo seletor na tabela).
4. Use os **filtros** acima da tabela para ver só um tipo de cada vez.

**Como a programação funciona (blocos):**

- As playlists agora são **programações por blocos**:
  - **Blocos automáticos** — 🎵 **Música** e 🎶 **Vinheta**: você marca *onde* eles entram e o
    sistema **sorteia uma faixa da categoria** a cada execução. Você não escolhe a música.
  - **Blocos fixos** — **Programete, Comercial e Hora certa**: você escolhe o **item específico**
    e a posição exata em que ele toca.
- Aba **AutoDJ** → **+ Nova playlist** abre o programador: clique em **＋ Música (aleatória)** /
  **＋ Vinheta (aleatória)** para inserir blocos automáticos e use os **+** da lista de
  programetes/comerciais/hora certa para fixar itens. Reordene com **↑ ↓** e remova com **✕**.
- Clique em **Criar playlist**: a playlist nasce completa e toca **sempre nessa estrutura**.
- Para reprogramar: selecione a playlist e use **Programar**.

> Para o AutoDJ usar a programação criada, selecione-a em **Config → Playlist do AutoDJ**.

## Estrutura do projeto

```
server/            backend Node.js
  index.js         entrada (painel + streaming)
  api.js           REST /api/*
  auth.js          login, sessões (cookies assinados), hash
  store.js         persistência JSON
  seed.js          dados iniciais
  stream/          motor de áudio
    engine.js      AutoDJ (ritmo real de reprodução) + estado + estatísticas
    broadcaster.js distribuição aos ouvintes
    source.js      fonte ao vivo (protocolo Icecast)
public/            frontend (painel, login, player)
  index.html       console
  login.html       tela de login
  player.html      player público dos ouvintes
  app.js           lógica do painel
  style.css        visual (design original do mockup)
scripts/           ferramentas de desenvolvimento
  test-live.js     simula um locutor conectando ao vivo (node scripts/test-live.js)
  test-api.ps1     bateria de testes da API
deploy/            guias de publicação (Fly, Oracle, Render)
data/              banco JSON + uploads (gerado em runtime)
```