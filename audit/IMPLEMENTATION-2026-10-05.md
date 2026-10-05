# Modernisation de GitToSkill — 5 octobre 2026

Ce rapport décrit la première phase. Les modifications ultérieures de génération de style, d'attribution et d'interface, ainsi que les mesures actuelles, figurent dans [STYLE-UX-2026-10-05.md](STYLE-UX-2026-10-05.md).

Les correctifs ont été appliqués dans la copie locale du projet. Le parcours de génération a été fiabilisé, les dépendances de production ne présentent plus d'alerte dans `pnpm audit --prod`, et le JavaScript initial a été allégé. L'audit initial reste disponible dans [AUDIT-2026-10-05.md](AUDIT-2026-10-05.md) ; ses résultats décrivent l'état avant intervention.

## Résultats mesurés

| Indicateur | Avant | Après |
| --- | --- | --- |
| Alertes critiques dans les dépendances de production | 2 | 0 |
| Alertes hautes dans les dépendances de production | 21 | 0 |
| Ensemble des alertes de production | 43 | 0 |
| Alertes dans l'ensemble des dépendances, développement inclus | 76 | 1 haute, uniquement dans le développement |
| JavaScript initial, navigateur moderne, brut | 572 344 octets | 476 415 octets |
| JavaScript initial, navigateur moderne, gzip | 169 244 octets, soit 165,3 Kio | 142 005 octets, soit 138,7 Kio |
| Suite de tests applicatifs | Aucune | 20 tests réussis |
| Lint | 1 avertissement | 0 erreur, 0 avertissement |
| JSON `null` envoyé à l'API | 500 | 400 avec code explicite |

La réduction du JavaScript initial est de **16,1 % en gzip** et de **16,8 % en brut**. La mesure additionne les scripts externes uniques présents dans le HTML de l'accueil, en excluant le script `nomodule`, puis compresse chaque fichier avec gzip. Elle ne mesure ni Lighthouse, ni le LCP, ni un temps de génération réel. La mise à jour du framework, le chargement différé du Markdown et l'activation désormais explicite des analytics participent au résultat. Les fichiers chargés après génération ou lors du téléchargement restent nécessaires à ces actions.

Les tests de cache montrent qu'un groupe de huit demandes simultanées pour un profil déclenche une seule génération. Le scénario Redis simule deux workers distincts et confirme le partage du cache et des verrous. Ce sont des vérifications de comportement, pas un benchmark de débit sur une infrastructure réelle.

## Correctifs correspondant à l'audit

| Constat initial | Correctif appliqué |
| --- | --- |
| F01 : skills sans frontmatter installable | Frontmatter YAML déterministe ; validation stricte ; découverte vérifiée avec le vrai CLI `skills` |
| F02 : fonction inexistante après installation | Lecture de `.gitignore` corrigée et mise à jour idempotente testée |
| F03 : références pouvant sortir du dossier | Identité, chemins, tailles, doublons et noms réservés Windows vérifiés avant écriture ; refus des liens symboliques dans les dossiers créés |
| F04 : JSON `null` provoquant une 500 | Validation des entrées avec réponses 400, 413 et 415 ; lecture limitée à 4 Kio et 5 secondes |
| F05 : sortie Azure tronquée acceptée | Refus des sorties incomplètes et des refus du modèle ; validation des observations et des citations |
| F06 : sauvegarde et parseurs fragiles | Parseur partagé web/CLI ; staging, verrou exclusif, restauration de l'ancien snapshot ; sauvegarde conservée si la restauration échoue |
| F07 : générations répétées | Cache avec durée de vie, clé versionnée et regroupement des demandes simultanées ; visite d'une URL de profil sans génération automatique |
| F08 : dépôts analysés en double | Déduplication et sélection de quatre dépôts distincts, favorisant aussi la diversité des langages |
| F09 : GraphQL volumineux et données partielles perdues | Requêtes groupées, extraction bornée, manifests adaptés au langage ; conservation des champs valides lorsque des champs optionnels sont indisponibles |
| F10 : absence de délais et de reprises bornées | Délais réseau, limite des réponses, délai global de génération ; une reprise maximum pour les lectures GitHub, aucune répétition automatique d'un appel Azure payant |
| F11 : Markdown chargé à l'arrivée | Chargement différé du composant Markdown et rendu du contenu des sections ouvertes uniquement |
| F12 : génération publique sans limites | Quotas par client et par déploiement, plafond de concurrence ; stockage partagé exigé en production par défaut |
| F13 : caractère public insuffisamment vérifié | Contrôle `isPrivate === false` du profil README, des dépôts et des extraits avant leur utilisation |
| F14 : preuves limitées aux stacks | Extraits de code et de tests en complément des manifests/README ; schéma JSON strict et citations construites depuis les preuves collectées |

