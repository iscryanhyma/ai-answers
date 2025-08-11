import dbConnect from '../api/db/db-connect.js';
import { Setting } from '../models/setting.js';

class SettingsServiceClass {
  constructor() {
    this.cache = {};
  }

  async get(key) {
    if (this.cache.hasOwnProperty(key)) {
      return this.cache[key];
    }
    await dbConnect();
    const setting = await Setting.findOne({ key });
    const value = setting ? setting.value : null;
    this.cache[key] = value;
    return value;
  }

  async set(key, value) {
    await dbConnect();
    await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
    this.cache[key] = value;
  }
}

export const SettingsService = new SettingsServiceClass();
