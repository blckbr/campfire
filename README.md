# Campfire Black Piano

**Campfire** é um aplicativo desktop de comunicação para Windows que reúne Campfires, amizades, chat, voz, webcam, compartilhamento de tela e Watch Together em uma interface própria chamada **Black Piano**.

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

O artefato esperado é:

```text
release/Campfire-Black-Piano-Setup-1.0.0.exe
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
