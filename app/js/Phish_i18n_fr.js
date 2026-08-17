/* Phish — French strings (loaded at startup). */
(function() {
    "use strict";
    var FR = {
        // Navigation
        "nav.dashboard": "Tableau de bord",
        "nav.campaigns": "Campagnes",
        "nav.templates": "Modèles d'email",
        "nav.landings": "Pages web",
        "nav.groups": "Groupes & cibles",
        "nav.settings": "Profils SMTP & paramètres",

        // Dashboard
        "dashboard.title": "Tableau de bord",
        "dashboard.empty": "Aucune campagne lancée pour le moment. Le tableau de bord affichera les KPIs (envois, ouvertures, clics, soumissions, signalements) dès qu'une campagne sera en cours.",
        "dashboard.kpi.campaigns": "Campagnes",
        "dashboard.kpi.active": "actives",
        "dashboard.funnel": "Entonnoir",
        "dashboard.timeline": "Activité — 30 derniers jours",
        "dashboard.top_targets": "Cibles les plus exposées",
        "dashboard.top_targets_hint": "Utiles pour cibler la sensibilisation complémentaire.",
        "dashboard.recent": "Campagnes récentes",
        "dashboard.no_top_targets": "Aucun clic détecté pour le moment.",
        "dashboard.col.campaigns": "Campagnes",

        // Campaigns
        "campaigns.title": "Campagnes",
        "campaigns.new": "Nouvelle campagne",
        "campaigns.empty": "Aucune campagne pour le moment.",
        "campaigns.col.name": "Nom",
        "campaigns.col.status": "Statut",
        "campaigns.col.launch": "Lancement",
        "campaigns.col.targets": "Cibles",
        "campaigns.col.rate": "Taux click",
        "campaigns.form.name": "Nom de la campagne",
        "campaigns.form.sending_profile": "Profil SMTP",
        "campaigns.form.template": "Modèle d'email",
        "campaigns.form.landing": "Page web",
        "campaigns.form.group": "Groupe de cibles",
        "campaigns.form.url": "URL de base (sera utilisée pour {{.URL}} / {{.TrackingURL}})",
        "campaigns.form.launch_date": "Date de lancement (optionnel)",
        "campaigns.form.missing_deps": "Créez au moins un profil SMTP, un modèle, une page et un groupe avant de créer une campagne.",
        "campaigns.edit": "Modifier la campagne",
        "campaigns.delete": "Supprimer la campagne",
        "campaigns.view": "Voir les résultats",
        "campaigns.launch": "Lancer",
        "campaigns.cancel": "Annuler",
        "campaigns.saved": "Campagne enregistrée",
        "campaigns.deleted": "Campagne supprimée",
        "campaigns.launched": "Campagne lancée",
        "campaigns.cancelled": "Campagne annulée",
        "campaigns.confirm_launch": "Lancer la campagne ?",
        "campaigns.confirm_launch_msg": "Les e-mails seront envoyés immédiatement à toutes les cibles du groupe. Cette action est définitive.",
        "campaigns.confirm_cancel": "Annuler la campagne ?",
        "campaigns.confirm_cancel_msg": "Les envois en cours seront stoppés. Les e-mails déjà envoyés ne peuvent pas être rappelés.",
        "campaigns.no_results": "Aucun résultat",
        "campaigns.no_events": "Aucun événement",
        "campaigns.results": "Résultats",
        "campaigns.events": "Journal d'événements",
        "campaigns.refresh": "Rafraîchir",
        "campaigns.back": "Campagnes",
        "campaigns.declare_report": "Déclarer un signalement",
        "campaigns.declare_btn": "Déclarer",
        "campaigns.rep_user": "Utilisateur",
        "campaigns.rep_search": "Rechercher un utilisateur…",
        "campaigns.rep_when": "Date et heure du signalement",
        "campaigns.rep_pick": "Sélectionnez un utilisateur",
        "campaigns.reported_ok": "Signalement enregistré",
        "m365.title": "Connecteur Microsoft 365",
        "m365.help": "Vérifie toutes les 5 min, pendant une campagne active, les signalements remontés à Microsoft Defender et marque comme « signalé » les cibles concernées. Nécessite une app Azure AD avec la permission applicative ThreatSubmission.Read.All. Fonctionne quand les « paramètres de signalement utilisateur » de Defender envoient les signalements à Microsoft (réglage par défaut).",
        "m365.tenant": "ID de locataire (tenant)",
        "m365.client": "ID d'application (client)",
        "m365.secret": "Secret client",
        "m365.secret_set": "Secret enregistré — laisser vide pour conserver",
        "m365.secret_ph": "Valeur du secret client Azure",
        "m365.enabled": "Activer le connecteur",
        "m365.poll_now": "Vérifier maintenant",
        "m365.last_poll": "Dernière vérification",
        "m365.saved": "Connecteur M365 enregistré",
        "m365.polling": "Vérification en cours…",
        "m365.poll_done": "Vérification terminée",
        "m365.matches": "signalement(s)",
        "m365.poll_fail": "Échec de la vérification",
        "bulk.selected": "{n} sélectionné(s)",
        "bulk.delete": "Supprimer",
        "bulk.delete_q": "Supprimer les {n} élément(s) sélectionné(s) ?",
        "bulk.deleted": "Élément(s) supprimé(s)",
        "dashboard.timeline_unit": "Nombre d'événements par jour",
        "settings.drawer_title": "Réglages",
        "settings.language": "Langue",
        "settings.ai_section": "Assistant IA",
        "settings.timezone": "Fuseau horaire",
        "settings.tz_browser": "Navigateur",
        "settings.tz_saved": "Fuseau horaire enregistré",
        "help.tab_methodo": "Méthodologie",
        "help.tab_usage": "Utilisation",
        "help.methodo": ""
            + "<h1>Méthodologie — préparer une campagne</h1>"
            + "<p>Une campagne de simulation d'hameçonnage se prépare <strong>en amont</strong>, en dehors de l'application. Réunissez ces prérequis avant de configurer la campagne dans Phish.</p>"
            + "<h2>Autorisation préalable</h2>"
            + "<p>Ne lancez une campagne qu'avec l'accord écrit des parties prenantes (direction, RH, juridique). Phish est un outil de sensibilisation autorisée, pas d'attaque.</p>"
            + "<h2>Une adresse capable d'envoyer les emails</h2>"
            + "<p>Vous devez disposer d'une <strong>adresse email d'expédition</strong> et d'un <strong>serveur SMTP</strong> capable d'envoyer les emails de la campagne : relais de messagerie interne, compte dédié, ou service d'envoi tiers. Ce relais est renseigné dans le profil SMTP (Réglages). Sans relais d'envoi fonctionnel, aucune campagne ne peut partir. Privilégiez un domaine d'expédition que vous contrôlez et cohérent avec le scénario.</p>"
            + "<h2>S'assurer que les emails ne seront pas bloqués</h2>"
            + "<p>Les protections anti-spam et les passerelles de messagerie peuvent bloquer les emails de simulation ou les classer en indésirable, ce qui fausse la campagne. Avant de lancer :</p>"
            + "<ul>"
            + "<li>autorisez le <strong>domaine</strong> et l'<strong>adresse IP d'envoi</strong> sur la passerelle de messagerie de l'organisation ;</li>"
            + "<li>prévenez l'équipe messagerie et sécurité pour éviter un blocage ou une mise en quarantaine en cours de campagne ;</li>"
            + "<li>envoyez un email de test vers quelques boîtes réelles et vérifiez la bonne réception.</li>"
            + "</ul>"
            + "<h2>Cas Microsoft 365</h2>"
            + "<p>Si les cibles sont sur Microsoft 365, Defender doit être préparé spécifiquement. Sans cela les emails sont filtrés et — surtout — la fonctionnalité <strong>Liens fiables (Safe Links)</strong> réécrit les URL et les <em>pré-ouvre dans un bac à sable</em> : cela enregistre des clics et des ouvertures que personne n'a réellement faits et <strong>fausse les statistiques</strong>.</p>"
            + "<h3>La politique de remise avancée</h3>"
            + "<p>Microsoft fournit un mécanisme officiel pour déclarer une simulation d'hameçonnage tierce : la <strong>politique de remise avancée</strong> (Advanced delivery).</p>"
            + "<ol>"
            + "<li>Ouvrez le portail Microsoft Defender (security.microsoft.com).</li>"
            + "<li>Allez dans <strong>Email et collaboration → Stratégies et règles → Stratégies de menace → Remise avancée</strong>.</li>"
            + "<li>Onglet <strong>Simulation d'hameçonnage</strong>, puis <strong>Ajouter</strong>.</li>"
            + "<li>Renseignez les trois éléments :"
            + "<ul>"
            + "<li><strong>Domaine</strong> — le ou les domaines de l'adresse d'expédition de votre profil SMTP.</li>"
            + "<li><strong>IP d'envoi</strong> — l'adresse IP publique du relais qui envoie la campagne.</li>"
            + "<li><strong>URL de simulation à autoriser</strong> — les URL de tracking de cette instance Phish (par exemple <code>phish.votredomaine.com/*</code>, ou l'URL de base de la campagne suivie de <code>/track/*</code>). C'est ce point qui empêche Safe Links de réécrire et de pré-ouvrir les liens.</li>"
            + "</ul>"
            + "</li>"
            + "<li>Enregistrez. La propagation peut prendre une trentaine de minutes : configurez la politique <strong>avant</strong> de lancer la campagne.</li>"
            + "</ol>"
            + "<p>Effet : les messages couverts ne sont plus filtrés (ni bloqués, ni placés en indésirables), Safe Links ne réécrit ni ne détone les URL, Pièces jointes fiables ne détone pas les pièces jointes, et la purge automatique (ZAP) ne les supprime pas.</p>"
            + "<h3>Vérification</h3>"
            + "<p>Envoyez un email de test vers une boîte M365 réelle. Dans le message reçu, vérifiez que le lien de tracking n'est <strong>pas</strong> réécrit en <code>*.safelinks.protection.outlook.com</code>. S'il l'est encore, l'URL n'est pas correctement déclarée dans la remise avancée.</p>"
            + "<h3>Signalements</h3>"
            + "<p>Une fois la simulation déclarée, les signalements des utilisateurs (bouton « Signaler un hameçonnage » d'Outlook) sont enregistrés par Defender. C'est ce que lit le connecteur M365 (Réglages), qui marque automatiquement les cibles ayant signalé.</p>"
            + "<h2>Déroulé d'une campagne</h2>"
            + "<p>Une fois ces prérequis réunis, la campagne se construit dans cet ordre : profil SMTP → modèle d'email → page web → groupe de cibles → campagne → lancement → suivi. Le détail de chaque étape figure dans l'onglet <strong>Utilisation</strong>.</p>",
        "help.usage": ""
            + "<h1>Utilisation de Phish</h1>"
            + "<p>Une fois la campagne préparée (voir l'onglet <strong>Méthodologie</strong>), suivez ces étapes dans l'ordre.</p>"
            + "<h2>1. Profil SMTP</h2>"
            + "<p>Dans <strong>Réglages</strong>, créez un profil SMTP : le relais qui enverra les emails (hôte, identifiants, adresse d'expédition). Le bouton « Tester » valide l'envoi.</p>"
            + "<h2>2. Modèle d'email</h2>"
            + "<p>Dans <strong>Modèles</strong>, rédigez l'email d'hameçonnage. Le sujet et le corps acceptent des <strong>placeholders</strong> remplacés pour chaque cible au moment de l'envoi :</p>"
            + "<ul>"
            + "<li><code>{{.FirstName}}</code>, <code>{{.LastName}}</code>, <code>{{.Email}}</code>, <code>{{.Position}}</code> — personnalisent le message (ex. « Bonjour {{.FirstName}}, »).</li>"
            + "<li><code>{{.URL}}</code> — <strong>le lien tracké</strong>. Placez-le dans un lien : <code>&lt;a href=&quot;{{.URL}}&quot;&gt;…&lt;/a&gt;</code>. C'est ce lien qui mène à la page web et enregistre le clic. <strong>Sans <code>{{.URL}}</code>, aucun clic n'est mesuré.</strong></li>"
            + "<li><code>{{.TrackingURL}}</code> — le pixel de suivi d'ouverture. Optionnel : si vous ne le placez pas vous-même, un pixel invisible est ajouté automatiquement avant <code>&lt;/body&gt;</code>.</li>"
            + "</ul>"
            + "<p>Renseignez aussi la version <strong>texte brut</strong> (repli pour les clients sans HTML) en y incluant au moins <code>{{.URL}}</code>. L'assistant IA peut générer un scénario complet ; le bouton « Aperçu » montre le rendu HTML.</p>"
            + "<h2>3. Page web</h2>"
            + "<p>Dans <strong>Pages web</strong>, créez la page affichée quand la cible clique le lien. Rédigez-la à la main ou <strong>clonez une page existante</strong> en saisissant son URL (le rendu JavaScript est capturé puis les scripts sont retirés). Basculez « Code » / « Aperçu » pour vérifier le rendu.</p>"
            + "<p><strong>Pour que la page fonctionne correctement :</strong></p>"
            + "<ul>"
            + "<li><strong>Affichage</strong> — une page clonée charge images, CSS et polices du site d'origine grâce à une balise <code>&lt;base&gt;</code> insérée automatiquement en tête du document. Ne la supprimez pas, sinon le style ne se charge plus.</li>"
            + "<li><strong>Capture du formulaire</strong> — pour mesurer une soumission, le formulaire doit avoir <code>action=&quot;{{.SubmitURL}}&quot;</code> et <code>method=&quot;POST&quot;</code>. Le clonage le câble automatiquement ; sur une page écrite à la main, ajoutez-le vous-même. Cochez « Exposer un formulaire ».</li>"
            + "<li><strong>Confidentialité</strong> — à la soumission, le backend n'enregistre que le <strong>nom et la longueur</strong> de chaque champ, jamais les valeurs saisies.</li>"
            + "<li><strong>Personnalisation</strong> — la page accepte aussi <code>{{.FirstName}}</code>, <code>{{.LastName}}</code>, <code>{{.Email}}</code>.</li>"
            + "<li><strong>Redirection</strong> — renseignez une « URL de redirection » pour envoyer la cible vers une page de débriefing après la soumission.</li>"
            + "</ul>"
            + "<h2>4. Groupe et cibles</h2>"
            + "<p>Dans <strong>Groupes</strong>, créez un groupe et importez les cibles (CSV ou copier-coller : email, prénom, nom, poste).</p>"
            + "<h2>5. Campagne</h2>"
            + "<p>Dans <strong>Campagnes</strong>, associez profil SMTP, modèle, page et groupe, renseignez l'<strong>URL de base</strong> (l'adresse publique de cette instance, utilisée dans les liens trackés), puis lancez.</p>"
            + "<h2>6. Suivi</h2>"
            + "<p>Cliquez sur une campagne pour ouvrir son tableau de bord : entonnoir (envoyé, ouvert, cliqué, soumis, signalé), <strong>timeline</strong> du déroulé (cliquez un point pour le détail d'une action), tableau des résultats et journal. Le bouton « Signaler » de chaque cible déclare un signalement reçu hors-ligne. Export CSV disponible.</p>"
            + "<h2>Confidentialité</h2>"
            + "<p>Phish ne stocke jamais les identifiants saisis par les cibles — seuls le nombre et la longueur des champs sont comptabilisés.</p>",
        "campaigns.timeline": "Déroulé de la campagne",
        "campaigns.timeline_empty": "Aucune action des cibles pour le moment.",
        "campaigns.timeline_hint": "Cliquez un point pour voir le détail de l'action.",
        "campaigns.unknown_user": "Utilisateur inconnu",
        "campaigns.tl.user": "Utilisateur",
        "campaigns.tl.action": "Action",
        "campaigns.tl.time": "Heure",
        "campaigns.tl.detail_title": "Détail de l'action",
        "events.created": "Campagne créée",
        "events.sent": "Email envoyé",
        "events.send_error": "Échec d'envoi",
        "events.opened": "Email ouvert",
        "events.clicked": "Lien cliqué",
        "events.submitted": "Données soumises",
        "events.reported": "Email signalé",
        "campaigns.status.queued": "En attente",
        "campaigns.status.in_progress": "En cours",
        "campaigns.status.completed": "Terminée",
        "campaigns.status.cancelled": "Annulée",
        "campaigns.result.scheduled": "Programmé",
        "campaigns.result.sending": "Envoi…",
        "campaigns.result.sent": "Envoyé",
        "campaigns.result.send_failed": "Échec d'envoi",
        "campaigns.result.opened": "Ouvert",
        "campaigns.result.clicked": "Cliqué",
        "campaigns.result.submitted": "Formulaire soumis",
        "campaigns.result.reported": "Signalé",
        "campaigns.col.email": "Email",
        "campaigns.col.send_date": "Envoi",
        "campaigns.col.open_date": "Ouverture",
        "campaigns.col.click_date": "Clic",
        "campaigns.col.submit_date": "Soumission",
        "campaigns.col.report_date": "Signalement",
        "campaigns.col.event": "Événement",
        "campaigns.col.time": "Date",
        "campaigns.col.details": "Détails",

        // Templates
        "templates.title": "Modèles d'email",
        "templates.new": "Nouveau modèle",
        "templates.empty": "Les modèles d'email seront éditables en P3.",
        "templates.col.name": "Nom",
        "templates.col.subject": "Sujet",
        "templates.col.updated": "Mis à jour",

        // Landings
        "landings.title": "Pages web",
        "landings.new": "Nouvelle page",
        "landings.empty": "Aucune page web pour le moment.",
        "landings.no_password": "Note de conception : même quand une page expose un formulaire, le backend ne stocke jamais les valeurs saisies — seulement la liste des champs et leur longueur.",
        "landings.col.name": "Nom",
        "landings.col.capture": "Capture formulaire",
        "landings.col.redirect": "Redirection",

        // Groups
        "groups.title": "Groupes & cibles",
        "groups.new": "Nouveau groupe",
        "groups.empty": "Création et import CSV des groupes seront ajoutés en P3.",
        "groups.col.name": "Nom",
        "groups.col.size": "Nombre de cibles",
        "groups.col.updated": "Mis à jour",

        // Settings
        "settings.title": "Profils SMTP & paramètres",
        "settings.empty": "Les profils SMTP et la configuration des relais seront ajoutés en P3.",
        "settings.col.name": "Nom",
        "settings.col.from": "From",
        "settings.col.host": "Hôte SMTP",

        // Toolbar
        "menu_file": "Fichier",

        // Common
        "common.actions": "Actions",
        "common.edit": "Modifier",
        "common.delete": "Supprimer",
        "common.delete_q": "Supprimer",
        "common.save": "Enregistrer",
        "common.cancel": "Annuler",
        "common.close": "Fermer",
        "common.error": "Erreur",
        "common.required_fields": "Champs requis manquants",
        "common.yes": "Oui",
        "common.no": "Non",

        // Templates — form
        "templates.html": "HTML",
        "templates.html_hint": "placeholders: {{.FirstName}} {{.LastName}} {{.Email}} {{.URL}} {{.TrackingURL}}",
        "templates.text": "Texte brut (fallback)",
        "templates.edit": "Modifier le modèle",
        "templates.delete": "Supprimer le modèle",
        "templates.saved": "Modèle enregistré",
        "templates.deleted": "Modèle supprimé",

        // Landings — form
        "landings.html": "HTML de la page",
        "landings.edit": "Modifier la page",
        "landings.delete": "Supprimer la page",
        "landings.saved": "Page enregistrée",
        "landings.deleted": "Page supprimée",
        "landings.import.label": "Cloner une page existante",
        "landings.import.hint": "Saisissez l'URL d'une page réelle pour copier son code HTML ci-dessous. À des fins de sensibilisation autorisée uniquement.",
        "landings.import.btn": "Importer le HTML",
        "landings.import.loading": "Rendu de la page en cours… (quelques secondes)",
        "landings.import.done": "Page importée — scripts neutralisés, formulaire câblé pour la capture. Relisez avant d'enregistrer.",
        "landings.import.url_required": "Saisissez une URL à cloner.",
        "editor.code": "Code",
        "editor.preview": "Aperçu",

        // Groups — form + CSV
        "groups.edit": "Modifier le groupe",
        "groups.delete": "Supprimer le groupe",
        "groups.view": "Voir les cibles",
        "groups.saved": "Groupe enregistré",
        "groups.deleted": "Groupe supprimé",
        "groups.targets": "cibles",
        "groups.no_targets": "Aucune cible",
        "groups.csv": "Coller un CSV (optionnel)",
        "groups.csv_hint": "En-tête requise : email,first_name,last_name,position. Séparateur ',' ou ';'.",
        "groups.csv_error": "CSV invalide",
        "groups.csv_empty": "Aucune ligne valide",
        "groups.import_csv": "Importer CSV",
        "groups.import": "Importer",
        "groups.imported": "Cibles importées",
        "groups.replace": "Remplacer les cibles existantes",
        "groups.target_deleted": "Cible supprimée",
        "groups.col_first": "Prénom",
        "groups.col_last": "Nom",
        "groups.col_position": "Poste",

        // Settings (sending profiles) — form
        "settings.new": "Nouveau profil SMTP",
        "settings.edit": "Modifier le profil SMTP",
        "settings.delete": "Supprimer le profil SMTP",
        "settings.delete_q": "Supprimer",
        "settings.saved": "Profil SMTP enregistré",
        "settings.deleted": "Profil supprimé",
        "settings.username": "Utilisateur",
        "settings.password": "Mot de passe",
        "settings.password_set": "Défini — laisser vide pour conserver",
        "settings.ignore_cert": "Ignorer les erreurs de certificat",

        // AI assistant
        "ai.button": "Générer avec l'IA",
        "ai.generate": "Générer",
        "ai.template_title": "Assistant IA — modèle d'email",
        "ai.template_hint": "Renseignez le contexte du scénario. Plus c'est précis, meilleur sera le rendu. Le contenu sera marqué exercice de formation.",
        "ai.landing_title": "Assistant IA — page web",
        "ai.landing_hint": "Renseignez le contexte de la page. Si un formulaire est exposé, son action sera {{.SubmitURL}} et le backend ne stockera jamais les valeurs.",

        // AI form fields
        "ai.field.scenario": "Scénario",
        "ai.field.scenario_ph": "Ex: faux email d'alerte sécurité demandant de vérifier la session d'un utilisateur via un portail interne.",
        "ai.field.landing_scenario_ph": "Ex: portail interne demandant à l'utilisateur de revalider son mot de passe pour accéder à un document RH.",
        "ai.field.persona": "Persona de l'expéditeur",
        "ai.field.tone": "Ton",
        "ai.field.action": "Action attendue",
        "ai.field.difficulty": "Niveau de difficulté",
        "ai.field.audience": "Public cible (optionnel)",
        "ai.field.audience_ph": "Ex: équipe finance, tous les salariés, équipe IT",
        "ai.field.attachment": "Mentionner une pièce jointe (ex: facture, rapport)",
        "ai.field.page_type": "Type de page",
        "ai.field.brand_style": "Style visuel",
        "ai.field.with_form": "Inclure un formulaire (action = {{.SubmitURL}})",
        "ai.field.form_fields": "Champs du formulaire (optionnel)",
        "ai.field.form_fields_ph": "Ex: email, password — ou first_name, last_name, otp",
        "ai.field.debrief": "Afficher un message de débriefing après soumission",

        // AI personas / tones / actions / difficulty
        "ai.persona.it_interne": "Service informatique interne (DSI)",
        "ai.persona.rh_interne": "Service RH interne",
        "ai.persona.direction": "Direction / Comité exécutif",
        "ai.persona.comptabilite": "Comptabilité / Finance",
        "ai.persona.securite_it": "Équipe sécurité IT (SOC / RSSI)",
        "ai.persona.fournisseur_generique": "Fournisseur générique (anonyme)",
        "ai.persona.plateforme_generique": "Plateforme SaaS générique",
        "ai.persona.autre": "Autre / précisé dans le scénario",
        "ai.tone.urgent": "Urgent / pression temporelle",
        "ai.tone.officiel": "Officiel et administratif",
        "ai.tone.informel": "Cordial / collègue",
        "ai.tone.alarmiste": "Alarmiste (sécurité compromise)",
        "ai.tone.neutre": "Neutre / informatif",
        "ai.action.click_link": "Cliquer un lien",
        "ai.action.submit_creds": "Saisir des identifiants sur la page",
        "ai.action.open_attachment": "Ouvrir une pièce jointe",
        "ai.action.reply": "Répondre à l'expéditeur",
        "ai.action.download": "Télécharger un fichier",
        "ai.diff.easy": "Facile (indices visibles : fautes, URL douteuse, ton incohérent)",
        "ai.diff.medium": "Moyen (quelques indices à repérer)",
        "ai.diff.hard": "Difficile (peu d'indices, scénario plausible)",
        "ai.page.login": "Page de connexion (formulaire identifiants)",
        "ai.page.otp": "Validation OTP / 2FA",
        "ai.page.document": "Téléchargement de document",
        "ai.page.confirm_profile": "Confirmation de profil utilisateur",
        "ai.page.info": "Page d'information (sans formulaire)",
        "ai.page.debrief": "Page de débriefing (révéler l'exercice)",
        "ai.brand.intranet_generic": "Portail interne générique",
        "ai.brand.it_helpdesk": "Helpdesk IT interne",
        "ai.brand.hr_portal": "Portail RH interne",
        "ai.brand.saas_generic": "SaaS générique (anonyme)",
        "ai.brand.doc_share": "Plateforme de partage de documents (anonyme)",
        "ai.brand.plain": "Mise en page sobre / sans branding",
        "ai.too_short": "Description trop courte",
        "ai.generating": "Génération en cours…",
        "ai.generating_hint": "Cela peut prendre jusqu'à 30 secondes.",
        "ai.done": "Contenu généré",
        "ai.error": "Erreur de génération",
        "ai.settings.title": "Paramètres — Assistant IA",
        "ai.settings.intro": "Saisissez une clé API pour activer l'assistant. La clé est stockée côté serveur (base SQLite locale) et n'est jamais renvoyée au navigateur. Laissez vide pour ne rien changer.",
        "ai.settings.priority": "Anthropic est privilégié si les deux fournisseurs sont configurés.",
        "ai.settings.set": "configurée",
        "ai.settings.not_set": "non configurée",
        "ai.settings.from_env": "variable d'environnement",
        "ai.settings.from_db": "base de données",
        "ai.settings.active_provider": "Fournisseur actif",
        "ai.settings.none_active": "Aucun fournisseur configuré — l'assistant IA est désactivé.",
        "ai.settings.saved": "Paramètres IA enregistrés",
        "ai.settings.clear_hint": "Astuce : saisir un seul espace puis Enregistrer pour effacer la clé.",
        "ai.settings.provider": "Fournisseur",
        "ai.settings.model": "Modèle",
        "ai.settings.key": "Clé API",
        "ai.settings.key_placeholder_set": "Clé enregistrée — laissez vide pour conserver",
        "ai.settings.key_placeholder_empty": "Saisissez une clé API",
        "ai.settings.show_key": "Afficher la clé",
        "ai.settings.hide_key": "Masquer la clé",
        "ai.settings.clear_key": "Effacer la clé",
        "ai.settings.clear_confirm": "Effacer la clé enregistrée pour ce fournisseur ?",
        "ai.settings.via_env": "via variable d'environnement (lecture seule)",
        "ai.settings.other_providers": "État autres fournisseurs",
        "ai.settings.configured_db": "configurée (base)",
        "ai.settings.configured_env": "configurée (env)",
        "ai.settings.not_configured": "non configurée",
        "ai.settings.provider_anthropic": "Anthropic (Claude)",
        "ai.settings.provider_openai": "OpenAI (GPT)",
        "ai.settings.model_invalid": "Modèle invalide pour ce fournisseur",
        "ai.settings.no_key_for_provider": "Aucune clé configurée pour ce fournisseur",
        "common.close": "Fermer",
        "matrix.significant": "Significatif",
        "matrix.high": "Élevé",
        "matrix.x": "Impact",
        "matrix.critical": "Critique",
        "matrix.moderate": "Modéré",
        "matrix.y": "Vraisemblance",
        "matrix.extreme": "Extrême",
        "matrix.low": "Faible",
    };

    if (typeof window._registerTranslations === "function") {
        window._registerTranslations("fr", FR);
    } else {
        // Fallback if shared i18n.js not yet loaded.
        window._I18N = window._I18N || {};
        window._I18N.fr = Object.assign(window._I18N.fr || {}, FR);
        window.t = window.t || function(k) { return (window._I18N.fr || {})[k] || k; };
    }
})();
