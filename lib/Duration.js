const moment = require('moment');

class Duration {
  /**
   *  
   * @param {string} duration Duration can be in digit + unit of measurement or any other format supported by momentjs.  https://momentjs.com/docs/#/durations/creating/  Examples: "5m", "3hours", "P1D", ..
   */
  constructor(duration) {
    const firstDigits = /^(\d+)(.*)$/.exec(duration);
    if (firstDigits) {
      this.duration = moment.duration(parseInt(firstDigits[1]), firstDigits[2]);
    } else {
      this.duration = moment.duration(duration);
    }
  }

  /**
   * 
   * @param {Date} date Javascript Date or momentjs moment.
   * @returns {moment} Momentjs moment when date + this duration expires.
   */
  expires(date) {
    const dateMoment = (date == null) ? moment() : moment(date);
    return dateMoment.add(this.duration);
  }

  /**
   * 
   * @param {Date} date Javascript Date or momentjs moment.
   * @returns {boolean} true in case now > date + this duration.
   */
  expired(date) {
    return moment().isAfter(this.expires(date));
  }
}

module.exports = Duration;
