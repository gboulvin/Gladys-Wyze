# Wyze

Pilotez vos appareils [Wyze](https://www.wyze.com) depuis Gladys Assistant :
ampoules, rubans LED, prises, caméras et capteurs Wyze Sense, avec des
déclencheurs et actions de scène et deux widgets de tableau de bord.

## Appareils pris en charge

| Appareil Wyze                                         | Dans Gladys                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ampoule blanche (WLPA19, HL_HWB2)                     | Marche/arrêt, luminosité, température de couleur                               |
| Ampoule couleur (WLPA19C, BR30) et ruban LED (HL_LSL) | Marche/arrêt, luminosité, température de couleur, couleur — **pilotage local** |
| Prise et prise extérieure (WLPP1, WLPP1CFH, WLPPO)    | Marche/arrêt (un appareil par sortie)                                          |
| Caméras (Cam v2/v3/v4, Pan, Outdoor, Doorbell...)     | Dernière image, mouvement, alimentation, sirène, détection de mouvement        |
| Floodlight Pro, Battery Cam Pro, Cam OG, Pan v4       | Dernière image et mouvement (leurs commandes passent par une autre API Wyze)   |
| Capteur d'ouverture Wyze Sense (DWS3U, DWS2U)         | Ouvert/fermé, batterie faible                                                  |
| Détecteur de mouvement Wyze Sense (PIR3U, PIR2U)      | Mouvement, batterie faible                                                     |

Les autres appareils Wyze (serrures, thermostat, aspirateur, balances...) sont
ignorés.

## Avant de commencer : créer une clé d'API Wyze

Wyze n'autorise les applications tierces à se connecter qu'avec une clé d'API
personnelle, en plus de votre e-mail et de votre mot de passe. La clé vous
évite aussi le code de double authentification.

1. Ouvrez la [console développeur Wyze](https://developer-api-console.wyze.com/#/apikey/view)
   et connectez-vous avec votre compte Wyze.
2. Créez une clé d'API. Copiez le **KEY ID** et l'**API KEY** : l'API KEY
   n'est affichée qu'une seule fois.
3. Gardez-les pour la configuration ci-dessous. Vous pouvez révoquer la clé
   depuis la même console à tout moment.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Renseignez votre **e-mail** Wyze, votre **mot de passe**, l'**identifiant
   de la clé d'API** et la **clé d'API**.
3. Modifiez si besoin l'**intervalle de rafraîchissement** (60 secondes par
   défaut, 30 au minimum) : la fréquence de lecture des états et des
   événements caméra.
4. Enregistrez, puis cliquez sur **Tester la connexion** : l'intégration se
   connecte et indique combien d'appareils compatibles elle a trouvés.
5. Ouvrez l'onglet **Découverte** et ajoutez les appareils voulus dans Gladys.

Seuls les appareils ajoutés sont lus à chaque rafraîchissement, ce qui ménage
le cloud Wyze. **Synchroniser maintenant** force un rafraîchissement.

## Pilotage local

Wyze est un service cloud, à une exception près : les ampoules couleur et les
rubans LED acceptent des commandes sur votre réseau local. Quand **Préférer la
connexion locale** est activé (par défaut), leurs commandes vont directement à
l'ampoule ; les états sont toujours lus sur le cloud.

Le badge de chaque appareil indique le canal utilisé : _local_, _cloud_, ou
_injoignable_ quand Wyze signale l'appareil hors ligne. Un point orange
signifie qu'une commande locale a échoué et que l'ampoule est passée par le
cloud ; Gladys réessaie le réseau local au bout de 5 minutes. Gladys doit
pouvoir joindre l'ampoule sur le port TCP 88 (même réseau, pas d'isolation des
clients sur le Wi-Fi).

## Caméras

Le cloud Wyze ne fournit pas de vidéo en direct : l'image de la caméra dans
Gladys est la dernière miniature conservée par Wyze, en général celle du
dernier événement. Elle est rafraîchie à chaque nouvel événement. Gladys
n'accepte que des images de 150 Ko au plus ; une miniature plus grande est
ignorée (voir les logs).

