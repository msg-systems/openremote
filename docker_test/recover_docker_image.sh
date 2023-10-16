#!/bin/bash

IMAGE_NAME=$1
IMAGE_TAG=$2

echo ""
echo "Fahre laufendes Docker Compose herunter (docker compose down)"
sudo docker compose down

if [ $? -ne 0 ]; then
    echo "Failed to stop the existing stack."
    exit 1
fi

echo ""
echo "Try to remove $IMAGE_NAME:$IMAGE_TAG"
sudo docker rmi $IMAGE_NAME:$IMAGE_TAG
if [ $? -ne 0 ];
then
    exit 1
fi

echo "Try to Tag $IMAGE_NAME:previous with $IMAGE_NAME:$IMAGE_TAG"
sudo docker tag $IMAGE_NAME:previous $IMAGE_NAME:$IMAGE_TAG
if [ $? -ne 0 ];
then
    exit 1
fi

echo "Remove previous Tag."
sudo docker rmi $IMAGE_NAME:previous
if [ $? -ne 0 ];
then
    exit 1
fi

echo "Remaining Docker Images:"
sudo docker images