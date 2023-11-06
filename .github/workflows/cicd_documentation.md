# GitHub Actions, AWS EC2 Skripte
## Github Actions Pipeline
Die Pipeline basiert auf der Pipeline von Openremote und wurde etwas angepasst.
Es wurde auf rollenbasierte AWS Authentifizierung umgestellt und es wird nun nur ein Image in AWS ECR gepusht. Ein komplettes Deployment findet nicht mehr statt.

Die Pipelines, die (nicht) ausgeführt werden sollen, müssen in GitLab aktiviert bzw. deaktiviert werden.
### `minimal_ci_cd.yml`
- `.github/workflows/minimal_ci_cd.yml`
- Das ist eine minimale Pipeline, die Tests ausführt und das Docker Image baut und pusht
- Kommt ohne Config Files aus, daher auch weniger konfigurierbar
### `ci_cd.yml`
- `.github/workflows/ci_cd.yml`
- Das ist die Datei, die die Pipeline definiert
- Am Anfang der Datei kann angegeben werden, wann die Pipeline ausgeführt werden soll. (Event, Branch, Tags)
- Kann mit der Datei `ci_cd.json` konfiguriert werden
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
- [Es muss der AWS Credential Helper für Watchtower konfiguriert werden](https://containrrr.dev/watchtower/private-registries/#credential_helpers) (und wahrscheinlich die aws-cli installiert sein)
- Um Watchtower im `docker-compose.yml` File zu verwenden:
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
    - Hier wird das Intevall, in dem Watchtower auf neue Images prüft mit `--interval 30` auf 30 Sekunden gesetzt.
- Die Container, die durch Watchtower aktualisiert werden sollen, erhalten im `docker-compose.yml` File ein Label:
    ```
        labels:
            - "com.centurylinklabs.watchtower.enable=true"
    ```