Les citations vérifiées garantissent qu'un identifiant de preuve existe et que le lien utilise le fichier réellement collecté, avec le commit lorsqu'il est disponible. Elles ne prouvent pas automatiquement que toute interprétation du modèle est juste. Le prompt traite les contenus GitHub comme des données non fiables, et les références restent à lire comme des éléments de preuve.

## Dépendances et distribution

- Next.js passe de 16.1.6 à **16.3.8**, avec `eslint-config-next` aligné.
- React et React DOM sont alignés sur **19.2.8** ; Tailwind, ses outils et les autres dépendances compatibles ont été actualisés.
- Node.js **24** et pnpm **11.25.0** sont documentés dans les fichiers de configuration.
- Des substitutions compatibles de `picomatch`, `browserslist` et `baseline-browser-mapping` corrigent les versions transitives encore épinglées par des outils.
- Le site est un package privé ; le CLI est séparé dans `packages/cli`. Son paquet contient neuf fichiers, dont ses propres sources, README et licence, et seulement `skills` et `yaml` comme dépendances directes de production. Le contrôle `pack --dry-run` confirme l'absence du site et des fichiers d'environnement.
- Une licence MIT a été ajoutée conformément à la licence déjà annoncée par le projet. L'ancien verrou de skill contenant un chemin propre à une autre machine est sauvegardé dans `skills-lock-before.json` ; le verrou courant est vide.

ESLint reste sur la dernière version 9 installée, car les plugins React/accessibilité actuels ne sont pas compatibles avec ESLint 10. ESLint 9 est signalé comme non maintenu par le registre ; la migration devra être reprise dès que cette chaîne sera compatible. Il reste également [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), une possibilité de déni de service de `braces` via des motifs profondément imbriqués, dans la chaîne de globbing du lint. Aucun correctif publié n'est disponible dans l'avis vérifié. Cette alerte n'est ni masquée ni ignorée dans l'audit complet ; elle n'apparaît pas dans les dépendances de production.

## Interface et exploitation

Le formulaire possède un libellé accessible, associe son erreur au champ, empêche les soumissions simultanées et propose une annulation. Le message d'attente décrit le traitement sans simuler des étapes de progression. Le nom affiché et la date de génération sont repris depuis la réponse ; le résultat indique s'il vient du cache. Les sections fermées retirent leur contenu du parcours clavier. Les timers de copie et la requête sont nettoyés à la fermeture du composant.

Le résultat propose le téléchargement du Markdown et d'un bundle `.tar` avec toutes ses références. L'archive utilise UTF-8 et son test relit les en-têtes, tailles, checksums et contenus. La commande d'installation possède sa propre copie. Les métadonnées, robots et sitemap utilisent `NEXT_PUBLIC_SITE_URL` ; les pages de formulaire de profil sont marquées sans indexation. Les analytics nécessitent une activation explicite.

Le cache expire après 12 heures par défaut. Les clés prennent en compte le login, la version d'analyse, le modèle, le déploiement, l'effort de raisonnement et l'endpoint Azure. Une annulation côté navigateur interrompt l'attente ; une génération déjà commencée peut terminer dans son délai pour alimenter le cache et les autres demandeurs. Les logs mesurent les étapes et la consommation de tokens sans enregistrer credentials ou prompts.

