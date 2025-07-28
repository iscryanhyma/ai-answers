// VectorServiceFactory.js
import { Setting } from '../models/setting.js';
import dbConnect from '../api/db/db-connect.js';
import IMVectorService from './IMVectorService.js';
import DocDBVectorService from './DocDBVectorService.js';

let VectorService = null;

export async function initVectorService() {
  await dbConnect();
  const setting = await Setting.findOne({ key: 'vectorServiceType' });
  const type = setting?.value || 'imvectordb';
  VectorService = type === 'documentdb' ? new DocDBVectorService() : new IMVectorService();
  await VectorService.initialize();
}

export { VectorService };
