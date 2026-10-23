import { createApp } from '../server/app';

export const maxDuration = 60;
export const config = { api: { bodyParser: false } };

export default createApp();
