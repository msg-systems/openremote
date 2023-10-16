# GitHub Actions, AWS EC2 Skripte
## Github Actions Pipeline
Die Pipeline basiert auf der Pipeline von Openremote und wurde etwas angepasst.
Es wurde auf rollenbasierte AWS Authentifizierung umgestellt und es wird nun nur ein Image in AWS ECR gepusht. Ein komplettes Deployment findet nicht mehr statt.

### AWS IAM:
- Eine **Rolle** muss erstellt werden, die Berechtigungen für ECR haben muss.
- GitHub Actions wird als **Identitätsanbieter** in AWS konfiguriert.
- In der Rolle wird eine **Vertrauensbeziehung** definiert, sodass nur ein Repository (oder z.B. auch nur ein Branch) auf AWS zugreifen kann.
- Die ARN der Rolle muss im Schritt "`Configure AWS Credentials`" eingetragen werden. 
### AWS ECR
- Ein **Repository** muss erstellt werden und der Name im "`Build, Tag, and Push image to Amazon ECR`" Schritt eingetragen werden.
- Die richtige Region muss im Schritt "`Configure AWS Credentials`" als Variable eingetragen werden.
- Im Repository kann eine **Lifecycle Policy** konfiguriert werden, die ältere Images regelmäßig löscht.

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
#### `stop_docker.sh`
- Versucht, laufende Services herunter zu fahren.
- Meist sollte eine `docker-compose.yml` Datei im Ordner vorhanden sein, dann werden nur die dort angegebenen Services heruntergefahren.
#### `remove_image_and_tag_previous.sh`
- Wird mit zwei Argumenten aufgerufen:
    - `IMAGE_NAME`: ECR Registry und Name des Repositories 
    - `IMAGE_TAG`: Tag des Images, das umgetaggt werden soll
- Versucht, das gegebene Image mit dem Tag zu löschen
- Versucht dann, das Image mit dem `previous`-Tag mit `latest` zu taggen.
- Entfernt dann den Tag `previous` von diesem Image, da es nun als `latest` getaggt ist.

### Cron
- Die Datei `/etc/crontab` ist dafür zuständig, dass die Skripte regelmäßig ausgeführt werden.
- Hier wird definiert, wie oft die Skripte ausgeführt werden sollen.
- Die Logdatei wird jedes Mal gekürzt, damit diese nicht zu groß wird.
- Die Ausgaben der Skripte werden in die Logdatei geschrieben. 