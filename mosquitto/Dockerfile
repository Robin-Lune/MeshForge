# MeshForge — image broker MQTT (mosquitto + plugin go-auth) avec la config
# MeshForge BAKÉE dedans.
#
# Pourquoi pas un simple bind-mount (comme en local) : en déploiement Git via
# Portainer, les bind-mounts relatifs (./mosquitto/config/...) ne sont PAS résolus
# (le démon Docker ne voit pas le dossier cloné par Portainer) → la config se
# retrouvait montée comme un dossier vide et le broker crashait en boucle.
# `build:` fonctionne, lui (le contexte est envoyé au démon) → on COPIE la config.
FROM iegomez/mosquitto-go-auth:latest
COPY config/mosquitto.prod.conf /etc/mosquitto/mosquitto.conf
