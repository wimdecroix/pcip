const yaml = require('js-yaml');
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');
const AwsSecurityGroup = require('./AwsSecurityGroup.js');
const {ConflictError} = require('./Storage.js');
const Duration = require('./Duration.js');

class Permissions {

  /**
   * 
   * @param {string} script 
   * @param {Storage} storage 
   * @throws Throws error when script fails to load.
   */
  constructor(script, storage) {
    this.storage = storage;
    this.permissions = yaml.safeLoad(script);
    const ajv = new Ajv();
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../schemas/permissions.schema.json')).toString());
    const valid = ajv.validate(schema, this.permissions);
    if (!valid) {
      throw (ajv.errors);
    }
    this.permissions.permissions.forEach((permission, index) => {
      if (permission.protocol === "all") { this.permissions.permissions[index].protocol = -1; }
    });
  }

  /**
   * Is user authorized?
   * @param {string} user 
   */
  authorized(user) {
    if (user.indexOf('@') > -1) {
      const domain = "*@" + user.split('@')[1];
      return !this.permissions.users || this.permissions.users.includes(user) || this.permissions.users.includes(domain);
    } else {
      return !this.permissions.users || this.permissions.users.includes(user)
    }
  }

  /**
   * Authorize all permissions to the given IP.
   * 
   * @returns {Array} List of changes to show on page.
   * @throws In case of global error.
   */
  async authorize(ip) {
    return await Promise.all(this.permissions.permissions.map(async permission => {
      return await this.authorizeOne(ip, permission).catch((error) => { console.log(error); return permission.securitygroup + ": Error. see logs."; });
    })).catch((error) => { throw (error); });
  }

  /**
   * Authorize single permission to given IP.
   * 
   * @returns {string} Change to show on page.
   */
  async authorizeOne(ip, permission) {
    switch (permission.provider) {
      case "aws-sg":
        const awssg = new AwsSecurityGroup(permission.region);
        let ingress;
        try {
          ingress = await awssg.addIngress(ip, permission);
          if ((ingress.status === AwsSecurityGroup.STATUS_ADDED) || (ingress.status === AwsSecurityGroup.STATUS_ALREADY_DEFINED_ID)) {
            await this.storage.add(ingress.id, { ip: ip, permission: permission, timestamp: Date.now() });
          }
        } catch (error) {
          console.log(error);
          ingress = { status: AwsSecurityGroup.STATUS_ERROR, error: error };
        }

        const prefix = permission.provider + " " + permission.securitygroup + "(" + permission.region + "): Port " + permission.port;
        const expires = new Duration(permission.ttl).expires().calendar();
        switch (ingress.status) {
          case AwsSecurityGroup.STATUS_ADDED:
            return prefix + " opened to current IP. Expires: " + expires + " (UTC)";
          case AwsSecurityGroup.STATUS_ALREADY_DEFINED_ID:
            return prefix + " already opened to current IP. Updated expiry to: " + expires + " (UTC)";
          case AwsSecurityGroup.STATUS_ALREADY_DEFINED_OTHER:
            return prefix + " already opened to current IP by permanent ingress authorization!";
          case AwsSecurityGroup.STATUS_ERROR:
            return prefix + ": Error opening port to current IP. " + ingress.error;
          default:
            return prefix + ": Error opening port to current IP. See logs.";
        }
      default:
        return "Unsupported provider";
    }
  }

  /**
   * Revokes stored authorized permissions which are expired.
   * 
   * @returns nothing
   * @throws Throws error in case of issues.
   */
  async revokeExpired(attempts = 3) {
    const data = await this.storage.get().catch((error) => { throw error });
    if (data) {
      const closedIDs = await Promise.all(Object.keys(data).map(async id => {
        const permission = data[id].permission;
        if (new Duration(permission.ttl).expired(data[id].timestamp)) {
          switch (permission.provider) {
            case "aws-sg":
              try {
                return await new AwsSecurityGroup(permission.region).revokeIngress(id, data[id].ip, permission) ? id : null;
              } catch (error) {
                console.log(error);
                return null;
              }
            default:
              throw new Error("Unsupported provider");
          }
        }
      })).catch((error) => { throw (error) });
      let newData = data;
      let updated = false;
      closedIDs.forEach((id) => {
        if (typeof id === 'string') {
          delete newData[id];
          updated = true;
        }
      });
      if (updated) {
        try {
          await this.storage.set(newData);
        } catch (error) {
          if ((error instanceof ConflictError) && (attempts > 0)) {
            return await revokeExpired(attempts--).catch((errror) => { throw (error); });
          }
          throw error;
        };
      }
    }
  }
}

module.exports = Permissions;
