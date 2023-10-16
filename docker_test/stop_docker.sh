#!/bin/bash

echo ""
echo "Fahre laufendes Docker Compose herunter (docker compose down)"
sudo docker compose down

if [ $? -ne 0 ]; then
    echo "Failed to stop the existing stack."
    exit 1
fi