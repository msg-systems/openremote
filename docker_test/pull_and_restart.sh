#!/bin/bash
IMAGE_NAME=205672091018.dkr.ecr.eu-central-1.amazonaws.com/meterverse_manager
IMAGE_TAG=latest

echo ""
echo `TZ='Europe/Berlin' date +\%d.\%m.\%Y\ \%H:\%M`

echo "Looking for new Image:"
if sudo docker pull $IMAGE_NAME | grep -q "Downloaded newer image";
then
    echo "New image downloaded, restarting now."
    echo ""
    echo "Tag old image with 'previous' in case of failure of the new one."
    sudo docker tag $(sudo docker images -f "dangling=true" -q $IMAGE_NAME | head -1) $IMAGE_NAME:previous
    ./restart_docker.sh $IMAGE_NAME $IMAGE_TAG

    # Maybe automatic deleting and tagging of images is
    # problematic with multiple customers on one system
    if [ $? -eq 99 ]; 
    then
        echo ""
        ./recover_docker_image.sh

        ./restart_docker.sh $IMAGE_NAME $IMAGE_TAG
        if [ $? -eq 99 ];
        then
            echo ""
            echo "Restart with previous Image also failed. Please resolve manually."
        fi
    fi
else
    echo "No new image available, not restarting."
fi