La fonctionnalité **Mouvement** d'une caméra passe à 1 pendant environ 30
secondes quand la caméra enregistre un événement de mouvement, puis revient à 0. La détection dépend des réglages de la caméra dans l'application Wyze
(zones de détection, sensibilité, notifications). Les objets (personne,
véhicule, animal, colis) nécessitent un abonnement Cam Plus.

## Scènes

L'intégration ajoute ses propres cartes dans l'éditeur de scènes (Gladys 5.1
ou plus récent).

Déclencheurs :

- **Événement caméra Wyze** — une caméra a enregistré un événement. Filtrez
  sur la caméra, l'événement (mouvement, son, alarme fumée, alarme CO,
  sonnette, visage, autre) et l'objet reconnu (personne, véhicule, animal,
  colis, rien). Un filtre vide accepte tout. Les actions suivantes peuvent
  lire `{{triggerEvent.data.event}}` et `{{triggerEvent.data.object}}`.
- **Appareil Wyze en/hors ligne** — un appareil a perdu sa connexion au
  cloud, ou l'a retrouvée. Variable : `{{triggerEvent.data.status}}`
  (`offline` / `online`).

Actions :

- **Sirène de caméra Wyze** — déclenche ou arrête la sirène d'une caméra.
- **Détection de mouvement Wyze** — active ou désactive la détection de
  mouvement d'une caméra (par exemple quand l'alarme est armée).
- **Image de caméra Wyze** — publie la dernière image d'une caméra, à envoyer
  ensuite avec l'action Gladys « envoyer une image de caméra ».
- **Rafraîchir les appareils Wyze** — lit les appareils immédiatement ;
  renvoie le nombre d'appareils et d'appareils en ligne.

Une caméra qui ne peut pas exécuter une action (Floodlight Pro...) renvoie
`false` au lieu d'échouer, pour que les actions suivantes puissent en
dépendre.

## Tableau de bord

Deux widgets sont disponibles dans l'éditeur de tableau de bord :

- **Aperçu Wyze** — appareils, en ligne et hors ligne, portes et fenêtres
  ouvertes, état du cloud, dernier rafraîchissement, dernier événement caméra,
  et un bouton **Synchroniser**.
- **Caméra Wyze** — choisissez une caméra dans les réglages du widget :
  dernière image, mouvement en direct, connexion, dernier événement, et
  boutons de sirène (la sirène demande une confirmation).

## Dépannage

- **« Wyze a refusé la connexion »** — vérifiez l'e-mail, le mot de passe, et
  que l'identifiant et la clé d'API viennent de la même clé. Après un refus,
  Gladys attend 15 minutes avant de réessayer (Wyze bloque les comptes qui se
  connectent trop souvent) ; enregistrer la configuration relance aussitôt.
- **Un appareil ne se met pas à jour** — vérifiez qu'il est en ligne dans
  l'application Wyze ; les états sont lus à chaque intervalle de
  rafraîchissement.
- **Une ampoule couleur reste sur le cloud** — vérifiez que Gladys peut
  joindre l'ampoule sur le port TCP 88, ou désactivez **Préférer la connexion
  locale**.
- **Logs** — ouvrez les logs de l'intégration depuis Gladys (ou
  `docker logs`), avec `LOG_LEVEL=debug` pour le détail. Les mots de passe et
  les jetons ne sont jamais journalisés.

## Confidentialité

Vos identifiants sont stockés par Gladys dans sa configuration. La session
Wyze (jetons d'accès et de rafraîchissement) est conservée dans le volume
privé de l'intégration, pour qu'un redémarrage ne se reconnecte pas.
L'intégration ne parle qu'au cloud Wyze, et à vos ampoules couleur sur le
réseau local.

Cette intégration n'est pas affiliée à Wyze Labs. Elle utilise la même API
cloud que l'application Wyze, que Wyze peut modifier sans préavis.
