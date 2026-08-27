const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const SUPPORTED_LANGUAGES = new Set(['pt-BR', 'en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT']);
let currentPreferences = {
  uiScale: 1,
  language: 'system',
  closeBehavior: 'ask',
  systemLocale: 'pt-BR',
  effectiveLanguage: 'pt-BR',
  appVersion: '1.0.0',
};

const phraseRows = [
  ['Arquivo', 'Arquivo', 'File', 'Archivo', 'Fichier', 'Datei', 'File'],
  ['Contatos', 'Contatos', 'Contacts', 'Contactos', 'Contacts', 'Kontakte', 'Contatti'],
  ['Ações', 'Ações', 'Actions', 'Acciones', 'Actions', 'Aktionen', 'Azioni'],
  ['Ferramentas', 'Ferramentas', 'Tools', 'Herramientas', 'Outils', 'Werkzeuge', 'Strumenti'],
  ['Ajuda', 'Ajuda', 'Help', 'Ayuda', 'Aide', 'Hilfe', 'Aiuto'],
  ['Nova Campfire', 'Nova Campfire', 'New Campfire', 'Nueva Campfire', 'Nouvelle Campfire', 'Neue Campfire', 'Nuova Campfire'],
  ['Configurações', 'Configurações', 'Settings', 'Configuración', 'Paramètres', 'Einstellungen', 'Impostazioni'],
  ['Sair da conta', 'Sair da conta', 'Sign out', 'Cerrar sesión', 'Se déconnecter', 'Abmelden', 'Disconnetti'],
  ['Adicionar amigo', 'Adicionar amigo', 'Add friend', 'Añadir amigo', 'Ajouter un ami', 'Freund hinzufügen', 'Aggiungi amico'],
  ['Pedidos de amizade', 'Pedidos de amizade', 'Friend requests', 'Solicitudes de amistad', "Demandes d'ami", 'Freundschaftsanfragen', 'Richieste di amicizia'],
  ['Meus amigos', 'Meus amigos', 'My friends', 'Mis amigos', 'Mes amis', 'Meine Freunde', 'I miei amici'],
  ['Sair da Campfire selecionada', 'Sair da Campfire selecionada', 'Leave selected Campfire', 'Salir de la Campfire seleccionada', 'Quitter la Campfire sélectionnée', 'Ausgewählte Campfire verlassen', 'Lascia la Campfire selezionata'],
  ['Reentrar na Campfire selecionada', 'Reentrar na Campfire selecionada', 'Rejoin selected Campfire', 'Volver a la Campfire seleccionada', 'Rejoindre la Campfire sélectionnée', 'Ausgewählter Campfire wieder beitreten', 'Rientra nella Campfire selezionata'],
  ['Aceitar convite', 'Aceitar convite', 'Accept invite', 'Aceptar invitación', "Accepter l'invitation", 'Einladung annehmen', "Accetta l'invito"],
  ['Recusar convite', 'Recusar convite', 'Decline invite', 'Rechazar invitación', "Refuser l'invitation", 'Einladung ablehnen', "Rifiuta l'invito"],
  ['Sobre o Campfire', 'Sobre o Campfire', 'About Campfire', 'Acerca de Campfire', 'À propos de Campfire', 'Über Campfire', 'Informazioni su Campfire'],
  ['Pesquisar amigos...', 'Pesquisar amigos...', 'Search friends...', 'Buscar amigos...', 'Rechercher des amis...', 'Freunde suchen...', 'Cerca amici...'],
  ['FRIENDS', 'AMIGOS', 'FRIENDS', 'AMIGOS', 'AMIS', 'FREUNDE', 'AMICI'],
  ['Friends', 'Amigos', 'Friends', 'Amigos', 'Amis', 'Freunde', 'Amici'],
  ['CAMPFIRES', 'CAMPFIRES', 'CAMPFIRES', 'CAMPFIRES', 'CAMPFIRES', 'CAMPFIRES', 'CAMPFIRES'],
  ['Nenhum amigo ainda.', 'Nenhum amigo ainda.', 'No friends yet.', 'Aún no hay amigos.', "Pas encore d'amis.", 'Noch keine Freunde.', 'Ancora nessun amico.'],
  ['Mensagens', 'Mensagens', 'Messages', 'Mensajes', 'Messages', 'Nachrichten', 'Messaggi'],
  ['Tela', 'Tela', 'Screen', 'Pantalla', 'Écran', 'Bildschirm', 'Schermo'],
  ['Animes', 'Animes', 'Anime', 'Anime', 'Anime', 'Anime', 'Anime'],
  ['Participantes', 'Participantes', 'Participants', 'Participantes', 'Participants', 'Teilnehmer', 'Partecipanti'],
  ['Leave', 'Sair', 'Leave', 'Salir', 'Quitter', 'Verlassen', 'Esci'],
  ['Campfire acesa!', 'Campfire acesa!', 'Campfire lit!', '¡Campfire encendida!', 'Campfire allumée !', 'Campfire brennt!', 'Campfire accesa!'],
  ['Realtime', 'Tempo real', 'Realtime', 'Tiempo real', 'Temps réel', 'Echtzeit', 'Tempo reale'],
  ['Chat', 'Chat', 'Chat', 'Chat', 'Chat', 'Chat', 'Chat'],
  ['A fogueira está silenciosa.', 'A fogueira está silenciosa.', 'The campfire is quiet.', 'La fogata está en silencio.', 'Le feu de camp est silencieux.', 'Das Lagerfeuer ist still.', 'Il falò è silenzioso.'],
  ['Seja o primeiro a dizer alguma coisa.', 'Seja o primeiro a dizer alguma coisa.', 'Be the first to say something.', 'Sé el primero en decir algo.', 'Soyez le premier à dire quelque chose.', 'Sag als Erster etwas.', 'Sii il primo a dire qualcosa.'],
  ['Escreva uma mensagem...', 'Escreva uma mensagem...', 'Write a message...', 'Escribe un mensaje...', 'Écrivez un message...', 'Nachricht schreiben...', 'Scrivi un messaggio...'],
  ['Enviar', 'Enviar', 'Send', 'Enviar', 'Envoyer', 'Senden', 'Invia'],
  ['Voz da Campfire', 'Voz da Campfire', 'Campfire Voice', 'Voz de Campfire', 'Voix de Campfire', 'Campfire-Sprachchat', 'Voce Campfire'],
  ['Entrar na voz', 'Entrar na voz', 'Join voice', 'Entrar a voz', 'Rejoindre le vocal', 'Sprachchat beitreten', 'Entra in voce'],
  ['Adicionar', 'Adicionar', 'Add', 'Añadir', 'Ajouter', 'Hinzufügen', 'Aggiungi'],
  ['Pedidos', 'Pedidos', 'Requests', 'Solicitudes', 'Demandes', 'Anfragen', 'Richieste'],
  ['Amigos', 'Amigos', 'Friends', 'Amigos', 'Amis', 'Freunde', 'Amici'],
  ['Digite o username exato da pessoa.', 'Digite o username exato da pessoa.', "Enter the person's exact username.", 'Escribe el nombre de usuario exacto.', "Saisissez le nom d'utilisateur exact.", 'Gib den genauen Benutzernamen ein.', "Inserisci l'username esatto."],
  ['Username', 'Username', 'Username', 'Usuario', "Nom d'utilisateur", 'Benutzername', 'Username'],
  ['Enviar pedido', 'Enviar pedido', 'Send request', 'Enviar solicitud', 'Envoyer la demande', 'Anfrage senden', 'Invia richiesta'],
  ['Start a Campfire', 'Criar uma Campfire', 'Start a Campfire', 'Crear una Campfire', 'Créer une Campfire', 'Campfire starten', 'Crea una Campfire'],
  ['Campfire name', 'Nome da Campfire', 'Campfire name', 'Nombre de la Campfire', 'Nom de la Campfire', 'Name der Campfire', 'Nome della Campfire'],
  ['Temporary Campfire', 'Campfire temporária', 'Temporary Campfire', 'Campfire temporal', 'Campfire temporaire', 'Temporäre Campfire', 'Campfire temporanea'],
  ['Será apagada 5 minutos depois que a última pessoa sair.', 'Será apagada 5 minutos depois que a última pessoa sair.', 'It will be deleted 5 minutes after the last person leaves.', 'Se eliminará 5 minutos después de que salga la última persona.', 'Elle sera supprimée 5 minutes après le départ de la dernière personne.', 'Sie wird 5 Minuten nach Verlassen der letzten Person gelöscht.', "Verrà eliminata 5 minuti dopo l'uscita dell'ultima persona."],
  ['Privacy', 'Privacidade', 'Privacy', 'Privacidad', 'Confidentialité', 'Privatsphäre', 'Privacy'],
  ['Private', 'Privada', 'Private', 'Privada', 'Privée', 'Privat', 'Privata'],
  ['Somente convidados.', 'Somente convidados.', 'Invited people only.', 'Solo invitados.', 'Invités uniquement.', 'Nur eingeladene Personen.', 'Solo invitati.'],
  ['Invite Link', 'Link de convite', 'Invite Link', 'Enlace de invitación', "Lien d'invitation", 'Einladungslink', 'Link di invito'],
  ['Entrada por convite.', 'Entrada por convite.', 'Join by invitation.', 'Entrada por invitación.', 'Entrée sur invitation.', 'Beitritt per Einladung.', 'Ingresso su invito.'],
  ['Invite friends', 'Convidar amigos', 'Invite friends', 'Invitar amigos', 'Inviter des amis', 'Freunde einladen', 'Invita amici'],
  ['Cancel', 'Cancelar', 'Cancel', 'Cancelar', 'Annuler', 'Abbrechen', 'Annulla'],
  ['Rejoin Campfire', 'Reentrar na Campfire', 'Rejoin Campfire', 'Volver a Campfire', 'Rejoindre Campfire', 'Campfire wieder beitreten', 'Rientra in Campfire'],
  ['Voz e vídeo', 'Voz e vídeo', 'Voice & video', 'Voz y vídeo', 'Voix et vidéo', 'Sprache & Video', 'Voce e video'],
  ['Aparência e idioma', 'Aparência e idioma', 'Appearance & language', 'Apariencia e idioma', 'Apparence et langue', 'Darstellung & Sprache', 'Aspetto e lingua'],
  ['Interface', 'Interface', 'Interface', 'Interfaz', 'Interface', 'Oberfläche', 'Interfaccia'],
  ['Idioma', 'Idioma', 'Language', 'Idioma', 'Langue', 'Sprache', 'Lingua'],
  ['Usar idioma do Windows', 'Usar idioma do Windows', 'Use Windows language', 'Usar idioma de Windows', 'Utiliser la langue de Windows', 'Windows-Sprache verwenden', 'Usa la lingua di Windows'],
  ['Tamanho da interface', 'Tamanho da interface', 'Interface size', 'Tamaño de la interfaz', "Taille de l'interface", 'Oberflächengröße', "Dimensione dell'interfaccia"],
  ['Restaurar 100%', 'Restaurar 100%', 'Reset to 100%', 'Restaurar 100%', 'Rétablir à 100 %', 'Auf 100 % zurücksetzen', 'Ripristina 100%'],
  ['Ao fechar o Campfire', 'Ao fechar o Campfire', 'When closing Campfire', 'Al cerrar Campfire', 'À la fermeture de Campfire', 'Beim Schließen von Campfire', 'Quando chiudi Campfire'],
  ['Perguntar sempre', 'Perguntar sempre', 'Always ask', 'Preguntar siempre', 'Toujours demander', 'Immer fragen', 'Chiedi sempre'],
  ['Minimizar para a bandeja', 'Minimizar para a bandeja', 'Minimize to tray', 'Minimizar a la bandeja', 'Réduire dans la zone de notification', 'In den Infobereich minimieren', "Riduci nell'area di notifica"],
  ['Fechar completamente', 'Fechar completamente', 'Quit completely', 'Cerrar completamente', 'Quitter complètement', 'Vollständig beenden', 'Chiudi completamente'],
  ['Sair da conta e manter aberto', 'Sair da conta e manter aberto', 'Sign out and keep open', 'Cerrar sesión y mantener abierto', 'Se déconnecter et garder ouvert', 'Abmelden und geöffnet lassen', 'Disconnetti e mantieni aperto'],
  ['Dispositivos', 'Dispositivos', 'Devices', 'Dispositivos', 'Appareils', 'Geräte', 'Dispositivi'],
  ['Microfone', 'Microfone', 'Microphone', 'Micrófono', 'Microphone', 'Mikrofon', 'Microfono'],
  ['Padrão do sistema', 'Padrão do sistema', 'System default', 'Predeterminado del sistema', 'Valeur système', 'Systemstandard', 'Predefinito di sistema'],
  ['Qualidade da webcam', 'Qualidade da webcam', 'Webcam quality', 'Calidad de webcam', 'Qualité de la webcam', 'Webcam-Qualität', 'Qualità webcam'],
  ['Saída de áudio', 'Saída de áudio', 'Audio output', 'Salida de audio', 'Sortie audio', 'Audioausgabe', 'Uscita audio'],
  ['Prévia da webcam', 'Prévia da webcam', 'Webcam preview', 'Vista previa de webcam', 'Aperçu webcam', 'Webcam-Vorschau', 'Anteprima webcam'],
  ['Teste do microfone', 'Teste do microfone', 'Microphone test', 'Prueba de micrófono', 'Test du microphone', 'Mikrofontest', 'Test microfono'],
  ['Permitir e testar', 'Permitir e testar', 'Allow and test', 'Permitir y probar', 'Autoriser et tester', 'Erlauben und testen', 'Consenti e prova'],
  ['Parar teste', 'Parar teste', 'Stop test', 'Detener prueba', 'Arrêter le test', 'Test stoppen', 'Interrompi test'],
  ['Escolha onde navegar', 'Escolha onde navegar', 'Choose where to browse', 'Elige dónde navegar', 'Choisissez où naviguer', 'Wähle eine Quelle', 'Scegli dove navigare'],
  ['Escolha uma fonte para começar.', 'Escolha uma fonte para começar.', 'Choose a source to begin.', 'Elige una fuente para comenzar.', 'Choisissez une source pour commencer.', 'Wähle eine Quelle, um zu beginnen.', 'Scegli una fonte per iniziare.'],
  ['Fechar', 'Fechar', 'Close', 'Cerrar', 'Fermer', 'Schließen', 'Chiudi'],
];

