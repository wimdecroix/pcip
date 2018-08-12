const uuid = require('uuid');
const AWS = require('aws-sdk');

const AWS_DESCRIPTION_PREFIX = "permitcurrentip: ";

class AwsSecurityGroup {
  constructor(region) {
    this.ec2 = new AWS.EC2({ region: region });
  }

  static init(secrets) {
    AWS.config.update({
      accessKeyId: secrets.AWS_ACCESS_KEY_ID,
      secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
      region: 'us-east-1'
    });
  }

  static get STATUS_ALREADY_DEFINED_ID() { return "STATUS_ALREADY_DEFINED_ID"; }
  static get STATUS_ALREADY_DEFINED_OTHER() { return "STATUS_ALREADY_DEFINED_OTHER"; }
  static get STATUS_ADDED() { return "STATUS_ADDED"; }
  static get STATUS_ERROR() { return "STATUS_ERROR"; }

  /**
   * Try to add permission to Ingress with specified IP.
   * The AWS description will contain an identifier that this was added by this program.
   * An ID is part of this description. This ID should be stored persistent.
   * When revoking, only matching ID's are revoked.
   * 
   * If there is already permission for same ip/port/protocol with the description containing an ID, 
   * STATUS_ALREADY_DEFINED_IP is returned with this ID.
   * 
   * If there is already permission for same ip/port/protocol with unknown description, 
   * STATUS_ALREADY_DEFINED_OTHER is returned.
   * 
   * If the permission is added, a new ID is generated. And STATUS_ADDED with this ID is returned.
   * 
   * @param {string} ip IP to be added in ingress.  (IPv4! IPv6 not supported yet)
   * @param {string} permission Permissions defined. (protocol, port, ...)
   * @return {Object} Object containing status and id if STATUS_ADDED or STATUS_ALREADY_DEFINED_ID
   */
  async addIngress(ip, permission) {
    try {
      const describeParams = {
        GroupIds: [
          permission.securitygroup
        ]
      };
      const describeData = await this.ec2.describeSecurityGroups(describeParams).promise();
      // only one returned entry can match all parameters.  AWS does not allow duplicates.
      const description = describeData.SecurityGroups[0].IpPermissions.map((ipperm) => {
        //console.log(ipperm);
        if ((ipperm.FromPort === permission.port) &&
          (ipperm.ToPort === permission.port) &&
          (ipperm.IpProtocol === permission.protocol) &&
          (Array.isArray(ipperm.UserIdGroupPairs)) &&
          (ipperm.UserIdGroupPairs.length === 0)) {
          return ipperm.IpRanges.map((cidr) => {
            if (cidr.CidrIp === ip + "/32") return "description: " + cidr.Description; // added "description: " to make sure something is returned if matching permission without description
          }).join('');
        }
      }).join('');
      const idmatch = new RegExp(AWS_DESCRIPTION_PREFIX + "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", "i").exec(description);
      //console.log(permission.securitygroup + " port: " + permission.port + " matchDescriptions:" + description + " id: " + idmatch);
      if (idmatch !== null) {
        const id = idmatch[1];
        return { status: AwsSecurityGroup.STATUS_ALREADY_DEFINED_ID, id: id };
      }
      if (description) {
        return { status: AwsSecurityGroup.STATUS_ALREADY_DEFINED_OTHER };
      }
      const newId = uuid.v4();
      const authorizeParams = {
        GroupId: permission.securitygroup,
        IpPermissions: [
          {
            FromPort: permission.port,
            IpProtocol: permission.protocol,
            IpRanges: [
              {
                CidrIp: ip + "/32",
                Description: AWS_DESCRIPTION_PREFIX + newId
              }
            ],
            ToPort: permission.port
          }
        ]
      };
      console.log("ID=" + newId + " Authorizing " + JSON.stringify(authorizeParams));
      await this.ec2.authorizeSecurityGroupIngress(authorizeParams).promise();
      return { status: AwsSecurityGroup.STATUS_ADDED, id: newId };
    } catch (error) {
      console.log(error);
      return { status: AwsSecurityGroup.STATUS_ERROR, error: error };
    }
  }

  /**
   * Removes permission from the ingress.
   * Returns true in case permission removed or in case permission not present. 
   * 
   * @param {string} id ID used when adding the permission
   * @param {string} ip IP in IPv4 format, IPv6 not supported yet.
   * @param {Object} permission 
   */
  async revokeIngress(id, ip, permission) {
    const revokeParams = {
      GroupId: permission.securitygroup,
      IpPermissions: [
        {
          FromPort: permission.port,
          IpProtocol: permission.protocol,
          IpRanges: [
            {
              CidrIp: ip + "/32",
              Description: AWS_DESCRIPTION_PREFIX + id
            }
          ],
          ToPort: permission.port
        }
      ]
    };
    console.log("ID=" + id + " Revoking " + JSON.stringify(revokeParams));
    await this.ec2.revokeSecurityGroupIngress(revokeParams).promise().catch((error) => { console.log(error); return false; });
    return true;
  }

}

module.exports = AwsSecurityGroup;
