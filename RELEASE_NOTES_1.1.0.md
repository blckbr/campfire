# Campfire 1.1.0

Campfire 1.1.0 consolida a linha R6.6.6.15 como base pública atual e amplia a distribuição oficial para Windows e Linux x86_64.

## Downloads

- **Windows Setup x64** — instalador NSIS.
- **Windows Portable x64** — executável portátil.
- **Linux RPM x86_64** — pacote voltado à família RPM, incluindo Red Hat Enterprise Linux, Rocky Linux, AlmaLinux e Fedora.
- **Linux AppImage x86_64** — alternativa portátil para distribuições Linux compatíveis.

Cada binário é publicado acompanhado de um arquivo `.sha256.txt` para verificação de integridade.

## Destaques da 1.1.0

- Visual atual **Simple Dark** consolidado a partir da R6.6.6.15.
- CampfireWeb alinhado ao aplicativo atual e publicado em `campfireweb.pages.dev`.
- Site público atualizado em `campfire-br.pages.dev` com downloads para Windows e Linux.
- Fluxo Google/Supabase do CampfireWeb corrigido para PKCE e retorno OAuth sem loop para a tela de login.
- Campfires, amigos, chat em tempo real, Voice Pro via LiveKit, webcam, compartilhamento de tela e Watch Together preservados.
- Janelas destacáveis de Conversa, Animes e Tela, controles de áudio/microfone e comportamento de Escape preservados.
- Sistema de imagens de notícias com resolução/fallback mais resiliente e proteção do endpoint Web.
- Som de encerramento da fogueira e demais regressões aprovadas da linha R6.6.6.x preservados.

## Integridade e plataformas

A release usa builds separados por plataforma. O pacote RPM é construído em ambiente Linux x86_64 e inspecionado como RPM; o AppImage é verificado como executável x86_64. Os binários Windows são gerados com Electron Builder para x64.

Criado e desenvolvido por **Deivison Santos / @devsaex**.