const localeOrder = ['pt-BR', 'en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'];
const phraseTable = new Map();
const reversePhraseTable = new Map();

for (const [source, ...values] of phraseRows) {
  const row = {};
  for (let index = 0; index < localeOrder.length; index += 1) {
    row[localeOrder[index]] = values[index];
    reversePhraseTable.set(values[index], source);
  }
  phraseTable.set(source, row);
  reversePhraseTable.set(source, source);
}

const TRANSLATION_SKIP_SELECTOR = [
  'textarea',
  'input',
  '[contenteditable="true"]',
  '.chatMessage',
  '.chat-message',
  '.messageBody',
  '.message-body',
  '.messageText',
  '.message-text',
  '.username',
  '.friendText strong',
  '.campfireRosterUser',
  '.cfUserName',
  '.dm-message',
].join(',');

function safeLocale(raw) {
  return SUPPORTED_LANGUAGES.has(raw) ? raw : 'en-US';
}

function translateCoreText(core, locale) {
  const canonical = phraseTable.has(core) ? core : reversePhraseTable.get(core);
  if (!canonical) return core;
  return phraseTable.get(canonical)?.[locale] || core;
}

function translateTextValue(value, locale) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const leading = value.match(/^\s*/)?.[0] || '';
  const trailing = value.match(/\s*$/)?.[0] || '';
  const core = value.slice(leading.length, value.length - trailing.length);
  return `${leading}${translateCoreText(core, locale)}${trailing}`;
}

