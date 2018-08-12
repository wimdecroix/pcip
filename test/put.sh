#!/bin/bash
source secrets.txt
ACCESS_TOKEN=`curl --silent \
  --request POST \
  --url 'https://'${AUTH0_DOMAIN}'/oauth/token' \
  --header 'content-type: application/json' \
  --data '{"grant_type":"client_credentials","client_id": "'${AUTH0_CLIENT_ID}'","client_secret": "'${AUTH0_CLIENT_SECRET}'","audience": "'${API_ID}'"}' \
  | jq -r .access_token`

curl -v -H "Authorization: Bearer ${ACCESS_TOKEN}" -X PUT `wt inspect demo --output json | jq -r .url`?ip=8.8.8.8
