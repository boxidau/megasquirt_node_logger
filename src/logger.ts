import * as log from 'npmlog';

log.level = process.env.LOG_LEVEL || 'info';
export default log;