function shouldSkipTranslation(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(element?.closest?.(TRANSLATION_SKIP_SELECTOR));
}

function translateElementAttributes(element, locale) {
  if (!(element instanceof Element) || shouldSkipTranslation(element)) return;
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    if (!element.hasAttribute(attribute)) continue;
    const current = element.getAttribute(attribute);
    const next = translateTextValue(current, locale);
    if (next !== current) element.setAttribute(attribute, next);
  }
}

function translateTree(root, locale) {
  if (!root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    if (!shouldSkipTranslation(root)) {
      const current = root.nodeValue || '';
      const next = translateTextValue(current, locale);
      if (next !== current) root.nodeValue = next;
    }
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElementAttributes(root, locale);
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );

  let node = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!shouldSkipTranslation(node)) {
        const current = node.nodeValue || '';
        const next = translateTextValue(current, locale);
        if (next !== current) node.nodeValue = next;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(node, locale);
    }
    node = walker.nextNode();
  }
}

let translationScheduled = false;
function applyCampfireTranslations(locale = currentPreferences.effectiveLanguage) {
  if (!document.body) return;
  const safe = safeLocale(locale);
  document.documentElement.lang = safe;
  translateTree(document.body, safe);
}

function scheduleTranslation() {
  if (translationScheduled) return;
  translationScheduled = true;
  queueMicrotask(() => {
    translationScheduled = false;
    applyCampfireTranslations();
  });
}

