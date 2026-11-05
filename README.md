# REgo OS — revivendo o Oculus Go na web

Um "sistema operacional" WebXR feito para o **Oculus Go**: abre no navegador, entra em VR com um clique e traz
**62 jogos**, multitarefa, janelas flutuantes estilo **visionOS** e um menu de pausa dentro dos jogos.

> Ícones dos apps: remakes feitos pelo autor do projeto (em `assets/icons/`). **Projeto não afiliado à Meta,
> ao Roblox ou a qualquer marca citada.** Facebook/Instagram/WhatsApp são apenas atalhos para os sites oficiais.

## Como usar

1. Abra o site publicado no **Oculus Browser** do Go (ou em qualquer navegador com WebXR).
2. Toque em **🥽 Entrar no VR**.
3. Sem óculos também funciona (modo 2D): mouse esquerdo = gatilho, botão direito arrasta para olhar,
   WASD = touchpad, Q/E = girar, Esc = menu.

### Controle do Go

| Ação | Como |
|---|---|
| Ação principal / clicar | Gatilho |
| Andar | Clicar na parte de cima do touchpad (baixo = ré) |
| Girar (snap turn) | Clicar nas bordas esquerda/direita do touchpad |
| Trocar página | Deslizar no touchpad |
| Menu do jogo | **Segurar o centro do touchpad** ou botão **Voltar** |

O botão Voltar do Go encerra o modo imersivo no Oculus Browser. O REgo trata isso como "abrir o menu":
o jogo fica pausado e um toque em **Entrar no VR** volta exatamente de onde parou.

## O que tem

- **Início estilo visionOS**: ícones circulares flutuando, barra de abas lateral em vidro, barra de status,
  4 ambientes (lago ao pôr do sol, floresta à noite, espaço, praia).
- **Multitarefa**: até 3 jogos pausados na memória ao mesmo tempo (aba ⧉ Multitarefa) e até 3 janelas de apps
  abertas ao seu redor — arraste a barrinha embaixo da janela para movê-la.
- **Menu de pausa dentro dos jogos** (abas Jogo / Modificadores / Ajustes / Ajuda):
  Continuar, Reiniciar, **Sair do jogo**, **Braço duplo** (espelha seu controle para o outro lado e cria uma
  segunda mão que também atira/pega/bate), Início sem fechar o jogo, Recentralizar, Captura de tela, e
  modificadores: câmera lenta, baixa gravidade, mãos gigantes, modo noite, laser arco-íris, esconder laser,
  medidor de FPS, mudo.
- **Apps**: Loja (biblioteca), Navegador WebXR, Cloud Play, TV (cinema gigante), Galeria, Captura, Relógio
  (cronômetro/timer), Calendário, Calculadora, Arquivos, Mensagens, Área Remota, Configurações, Ajuda,
  e atalhos web.
- **Recordes, conquistas e notificações** salvos localmente.

### Os 62 jogos

- **Ação (14)**: Blocky World, Obby Fácil, Obby Difícil, Torre Infinita, Tiro ao Alvo, Estoura Balões, Defensor Espacial, Noite dos Zumbis, Galeria do Parque, Martelo Maluco, Fatiador de Frutas, Casa Assombrada, Pássaro Saltitante, Quebra-Tijolos
- **Esporte (13)**: Boliche VR, Boliche Cósmico, Basquete 3 Pontos, Minigolfe, Dardos, Paredão de Pingue-Pongue, Goleiro, Cobrança de Pênalti, Jogo de Argolas, Air Hockey, Home Run Derby, Arqueiro, Tiro ao Prato
- **Física (4)**: Sandbox Lab, Sandbox Lunar, Canhão vs Castelo, Derruba Latas
- **Puzzle (12)**: Sequência de Cores, Jogo da Memória, Jogo da Velha, Ligue 4, Apaga as Luzes, Quebra-cabeça 15, Campo Minado, Labirinto Inclinável, Quiz Relâmpago, Teste de Reflexo, Empilha Blocos, Cobrinha no Paredão
- **Música (5)**: Piano Gigante, Bateria no Ritmo, Teremim Cósmico, Beat Maker, Neon Beats
- **Corrida (5)**: Kart Turbo, Corredor Infinito, Voo Livre, Esqui Slalom, Túnel Neon
- **Relax (9)**: Pintura 3D, Construtor de Blocos, Show de Fogos, Aquário Zen, Sistema Solar, Respiração Guiada, Montanha-Russa, Pescaria no Lago, Bolhas de Sabão

