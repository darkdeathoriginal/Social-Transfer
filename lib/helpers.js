class Mutex {
    constructor() {
      this.locked = false;
      this.waitingList = [];
    }
  
    async acquire() {
      while (this.locked) {
        await new Promise((resolve) => this.waitingList.push(resolve));
      }
      this.locked = true;
    }
  
    release() {
      if (this.waitingList.length > 0) {
        const resolve = this.waitingList.shift();
        resolve();
      } else {
        this.locked = false;
      }
    }
  }
  class Semaphore {
    constructor(initialCount) {
      this.count = initialCount;
      this.waitingList = [];
      this.lock = new Mutex();
      this.positionChangeCallbacks = []; // Map to store callbacks for each waiting task
    }
  
    async acquire(callback) {
      await this.lock.acquire();
      if (this.count > 0) {
        this.count--;
        this.lock.release();
      } else {
        const position = this.waitingList.length + 1;
        const promise = new Promise((resolve) => {
          this.waitingList.push({ resolve, position });
        });
        if (typeof callback === "function") {
          callback(position);
          this.positionChangeCallbacks.push({ position, callback });
        }
        this.lock.release();
        await promise;
        this.count--;
      }
    }
  
    release() {
      this.count++;
      if (this.waitingList.length > 0) {
        const { resolve, position } = this.waitingList.shift();
        for (let i of this.positionChangeCallbacks) {
          i.position--;
          if (i.position <= 0) {
            this.positionChangeCallbacks.shift();
            continue;
          }
          i.callback(i.position);
        }
        resolve();
      }
    }
  
    getCurrentWaitingList() {
      return this.waitingList.map(({ position, resolve }) => ({
        position,
        resolve,
      }));
    }
  }

  module.exports = {Mutex, Semaphore};