const CLOSE_COPY = {
  'pt-BR': {
    title: '🔥 Vai abandonar a fogueira?',
    subtitle: 'Escolha como você quer sair de cena.',
    quit: '🔥 Apagar a fogueira',
    quitHelp: 'Fecha completamente o Campfire.',
    tray: '🪵 Só vou buscar mais lenha',
    trayHelp: 'Minimiza para a bandeja e deixa as brasas acesas.',
    logout: '🥷 Trocar de aventureiro',
    logoutHelp: 'Sai da conta e volta para o login.',
    cancel: '😅 Foi mal, cliquei no X sem querer',
    remember: 'Lembrar minha escolha',
    footer: 'Nenhuma fogueira foi ferida durante este encerramento.',
  },
  'en-US': {
    title: '🔥 Leaving the campfire?',
    subtitle: 'Choose how you want to make your exit.',
    quit: '🔥 Put out the fire',
    quitHelp: 'Quit Campfire completely.',
    tray: '🪵 Just grabbing more firewood',
    trayHelp: 'Minimize to tray and keep the embers alive.',
    logout: '🥷 Switch adventurer',
    logoutHelp: 'Sign out and return to login.',
    cancel: '😅 Oops, I clicked X by accident',
    remember: 'Remember my choice',
    footer: 'No campfires were harmed during this shutdown.',
  },
  'es-ES': {
    title: '🔥 ¿Vas a abandonar la fogata?',
    subtitle: 'Elige cómo quieres salir de escena.',
    quit: '🔥 Apagar la fogata',
    quitHelp: 'Cierra Campfire por completo.',
    tray: '🪵 Solo voy por más leña',
    trayHelp: 'Minimiza a la bandeja y deja las brasas encendidas.',
    logout: '🥷 Cambiar de aventurero',
    logoutHelp: 'Cierra la sesión y vuelve al inicio.',
    cancel: '😅 Perdón, hice clic en la X',
    remember: 'Recordar mi elección',
    footer: 'Ninguna fogata resultó herida durante este cierre.',
  },
  'fr-FR': {
    title: '🔥 Vous quittez le feu de camp ?',
    subtitle: 'Choisissez comment vous voulez sortir de scène.',
    quit: '🔥 Éteindre le feu',
    quitHelp: 'Ferme complètement Campfire.',
    tray: '🪵 Je vais juste chercher du bois',
    trayHelp: 'Réduit dans la zone de notification et garde les braises.',
    logout: "🥷 Changer d'aventurier",
    logoutHelp: 'Se déconnecte et revient à la connexion.',
    cancel: "😅 Oups, j'ai cliqué sur X",
    remember: 'Mémoriser mon choix',
    footer: "Aucun feu de camp n'a été blessé pendant cette fermeture.",
  },
  'de-DE': {
    title: '🔥 Verlässt du das Lagerfeuer?',
    subtitle: 'Wähle, wie du die Szene verlassen möchtest.',
    quit: '🔥 Feuer löschen',
    quitHelp: 'Campfire vollständig beenden.',
    tray: '🪵 Ich hole nur mehr Brennholz',
    trayHelp: 'In den Infobereich minimieren und die Glut erhalten.',
    logout: '🥷 Abenteurer wechseln',
    logoutHelp: 'Abmelden und zum Login zurückkehren.',
    cancel: '😅 Ups, ich habe aus Versehen auf X geklickt',
    remember: 'Meine Auswahl merken',
    footer: 'Bei diesem Beenden wurde kein Lagerfeuer verletzt.',
  },
  'it-IT': {
    title: '🔥 Abbandoni il falò?',
    subtitle: 'Scegli come vuoi uscire di scena.',
    quit: '🔥 Spegni il fuoco',
    quitHelp: 'Chiude completamente Campfire.',
    tray: '🪵 Vado solo a prendere altra legna',
    trayHelp: 'Riduce nell’area di notifica e lascia vive le braci.',
    logout: '🥷 Cambia avventuriero',
    logoutHelp: 'Disconnette l’account e torna al login.',
    cancel: '😅 Ops, ho cliccato la X per sbaglio',
    remember: 'Ricorda la mia scelta',
    footer: 'Nessun falò è stato maltrattato durante questa chiusura.',
  },
};

