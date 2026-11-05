# Wpollo Chat — servidor

Mensageiro do Wpollo VR **sem número de telefone**: cada pessoa cria uma conta com *username* e senha.

**Recursos:** conversas 1:1, grupos (admin, adicionar/remover membros, renomear), envio de imagens
(JPEG/PNG/WebP até 3 MB, validadas pelo conteúdo), "digitando…", online/visto por último, recibos de leitura
e tempo real por WebSocket.

## Rodar

```bash
cd server/chat
npm install
PORT=8787 node server.js          # dados em ./data (db.json + media/)
```

Com Docker:

```bash
docker build -t wpollo-chat server/chat
docker run -d -p 8787:8787 -v wpollo-chat:/data wpollo-chat
```

**Use HTTPS:** o site do Wpollo VR roda em HTTPS, então o navegador só conecta num servidor HTTPS/WSS.
Ponha o servidor atrás de um proxy com certificado. Com o Caddy, basta isto:

```
chat.seudominio.com {
  reverse_proxy localhost:8787
}
```

No VR, abra o app **Wpollo Chat** e informe `https://chat.seudominio.com`.

## Variáveis

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | 8787 | porta HTTP/WebSocket |
| `DATA_DIR` | `./data` | banco e imagens |
| `CORS_ORIGIN` | `*` | troque pela origem do seu site, ex. `https://akundiscoremake.github.io` |

## Segurança (o que existe e o que não existe)

- Senhas com **scrypt** + sal. Os tokens de sessão são aleatórios (256 bits) e o servidor guarda só o hash deles.
- Há limite de requisições por IP, os tamanhos de corpo são limitados e as imagens são validadas pelos bytes.
- **Não há criptografia ponta a ponta:** quem administra o servidor consegue ler as mensagens.
- O banco é um arquivo JSON, bom para grupos de amigos e comunidades pequenas. Para milhares de usuários,
  troque por um banco de verdade (SQLite ou Postgres).
