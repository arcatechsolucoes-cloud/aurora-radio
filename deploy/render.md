# Deploy no Render (grátis, **sem cartão de crédito**)

O nível **free** do Render é de verdade: **não pede cartão**. Chama atenção para dois limites:

1. A instância **dorme após 15 min sem tráfego** e acorda sozinha quando alguém acessa
   (demora ~30–60 s no despertar). Enquanto há um ouvinte no `/stream`, fica ligada.
2. O free **não tem disco persistente** — banco/áudios voltam ao estado inicial em reinícios.
   O painel **auto-cria os dados** e **toca a faixa demo** ao subir, então nunca fica sem áudio.

Tráfego grátis: **100 GB/mês** (128 kbps ≈ 34 h de stream contínuo por ouvinte/mês).

## 1. Crie uma conta (se ainda não tiver)

GitHub (grátis, sem cartão) → https://github.com → **Sign up**.
Render (login com o GitHub) → https://render.com → **Get started**.

## 2. Suba o código para o GitHub

```bash
git init && git add . && git commit -m "Rádio Aurora FM - painel"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/aurora-radio.git
git push -u origin main
```

> O repositório contém o **`render.yaml`**: o Render lê este arquivo na hora de criar o serviço.

## 3. Crie o Web Service

1. No Render: **New + → Blueprint** → conecte o repositório `aurora-radio`.
2. O Render **detecta o `render.yaml`** e já monta o serviço `aurora-radio` (free).
3. Clique em **Apply** / **Deploy**.

Pronto. Quando aparecer o domínio, a URL será `https://aurora-radio.onrender.com`.

## 4. Acessos

- Painel: `https://aurora-radio.onrender.com`
- Player: `https://aurora-radio.onrender.com/listen`
- Stream: `https://aurora-radio.onrender.com/stream`
- Locutores: servidor `aurora-radio.onrender.com`, porta **80** (http), mount `/live`
  - Usuário da fonte: `source` · Senha inicial: `k9$vT2mQpz` (**troque!** atualize em Config → Ao vivo)

## 5. Primeiros passos pós-deploy

- Entre com `admin` / `aurora2024` e **troque a senha** (aba Usuários).
- Envie suas músicas (aba Mídia) e monte a playlist — até lá, soa a faixa demo.

## Problemas conhecidos

- **Sleep**: com ninguém escutando por 15 min, a rádio "pausa" e desperta no próximo acesso.
  Nível pago (US$ 7/mês) mantém 24 h ligada com disco persistente.
- **Dados efêmeros**: uploads/db somem em deploys — use o nível pago com *disk* para um acervo permanente,
  ou o [Fly](fly.md)/[Oracle](oracle.md) quando você tiver um cartão disponível.
- **Primeiro deploy**: se algo falhar, clique **Manual Deploy → Deploy latest commit**.