function removeClosePrompt() {
  document.getElementById('campfire-close-prompt-root')?.remove();
}

function showClosePrompt(preferences = currentPreferences) {
  if (!document.body) return;
  removeClosePrompt();

  const locale = safeLocale(preferences?.effectiveLanguage || currentPreferences.effectiveLanguage);
  const copy = CLOSE_COPY[locale];

  const root = document.createElement('div');
  root.id = 'campfire-close-prompt-root';
  root.innerHTML = `
    <style>
      #campfire-close-prompt-root{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(2,3,5,.76);backdrop-filter:blur(8px);font-family:"Segoe UI",Arial,sans-serif;color:#f3f6f8}
      #campfire-close-prompt-root *{box-sizing:border-box}
      #campfire-close-prompt-root .cf-close-card{width:min(560px,94vw);overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:linear-gradient(180deg,#272c34,#111419 45%,#090b0e);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 28px 80px rgba(0,0,0,.62)}
      #campfire-close-prompt-root .cf-close-head{padding:20px 22px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.01))}
      #campfire-close-prompt-root h2{margin:0;font-size:22px;line-height:1.2}
      #campfire-close-prompt-root .cf-close-head p{margin:7px 0 0;color:#b7c0ca;font-size:14px}
      #campfire-close-prompt-root .cf-close-options{display:grid;gap:9px;padding:16px}
      #campfire-close-prompt-root .cf-close-option{display:grid;gap:4px;width:100%;padding:13px 15px;text-align:left;border:1px solid rgba(255,255,255,.10);border-radius:11px;background:linear-gradient(180deg,#262b33,#14181d);color:#f2f5f8;cursor:pointer}
      #campfire-close-prompt-root .cf-close-option:hover,#campfire-close-prompt-root .cf-close-option:focus-visible{outline:none;border-color:rgba(255,165,95,.5);box-shadow:0 0 0 2px rgba(255,154,73,.10)}
      #campfire-close-prompt-root .cf-close-option strong{font-size:15px}
      #campfire-close-prompt-root .cf-close-option span{color:#aeb8c2;font-size:12px}
      #campfire-close-prompt-root .cf-close-cancel{border-color:rgba(104,167,255,.22)}
      #campfire-close-prompt-root .cf-close-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:13px 17px;border-top:1px solid rgba(255,255,255,.08);color:#aab4be;font-size:12px}
      #campfire-close-prompt-root label{display:flex;align-items:center;gap:8px;cursor:pointer}
      #campfire-close-prompt-root input{accent-color:#e58a42}
      #campfire-close-prompt-root small{opacity:.72}
    </style>
    <section class="cf-close-card" role="dialog" aria-modal="true" aria-labelledby="campfire-close-title">
      <div class="cf-close-head">
        <h2 id="campfire-close-title">${copy.title}</h2>
        <p>${copy.subtitle}</p>
      </div>
      <div class="cf-close-options">
        <button class="cf-close-option" data-action="quit"><strong>${copy.quit}</strong><span>${copy.quitHelp}</span></button>
        <button class="cf-close-option" data-action="tray"><strong>${copy.tray}</strong><span>${copy.trayHelp}</span></button>
        <button class="cf-close-option" data-action="logout"><strong>${copy.logout}</strong><span>${copy.logoutHelp}</span></button>
        <button class="cf-close-option cf-close-cancel" data-action="cancel"><strong>${copy.cancel}</strong></button>
      </div>
      <div class="cf-close-footer">
        <label><input id="campfire-close-remember" type="checkbox"> <span>${copy.remember}</span></label>
        <small>${copy.footer}</small>
      </div>
    </section>
  `;

  const finish = async (action) => {
    const remember = Boolean(root.querySelector('#campfire-close-remember')?.checked);
    removeClosePrompt();
    await ipcRenderer.invoke('desktop:close-action', { action, remember });
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-action]');
    if (!button) return;
    void finish(button.getAttribute('data-action') || 'cancel');
  });

  const keyHandler = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    document.removeEventListener('keydown', keyHandler, true);
    void finish('cancel');
  };
  document.addEventListener('keydown', keyHandler, true);

  document.body.appendChild(root);
  root.querySelector('[data-action="tray"]')?.focus();
}

