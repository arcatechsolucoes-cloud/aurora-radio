# Deploy na Oracle Cloud Always Free (melhor custo/benefício)

A Oracle oferece uma VM ARM **gratuita e sempre ligada** com 4 OCPUs, 24 GB de RAM
e **200 GB de disco persistente** — ótimo para streaming. O cadastro pede cartão
apenas para verificação (não cobra nada enquanto você ficar no Always Free).

## 1. Crie a VM

1. Acesse https://cloud.oracle.com → crie uma conta gratuita.
2. Menu ☰ → **Compute → Instances → Create instance**.
3. Imagem: **Ubuntu 24.04** (ou Debian). Shape: **VM.Standard.A1.Flex** (ARM).
   - OCPUs: 4, memória: 24 GB (Always Free).
4. **Add SSH keys** → gere e salve sua chave privada.
5. Network: a VPC padrão serve. Ative **Assign public IPv4 address**.
6. Crie. Anote o **IP público** da instância.

## 2. Abra as portas 3000 e 8000

1. Menu ☰ → **Networking → Virtual cloud networks** → a VPC da instância → **Security Lists** → Default Security List → **Add Ingress Rules**:
   - `TCP` origem `0.0.0.0/0` porta **3000** (painel + player + stream)
   - `TCP` origem `0.0.0.0/0` porta **8000** (fonte ao vivo Icecast)

## 3. Envie o projeto e instale

Na sua máquina, com o projeto pronto, suba os arquivos (o Node entregue direto):

```bash
scp -r . ubuntu@SEU_IP:~/aurora-radio
# ou apenas os essenciais:
# scp -r server public package.json .env.example ubuntu@SEU_IP:~/aurora-radio
```

Entre na máquina e prepare:

```bash
ssh ubuntu@SEU_IP
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pm2

cd ~/aurora-radio
cp .env.example .env
nano .env    # ajuste PUBLIC_HOST, SESSION_SECRET e DATA_DIR=/home/ubuntu/aurora-radio/data
npm install
npm run seed
```

## 4. Rode com PM2 (reinicia sozinho)

```bash
sudo env PATH=$PATH:/usr/bin pm2 start server/index.js --name aurora-panel
pm2 startup                    # siga a instrução exibida (habilita na reinicialização da VM)
pm2 save
```

Pronto:

- Painel: `http://SEU_IP:3000`
- Player: `http://SEU_IP:3000/listen`
- Locutores: servidor `SEU_IP`, porta `8000`, mount `/live`

## 5. (Opcional) Domínio próprio com HTTPS

Compre um domínio (ex.: `radio.seudominio.com.br`) e aponte **A** para o IP da VM.
Depois:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/radio
```

```nginx
server {
  listen 80;
  server_name radio.seudominio.com.br;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;          # essencial para o stream
    proxy_read_timeout 3600s;
  }
  location /stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 3600s;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/radio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d radio.seudominio.com.br
```

> A porta 8000 (fonte ao vivo) continua direta por IP; softwares como BUTT
> não precisam de HTTPS.

## Manutenção

```bash
pm2 logs aurora-panel     # logs
pm2 restart aurora-panel  # reiniciar
pm2 monit                 # monitorar CPU/RAM
```