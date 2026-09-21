# Deploy no Fly.io (recomendado — sempre ligado, quase grátis)

O Fly.io mantém a instância **sempre ligada** no nível gratuito (3 VMs compartilhadas de 256 MB).
Banco e mídia ficam num **volume persistente** (1 GB custa ~US$ 0,15/mês).

> Crie a conta em https://fly.io (pede cartão só para verificação — não cobra sem uso).
> Depois de criar a conta, rode `fly auth login` (abre o navegador) e autorize o CLI.

## 1. Instale o CLI e entre

No seu computador (ou em qualquer máquina):

```bash
# Windows: use o instalador em https://fly.io/docs/flyctl/install/
# macOS/Linux:
curl -L https://fly.io/install.sh | sh

fly auth login
```

## 2. Crie o volume persistente (dados + áudios)

Este projeto já traz `fly.toml`, `Dockerfile` e `.dockerignore` prontos.
`fly launch` registra o app com essas configurações (o passo 3 cria o volume):

```bash
fly launch --no-deploy --copy-config --yes
```

> Use `--name aurora-radio` se quiser um nome específico (precisa ser único no mundo).
> Se `--yes` não aceitar tudo, responda na mão: **org** = personal, **region** = `gru` (São Paulo).

## 3. Crie o volume persistente

```bash
fly volumes create data --size 3 --region gru
```

O volume **não pode ficar em outra região** que não seja a mesma do app (`primary_region`).
Se escolheu outra região, adapte o comando e o `primary_region` no `fly.toml`.

## 4. Confira o `fly.toml`

O arquivo já vem pronto no repositório. Pontos importantes:

- `internal_port = 3000` → a API/stream ficam na porta 3000 interna.
- `force_https = false` → a porta 80 (http) fica aberta para a **fonte ao vivo** dos
  locutores (softwares como BUTT/Mixxx não falam HTTPS). O painel continua acessível
  também em `https://`.
- `STREAM_PORT = "80"` → as credenciais mostradas no painel apontam para a porta 80.
- `[[mounts]]` monta o volume `data` em `/data` (banco + uploads persistentes).

## 5. Publique

```bash
fly deploy
```

Pronto. Acessos:

- Painel: `https://aurora-radio.fly.dev`
- Player: `https://aurora-radio.fly.dev/listen`
- Stream: `https://aurora-radio.fly.dev/stream`

## Fonte ao vivo (locutores)

Os locutores entram ao vivo pelo **mesmo endereço do painel**, porta **80** (http),
mount `/live`:

| Campo | Valor |
|---|---|
| Servidor | `aurora-radio.fly.dev` |
| Porta | `80` |
| Mount / Ponto | `/live` |
| Usuário | `source` |
| Senha | a senha ao vivo configurada no painel (padrão inicial `k9$vT2mQpz` — troque!) |

No BUTT: **Address** = `aurora-radio.fly.dev`, **Port** = `80`, **Password** = senha da fonte.

O primeiro deploy sobe o **seed** automaticamente (usuário `admin` / `aurora2024`) e já
transmite a **faixa demo** embutida. **Troque a senha do admin e a senha da fonte imediatamente.**

> **Segredo de sessão:** antes de publicar, defina um segredo própria:
> `fly secrets set SESSION_SECRET="<frase-longa-e-aleatoria>"` e reinicie (`fly restart`).

## Dicas

- Veja os logs: `fly logs`
- Reiniciar: `fly restart`
- Redimensionar disco: `fly volumes extend data -s 10`
- Trocar segredo de sessão: `fly secrets set SESSION_SECRET="nova-frase-aleatoria"` (e reinicie)