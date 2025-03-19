#!/bin/bash

# Check if host is provided as a command line argument
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi
host=$1

# Function to cleanly exit
cleanup() {
  echo "Terminating background processes..."
  kill $pid1 $pid2 $pid3 $pid4
  exit 0
}

# Trap SIGINT (Ctrl+C) to execute the cleanup function
trap cleanup SIGINT

# Simulate a user requesting the menu every 15 seconds
while true; do
  curl -s "$host/api/order/menu" > /dev/null
  echo "Requesting menu..."
  sleep 15
done &
pid1=$!

# Simulate a user with an invalid email and password every 25 seconds
while true; do
  curl -s -X PUT "$host/api/auth" -d '{"email":"unknown@jwt.com", "password":"bad"}' -H 'Content-Type: application/json' > /dev/null
  echo "Logging in with invalid credentials..."
  sleep 25
done &
pid2=$!

# Simulate a franchisee logging in every two minutes
while true; do
  response=$(curl -s -X PUT $host/api/auth -d '{"email":"f@jwt.com", "password":"franchisee"}' -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  echo "Login franchisee..."
  sleep 20
  curl -s -X DELETE $host/api/auth -H "Authorization: Bearer $token" > /dev/null
  echo "Logging out franchisee..."
  sleep 5
done &
pid3=$!

# Simulate a diner ordering a pizza every 20 seconds
while true; do
  response=$(curl -s -X PUT $host/api/auth -d '{"email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  echo "Login diner..."
  curl -s -X POST $host/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H "Authorization: Bearer $token" > /dev/null
  echo "Bought a pizza..."
  sleep 5
  # Creating an array of 21 pizzas
  pizzas=$(printf '{"menuId":1,"description":"Veggie","price":0.05},%.0s' {1..21})
  pizzas="[${pizzas%,}]" # Wrap in array and remove trailing comma
  curl -s -X POST $host/api/order -H 'Content-Type: application/json' -d "{\"franchiseId\":1, \"storeId\":1, \"items\":$pizzas}" -H "Authorization: Bearer $token"  > /dev/null
  echo "Attempted to buy 21 pizzas..."
  sleep 3
  curl -s -X DELETE $host/api/auth -H "Authorization: Bearer $token" > /dev/null
  echo "Logging out diner..."
  sleep 3
done &
pid4=$!




# Wait for the background processes to complete
wait $pid1 $pid2 $pid3 $pid4