La CI ajoutée vérifie l'installation figée, le lint, les types, les tests, le build et l'audit de production sous Windows et Linux. Les versions des actions ont été vérifiées dans les publications officielles : [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node 7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) et [pnpm/action-setup 6.1.0](https://github.com/pnpm/action-setup/releases/tag/v6.1.0). Dependabot propose des mises à jour hebdomadaires regroupant Next, React et Tailwind. Ces workflows seront actifs lorsque les fichiers auront été intégrés dans un dépôt GitHub.

## Vérifications effectuées

| Vérification | Résultat |
| --- | --- |
| Installation avec lockfile figé | Réussie |
| `pnpm lint` | Réussi, aucun avertissement |
| `pnpm typecheck` | Réussi |
| `pnpm test` | 20 réussites, aucun test ignoré |
| `pnpm build` | Réussi avec Next.js 16.3.8 |
| `pnpm audit --prod` | 0 alerte |
| `pnpm audit` complet | 1 alerte haute dans le développement |
| CLI `pack --dry-run` | Contenu séparé vérifié |
| HTTP sur le build de production | Entrées invalides 400 ; taille excessive 413 ; mauvais type MIME 415 ; stockage non configuré 503 contrôlée |
| Navigateur, scénario de succès avec fixture locale | Résultat, sections, copie de commande et annulation vérifiés ; aucune erreur console dans le scénario de succès |
| Visite d'une page de profil | Formulaire prérempli sans génération automatique |

La capture [ui-after.png](ui-after.png) montre une fixture explicitement nommée, et non une analyse GitHub réelle. Le navigateur intégré n'a pas retourné d'événement de téléchargement exploitable lors de la vérification. Le contenu de l'archive est couvert par le test indépendant ; la sauvegarde effective du fichier par Chrome/Firefox reste à confirmer avec ces navigateurs.

## Conditions pour terminer la validation en production

1. Fournir les credentials GitHub et Azure et sélectionner un déploiement supportant les sorties structurées. Faire un essai réel sur un compte utilisateur et une organisation, puis vérifier la qualité des observations et les citations. Aucun appel authentifié réel n'a été effectué pendant cette intervention.
2. Configurer le stockage Redis REST partagé. Tester une génération, un cache HIT et plusieurs demandes simultanées sur l'hébergement réel. Le protocole REST a été simulé dans les tests ; aucun service Redis réel n'était disponible.
3. Régler quotas et concurrence selon la capacité et le budget, vérifier que le proxy fournit le bon IP et ajouter les limites de trafic de l'hébergeur. L'option mémoire est réservée à une instance unique et doit être activée explicitement en production.
4. Intégrer ces fichiers dans le dépôt source, exécuter la CI Linux/Windows puis publier séparément le site et le CLI. Cette copie ne possède pas de dossier `.git` ; aucun commit, push, déploiement ou publication npm n'a été effectué.
5. Mesurer LCP/INP, taux d'échec, latence p50/p95, taux de HIT et tokens par génération avec de vrais profils. Les mesures locales ne permettent pas de promettre un débit ou un temps de génération en production.

## Artefacts

La sauvegarde du code avant modification est `source-before-changes.zip`. Les preuves courantes sont `dependency-audit-after.json`, `dependency-audit-production-after.json`, `bundle-results-after.json`, `http-results-after.json`, `cli-package-after.json`, `tests-after.txt`, `lint-after.txt`, `typecheck-after.txt` et `build-after.txt`. Les anciens scripts de reproduction décrivent l'ancien code et ne remplacent pas la suite `tests/`. Le serveur `ui-preview.mjs` est une fixture liée uniquement à l'interface loopback ; il ne doit jamais être déployé.

Pour relancer les validations : installation figée, puis `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` et `pnpm audit --prod`. Le [README](../README.md) et [.env.example](../.env.example) documentent la configuration et les commandes locales.