async function refreshDesktopPreferences() {
  try {
    currentPreferences = {
      ...currentPreferences,
      ...(await ipcRenderer.invoke('desktop:get-preferences')),
    };
    applyCampfireTranslations(currentPreferences.effectiveLanguage);
  } catch (error) {
    console.warn('[Campfire preferences]', error);
  }
}

ipcRenderer.on('campfire:preferences-changed', (_event, preferences) => {
  currentPreferences = { ...currentPreferences, ...(preferences || {}) };
  applyCampfireTranslations(currentPreferences.effectiveLanguage);
  window.dispatchEvent(new CustomEvent('campfire-desktop-preferences-changed', {
    detail: currentPreferences,
  }));
});

ipcRenderer.on('campfire:close-request', (_event, preferences) => {
  currentPreferences = { ...currentPreferences, ...(preferences || {}) };
  showClosePrompt(currentPreferences);
});

ipcRenderer.on('campfire:logout-request', () => {
  window.dispatchEvent(new CustomEvent('campfire-desktop-logout-request'));
});

document.addEventListener('DOMContentLoaded', () => {
  void refreshDesktopPreferences();

  const observer = new MutationObserver(() => scheduleTranslation());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label', 'placeholder'],
  });
});

contextBridge.exposeInMainWorld('campfireDesktop', {
  app: {
    onAuthCallback: (callback) => on('campfire-auth-callback', callback),
  },
  desktop: {
    getPreferences: () => ipcRenderer.invoke('desktop:get-preferences'),
    updatePreferences: async (patch) => {
      const result = await ipcRenderer.invoke('desktop:update-preferences', patch || {});
      currentPreferences = { ...currentPreferences, ...(result || {}) };
      return result;
    },
    closeAction: (action, remember = false) => ipcRenderer.invoke('desktop:close-action', { action, remember }),
    onPreferencesChanged: (callback) => on('campfire:preferences-changed', callback),
    onLogoutRequest: (callback) => on('campfire:logout-request', callback),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', String(url || '')),
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:write-text', String(text ?? '')),
  },
  window: {
    show: () => ipcRenderer.invoke('window:show'),
    unminimize: () => ipcRenderer.invoke('window:unminimize'),
    focus: () => ipcRenderer.invoke('window:focus'),
    setFullscreen: (enabled) => ipcRenderer.invoke('window:set-fullscreen', Boolean(enabled)),
  },
  anime: {
    create: (payload) => ipcRenderer.invoke('anime:create', payload),
    close: (label) => ipcRenderer.invoke('anime:close', label),
    hide: (label) => ipcRenderer.invoke('anime:hide', label),
    show: (label) => ipcRenderer.invoke('anime:show', label),
    focus: (label) => ipcRenderer.invoke('anime:focus', label),
    setBounds: (label, bounds) => ipcRenderer.invoke('anime:set-bounds', label, bounds),
    getUrl: (label) => ipcRenderer.invoke('anime:get-url', label),
    eval: (label, script) => ipcRenderer.invoke('anime:eval', label, script),
  },
  screen: {
    setPreference: (mode) => ipcRenderer.invoke('screen:set-preference', mode),
  },
  watch: {
    prepareAnimeCapture: () => ipcRenderer.invoke('watch:prepare-anime-capture'),
    stopAnimeCapture: () => ipcRenderer.invoke('watch:stop-anime-capture'),
  },
});
