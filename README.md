# Campfire

**Campfire** é um aplicativo de comunicação para Windows e Linux que reúne Campfires, amizades, chat, voz, webcam, compartilhamento de tela e Watch Together com a interface atual **Simple Dark**.

## Campfire Voice Pro

O sistema de voz usa LiveKit/Opus e oferece perfis **Voz limpa**, **Supressão forte** com RNNoise/WASM local e **Studio / Hi-Fi**, além de troca de dispositivo em tempo real, mute, deafen, controle de ganho e teste local de microfone.

## Tecnologia

- Electron
- React + TypeScript
- Vite
- Supabase
- LiveKit
- Web Audio API

## Desenvolvimento

```bash
npm ci
npm run dev
```

Verificação completa:

```bash
npm run verify
```

Gerar o instalador Windows em uma máquina Windows:

```text
BUILD_CAMPFIRE_RELEASE.bat
```

Os artefatos oficiais da versão 1.1.0 são:

```text
release/Campfire-Setup-1.1.0-x64.exe
release/Campfire-Portable-1.1.0-x64.exe
release/Campfire-1.1.0-linux-x86_64.rpm
release/Campfire-1.1.0-linux-x86_64.AppImage
```

## Site

O site estático fica em `website/` e é publicado no Cloudflare Pages. Para testar localmente:

```text
TESTAR_SITE_CAMPFIRE_FINAL.bat
```

## Download

Use a seção **Releases** deste repositório para obter a versão estável e o SHA-256 correspondente.

## Autoria

Criado e desenvolvido por **Deivison Santos / @devsaex**.

## Licença

Nenhuma licença de código aberto é concedida por este repositório, salvo se um arquivo `LICENSE` for adicionado explicitamente.