Destaques:
- **Boliche VR** — física real (cannon.js), 10 frames com pontuação oficial de strike/spare.
- **Sandbox Lab** (inspirado em BoneLab) — puxar objetos à distância, arremessar, ragdolls de blocos com
  articulações, TNT em cadeia, dominós, torre, congelar, apagar, salvar/carregar criações.
- **Blocky World** — mundo de blocos com hangout, NPCs que andam/pulam/conversam, placar de jogadores,
  torre para escalar e portais para obbies (checkpoints, blocos mortais, gelo, esteiras, trampolins).
- **Labirinto Inclinável** — usa a rotação do controle 3DoF para inclinar o tabuleiro.

Todos os jogos foram pensados para **um controle 3DoF com gatilho e touchpad**.

### Cloud Play (experiências do Roblox)

O app **Cloud Play** abre uma experiência do Roblox **no site oficial** a partir do ID (place id). O modelo de URL
é configurável em *Configurações → Dados* (`{id}` é substituído pelo ID) — o padrão é
`https://www.roblox.com/games/{id}`. Se você usa outro endereço de jogo pelo navegador, troque o modelo lá.
Isso é um atalho: o jogo roda no site do Roblox, fora do REgo, e depende do que o navegador do Go suporta.

### Navegador WebXR

Lista de experiências WebXR (three.js, A-Frame, Moon Rider, exemplos do W3C), campo de endereço com teclado
virtual e favoritos. Por limitação da web, um site WebXR só pode rodar em tela cheia (não dentro de outra
página), então o navegador abre o site e você volta com o Voltar do navegador.

## Otimizações para o hardware do Go (Snapdragon 821 / Adreno 530)

- **Zero downloads pesados**: todos os modelos 3D são gerados por código (low-poly, CC0) e todos os sons são
  sintetizados com WebAudio. Bibliotecas servidas localmente (sem CDN) + **service worker** com cache:
  depois da primeira visita o REgo abre instantaneamente e funciona offline.
- **Fixed foveated rendering** (nível ajustável), **72 Hz** quando disponível, **escala de resolução** ajustável.
- Materiais **Lambert** (iluminação por vértice), **sem shadow maps** (sombras "blob"), geometrias e materiais em
  cache compartilhado, física com passo fixo e corpos dormindo.
- UI em canvas **só redesenha quando muda** (hover/estado) — custo quase zero por frame.
- Código ES2015 sem sintaxe moderna (`?.`, `??`) para rodar no Chromium antigo do Oculus Browser;
  **polyfill WebVR→WebXR** carregado só quando o navegador não tem WebXR.

## Publicar no GitHub Pages

O site é estático (sem build). Duas opções:

- **Settings → Pages → Build and deployment → Source: GitHub Actions** — o workflow
  `.github/workflows/pages.yml` publica a cada push.
- Ou **Source: Deploy from a branch**, escolha o branch e a pasta `/ (root)` (o arquivo `.nojekyll` já está aqui).

WebXR exige HTTPS, que o GitHub Pages já fornece.

## Trocar os ícones

Os ícones em `assets/icons/` foram recortados da imagem de referência. Para usar os PNGs originais em alta
resolução, substitua os arquivos mantendo os nomes (`browser_bg.png`, `browser_fg.png`, …). O REgo compõe
`_bg` + `_fg` num ícone circular automaticamente.

## Estrutura

```
index.html            entrada
js/core/              engine, input (controle 3DoF + braço duplo), UI de vidro, áudio, física, modelos
js/os/                shell (Início, janelas, multitarefa, menu de pausa), apps, kit de jogos, captura
js/games/             62 jogos
assets/icons/         ícones dos apps
```

Adicionar um jogo:

```js
REGO.game({ id: 'meujogo', name: 'Meu Jogo', cat: 'Ação', glyph: '🎮', desc: '...', controls: '...',
  build: function (g) {
    g.env({ sky: 'day', ground: '#5aa864' });
    g.on('press', function (p) { /* gatilho */ });
    g.on('update', function (dt) { /* por frame */ });
    g.hud(); g.round(60);
  } });
```

## Créditos e licenças de terceiros

- [three.js](https://threejs.org) r128 — MIT
- [cannon.js](https://github.com/schteppe/cannon.js) 0.6.2 — MIT
- [webxr-polyfill](https://github.com/immersive-web/webxr-polyfill) 2.0.3 — Apache-2.0
- Modelos e sons: gerados por código neste projeto, domínio público (CC0).
