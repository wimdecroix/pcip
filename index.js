const wt = require('webtask-tools');
const proxyaddr = require('proxy-addr');
const jwt = require('jsonwebtoken');
const isIp = require('is-ip');
const Permissions = require('./lib/Permissions.js');
const {Storage} = require('./lib/Storage.js');
const AwsSecurityGroup = require('./lib/AwsSecurityGroup.js');

/**
 * GET -> User opened the page. So add permissions.
 * Goes over all defined permissions, check if permission is already applied for current IP and apply if needed.
 * 
 * Also removes expired permissions if there are any.
 */
async function processGetRequest(ctx, req, res, permissions) {
  try {
    // Webtask proxy is luckily dropping x-forwarded-for from client.
    // Otherwise client could easily spoof any IP address.
    const ip = proxyaddr.all(req).slice(-1)[0];

    // Only IPv4 supported for the moment
    if (!isIp.v4(ip)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end("IP from X-Forwarded-For is not a valid IPv4 address: " + ip);
      return;
    }

    // Check if user is authorized
    let user;
    if (ctx.user.sub) user = ctx.user.sub;
    if (ctx.user.name) user = ctx.user.name;
    if (ctx.user.email) user = ctx.user.email;
    if (!user) throw new Error("No user identification found!");
    if ( (ctx.user.email_verified && (ctx.user.email_verified !== true )) || (permissions.authorized(user) !== true)) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end("User " + user + " is not authorized!");
      return;
    }

    // Authorize current IP
    const result = await permissions.authorize(ip);

    // Revoke any expired permissions in storage
    await permissions.revokeExpired().catch((error) => { console.log(error); });

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Permit Current IP</title>
</head>
<body>
User: ${user}<br>
IP: ${ip}<br>
IP Permission Changes:<br>
<ul>
${result.map(item => `<li>${item}</li>`).join("\n")}
</ul>
</body>
</html>`);
  } catch (error) {
    console.log(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end((error instanceof Error) ? error.stack : JSON.stringify(error, null, 2));
  }
}

/**
 * POST -> From cronjob. Remove all expired permissions.
 */
async function processPostRequest(ctx, req, res, permissions) {
  try {
    await permissions.revokeExpired();
    res.writeHead(200);
    res.end();
  } catch (error) {
    console.log(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end((error instanceof Error) ? error.stack : JSON.stringify(error, null, 2));
  }
}

/**
 * PUT -> Add IP from other script.  
 * Valid token needs to be present.  (client credentials grant can be used)
 */
async function processPutRequest(ctx, req, res, permissions) {
  let token;
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    token = req.headers.authorization.split(' ')[1];
  } else {
    token = req.query && req.query.access_token;
  }
  let ip;
  if (req.query.ip) {
    ip = req.query.ip;
  } else {
    ip = proxyaddr.all(req).slice(-1)[0];
  }
  if (!isIp.v4(ip)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end("ip parameter is not a valid IPv4 address");
  }
  try {
    jwt.verify(token,
      ctx.secrets.API_SECRET,
      {
        audience: ctx.secrets.API_ID,
        issuer: 'https://' + ctx.secrets.AUTH0_DOMAIN + '/'
      });
    const result = await permissions.authorize(ip);
    await permissions.revokeExpired().catch((error) => { console.log(error) });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end((error instanceof Error) ? error.stack : JSON.stringify(error, null, 2));
  }
}

module.exports = (options, cb) => {
  let permissions;

  const getRequest = wt.auth0((ctx, req, res) => {
    processGetRequest(ctx, req, res, permissions);
  });

  return cb(null, (ctx, req, res) => {
    console.log("New Request: " + req.method + ' ' + req.headers.host + req.url);
    try {
      AwsSecurityGroup.init(options.secrets);
      storage = new Storage(ctx);
      permissions = new Permissions(options.script, storage);

      switch (req.method) {
        case 'GET':
          if (ctx.mock) {
            // For local testing, no auth0
            processGetRequest(ctx, req, res, permissions);
          } else {
            getRequest(ctx, req, res);
          }
          break;
        case 'POST':
          processPostRequest(ctx, req, res, permissions);
          break;
        case 'PUT':
          processPutRequest(ctx, req, res, permissions);
          break;
        default:
          res.writeHead(405);
          res.end();
          break;
      }
    } catch (error) {
      console.log(error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end((error instanceof Error) ? error.stack : JSON.stringify(error, null, 2));
      return;
    }
  });
};
