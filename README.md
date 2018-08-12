# Permit Current IP

## Introduction
Also opening often manually the SSH port of your AWS servers to your current IP address?  This tool helps.
Just visit a website, login and the port is opened for a configurable limited time.

## How it works
This tool uses auth0 for authentication and auth0 webtasks to connect to AWS.  This runs completely serverless, so no own servers required.

## Installation

### Auth0 application
* Create an auth0 account: https://auth0.com/signup
* Create an application: pcip
    * Regular webapp
    * Go into your Auth0 Applications settings
        * Change "Token Endpoint Authentication Method" to "Basic" 
        * Show Advanced Settings
            * OAuth -> Disable the OIDC Conformant setting. Then set JsonWebToken Signature Algorithm to HS256.
            * Grant Types -> Enable Client Credentials Grant 
* Create an API: pcip
    * Name: pcip
    * Identifier: https://pcip.somedomain.com
    * HS256
    * Machine to Machine Applications: Authorize pcip Application

### Webtask
* Try for free at: https://webtask.io/
* Install https://github.com/auth0/wt-cli
* Create secrets.txt file with following content from Auth0 Application/API and AWS:
```
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_DOMAIN=
AUTH0_SECRET_ENCODING=utf8
API_ID=
API_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```
* create a yaml file with with configuration (see lower).  Example:
```
users:
#- '*@auth0.com'
- 'someone@gmail.com'
permissions:
- provider: aws-sg
  securitygroup: sg-07ded32c3a23e3095
  region: us-east-1
  port: 80
  protocol: tcp
  ttl: "1days"
- provider: aws-sg
  securitygroup: sg-0d4ca9fd8dbbb6656
  region: eu-west-1
  port: 22
  protocol: tcp
  ttl: "P1D"
```
* Create webtask cronjob:
```
wt cron create \
    --schedule 1h \
    --name demo \
    --meta wt-compiler=pcip \
    --host pcip.somedomain.com \
    --secrets-file test/secrets.txt \
    --dependency pcip \
    --no-auth \
    test/demo.yaml
```
* Update Auth0 Application: 
    * Go to application settings and add to "Allowed Callback URLs" the URL of your application + "/callback".  Example: `https://wt-jfghhjr84m200f73jmmk499fk-0.sandbox.auth0-extend.com/demo/callback`
* Open https://wt-jfghhjr84m200f73jmmk499fk-0.sandbox.auth0-extend.com/demo

### Optional: Cloudflare
* Create cloudflare account
* Transfer a domain to cloudflare
* Setup a website that is cached by cloudflare (orange)
* Setup a page rule to redirect a path of your website to this webtask
    * For example: redirect www.somedomain.com/pcip/* to https://wt-jfghhjr84m200f73jmmk499fk-0.sandbox.auth0-extend.com/*
    * To visit webtask created above: https://www.somedomain.com/pcip/demo
* Alternative is to use custom domain.  
    * Create CNAME pcip.somedomain.com to sandbox.auth0-extend.com
    * Create TXT entry pcip.somedomain.com with webtask:container:wt-jfghhjr84m200f73jmmk499fk-0
    * Your webtask is now also available on: https://pcip.somedomain.com/wt-jfghhjr84m200f73jmmk499fk-0/demo
    * Remark: you need to add callback in auth0 to https://pcip.somedomain.com/wt-jfghhjr84m200f73jmmk499fk-0/demo/callback 


## Configuration File details
* users possibilities:
    * email address for authentication providers with email address
        * You can specify *@somedomain.com to authorize all users of a domain
    * name for authentication providers without email, but with a name
    * sub for other providers
* ttl possibilities:
    * digits + time indication
        * Examples: "5m", "10hours", "12months", ...
        * Valid time indications:
            * years, y
            * months, M
            * weeks, w
            * days, d
            * hours, h
            * minutes, m
            * seconds, s
            * milliseconds, ms
    * ISO 8601 Time Interval
        * See https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
        * Examples: "P1M", "P1DT12H", ...


## Additional Features
To be able to automatically grant the IP address of your current PC, a possibility is added with use of client credentials grants.  

```
#!/bin/bash
source secrets.txt
ACCESS_TOKEN=`curl --silent \
  --request POST \
  --url 'https://'${AUTH0_DOMAIN}'/oauth/token' \
  --header 'content-type: application/json' \
  --data '{"grant_type":"client_credentials","client_id": "'${AUTH0_CLIENT_ID}'","client_secret": "'${AUTH0_CLIENT_SECRET}'","audience": "'${API_ID}'"}' \
  | jq -r .access_token`

curl -v -H "Authorization: Bearer ${ACCESS_TOKEN}" -X PUT `wt inspect demo --output json | jq -r .url`?ip=8.8.8.8
```

## Demo
https://www.decroix.me/pcip/demo

## TODO
* automated tests

## Roadmap
* support ipv6
* support port ranges
* support for immediate revoke all
* support more providers than AWS
* ...


