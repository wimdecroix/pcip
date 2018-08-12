class ConflictError extends Error { }

class Storage {
  /**
   * Abstraction for storage.
   * Default implementation using webtask storage.
   * 
   * @param {WebtaskContext} ctx 
   */
  constructor(ctx) {
    this.storage = ctx.storage;
  }

  async get() {
    try {
      return await new Promise((resolve, reject) => {
        this.storage.get((error, data) => {
          if (error) reject(error); else resolve(data);
        });
      });
    } catch (error) {
      throw error;
    }
  }

  async set(data) {
    try {
      await new Promise((resolve, reject) => {
        this.storage.set(data, (error) => {
          if (error) reject(error); else resolve();
        });
      });
      console.log("Storage set to: " + JSON.stringify(data));
    } catch (error) {
      console.log(error);
      if (error.code === 409) { throw new ConflictError() }
      throw error;
    }
  }

  async add(key, value, attempts = 3) {
    const data = await this.get().catch((error) => { throw error });
    let newData = data || {};
    newData[key] = value;
    try {
      await this.set(newData);
    } catch (error) {
      if ((error instanceof ConflictError) && (attempts > 0)) { return await this.add(key, value, attempts--) }
      throw error;
    };
  }
}

module.exports = {
  Storage: Storage,
  ConflictError: ConflictError
}
