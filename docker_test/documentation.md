# GitHub Actions, AWS EC2 Skripte
## Github Actions Pipeline
Die Pipeline basiert auf der Pipeline von Openremote und wurde etwas angepasst.
Es wurde auf rollenbasierte AWS Authentifizierung umgestellt und es wird nun nur ein Image in AWS ECR gepusht. Ein komplettes Deployment findet nicht mehr statt.
### `ci_cd.yml`
- `.github/workflows/ci_cd.yml`
- Das ist die Datei, die die Pipeline definiert
- Am Anfang der Datei kann angegeben werden, wann die Pipeline ausgeführt werden soll. (Event, Branch, Tags)
### `ci_cd.json`
- `.ci_cd/ci_cd.json`
- Diese Datei definiert, bei welchen Events und bei welchen Branches die Docker Images hochgeladen werden sollen.
- Es wrid das Event (z.B. `push`), dann der Branch (z.B. `master`), die Aktion (`deploy` für pushen in Repository) und dann ein Manager-Tag und die Umgebung angegeben.
- Für das Pushen in das AWS ECR Repository muss `deploy` verwendet werden
- `distribute` wird in der geänderten Pipeline __nicht__ benutzt, da es nur im openremote/openremote Repository verwendet werden kann.
- Das Manager-Tag ist dafür da, dass die Pipeline nicht das Image mit dem Tag `latest` aus dem DockerHub benutzt, sondern das mit dem gegebenen Tag.
### AWS IAM:
- Eine **Rolle** muss erstellt werden, die Berechtigungen für ECR haben muss.
- GitHub Actions wird als **Identitätsanbieter** in AWS konfiguriert.
- In der Rolle wird eine **Vertrauensbeziehung** definiert, sodass nur ein Repository (oder z.B. auch nur ein Branch) auf AWS zugreifen kann.
- Die ARN der Rolle muss im Schritt "`Configure AWS Credentials`" eingetragen werden. 
### AWS ECR
- Ein **Repository** muss erstellt werden und der Name im "`Build, Tag, and Push image to Amazon ECR`" Schritt eingetragen werden.
- Die richtige Region muss im Schritt "`Configure AWS Credentials`" als Variable eingetragen werden.
- Im Repository kann eine **Lifecycle Policy** konfiguriert werden, die ältere Images regelmäßig löscht.

## Aktualisieren der Docker Images auf den EC2 Instanzen
- Es wird Watchtower verwendet, um die Images automatisiert zu aktualisieren.
- [Es muss der AWS Credential Helper für Watchtower konfiguriert werden](https://containrrr.dev/watchtower/private-registries/#credential_helpers)
- Um Watchtower im docker-compose.yml File zu verwenden:
    ```
    watchtower:
        image: containrrr/watchtower:latest
        volumes:
            - /var/run/docker.sock:/var/run/docker.sock
            - $HOME/.docker/config.json:/config.json
            - helper:/go/bin
        environment:
            - HOME=/home/ubuntu/
            - PATH=$PATH:/go/bin
            - AWS_REGION=us-west-1
        command: --interval 30 --label-enable
    ```
- Die Container, die durch Watchtower aktualisiert werden sollen, erhalten ein Label:
    ```
        labels:
            - "com.centurylinklabs.watchtower.enable=true"
    ```
## AWS Skripte
Es gibt mehrere Skripte, die in der EC2-Instanz automatisch die neuen Images pullen und die Docker Services neustarten.
Dies wird mit Hilfe von Cron erreicht, sodass die Skripte regelmäßig ausgeführt werden.
Der Amazon ECR Docker Credential Helper wird benutzt, um Docker für die private Registry zu authentifizieren.

### `docker-compose.yml`
- Diese Datei definiert Services und welche Images dafür verwendet werden.
- Sollte dort vorhanden sein, wo auch die anderen Skripte liegen.
- Für den Manager-Service sollte definiert sein, ob das Image von OpenRemote benutzt werden soll, oder das eigene.

### Skripte
- Die Skripte sind (noch) nicht komplett darauf ausgelegt, dass mehrere OpenRemote Instanzen laufen, die verschiedene Images benutzen.
#### `pull_and_restart.sh`
- Docker wird in die private Registry eingeloggt.
- Prüft, ob es ein neueres Image gibt und pullt dieses dann direkt.
- Falls ein neues Image vorhanden ist, wird das Skript `restart_docker.sh` aufgerufen.
- Es sollten zwei Variablen am Anfang des Skriptes gesetzt werden:
    - `IMAGE_NAME`: ECR Registry und Name des Repositories 
    - `IMAGE_TAG`: Tag, das benutzt werden soll (meist `latest`, um immer auf neue Images zu prüfen)
#### `restart_docker.sh`
- Wird mit den Argumenten `IMAGE_NAME` und `IMAGE_TAG` aufgerufen.
- Versucht, die laufenden Docker Services (der `docker-compose.yml`-Datei im aktuellen Ordner, wo das Skript liegt) herunterzufahren.
- Versucht dann, die Services mit dem neuen Image neu zu starten.
- Checkt dann, ob die Services laufen (Docker Statuscheck auf "healthy")
- Falls alle Services laufen, wird das letzte Image gelöscht.
#### `recover_docker_image.sh`
- Versucht die laufenden Services zu stoppen.
- Versucht dann, das neueste Image (`latest`) zu löschen und das alte Image (`previous`) wieder mit `latest` zu taggen, sodass ein älteres Image genutzt werden kann, wenn das Neueste nicht funktioniert.

### Cron
- Die Datei `/etc/crontab` ist dafür zuständig, dass die Skripte regelmäßig ausgeführt werden.
- Hier wird definiert, wie oft die Skripte ausgeführt werden sollen.
- Die Logdatei wird jedes Mal gekürzt, damit diese nicht zu groß wird.
- Die Ausgaben der Skripte werden in die Logdatei geschrieben. 