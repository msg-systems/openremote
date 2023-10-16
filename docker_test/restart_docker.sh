#!/bin/bash

IMAGE_NAME=$1
echo "Image Name: $IMAGE_NAME"
IMAGE_TAG=$2
echo "Image Tag to use: $IMAGE_TAG"

DIRECTORY_NAME=${PWD##*/}
echo "Directory name: $DIRECTORY_NAME"

# echo ""
# echo "Currently Running Docker Compose:"
# sudo docker compose ls

echo ""
echo "Currently Running Docker Services with name $DIRECTORY_NAME:"
sudo docker ps --filter "name=$DIRECTORY_NAME"

echo ""
echo "Fahre laufendes Docker Compose herunter (mit Name: $DIRECTORY_NAME, falls docker-compose.yml in diesem Ordner)"
sudo docker compose down 2> /dev/null

if [ $? -ne 0 ]; then
    echo "Failed to stop the existing stack."
    exit 1
fi

echo ""
echo "Liste der aktuell heruntergeladenen Images mit Name: $IMAGE_NAME:"
sudo docker images $IMAGE_NAME
# TODO: Repo in ECR erstellen und hier ändern

echo ""
echo "Starte Docker Container neu:"
sudo docker compose --env-file .env up -d
# Dockerfile muss noch angepasst werden, damit nicht openremote/manager benutzt wird, sondern eigenes

# Check if docker compose failed
if [ $? -ne 0 ]; then
    echo "Deployment failed to start the stack"
    exit 1
fi

# TODO: What if multiple instances should run and other services fail?
# Check if all services run healthy
echo ""
echo "Waiting for up to 5mins for all services to be healthy"
COUNT=1
STATUSES_OK=false
IFS=$'\n'
while [ "$STATUSES_OK" != 'true' ] && [ $COUNT -le 60 ];
do
    echo "Checking service health...attempt $COUNT"
    STATUSES=$(sudo docker ps --format "{{.Names}} {{.Status}}" --filter "name=$DIRECTORY_NAME")
    STATUSES_OK=true

    for STATUS in $STATUSES; do
        if [[ "$STATUS" != *"healthy"* ]]; then
        STATUSES_OK=false
        break
        fi
    done

    if [ "$STATUSES_OK" == 'true' ]; then
        break
    fi

    sleep 5
    COUNT=$((COUNT+1))
done

if [ "$STATUSES_OK" == 'true' ]; then
    echo ""
    echo "All services are healthy."
else
    echo ""
    echo "One or more services are unhealthy."
    sudo docker ps -a
    exit 99
fi

# Remove old image if new services are running healthy
# the +X at the end of the command specifies how many images are kept (+2 means 1 image will remain)
# TODO: change repo name later
echo ""
echo "Removing old Image. May fail if there is no previous Image."
sudo docker rmi $IMAGE_NAME:previous

echo ""
echo "Remaining Docker Images:"
sudo docker images