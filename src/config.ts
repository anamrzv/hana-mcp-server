import 'dotenv/config';

export interface HanaConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  encrypt: boolean;
  validateCertificate: boolean;
}

export interface ServerConfig {
  httpPort: number;
  logLevel: string;
}

export function getHanaConfig(): HanaConfig {
  return {
    host: process.env.HANA_HOST || 'localhost',
    port: parseInt(process.env.HANA_PORT || '443'),
    user: process.env.HANA_USER || 'SYSTEM',
    password: process.env.HANA_PASSWORD || '',
    encrypt: process.env.HANA_ENCRYPT !== 'false',
    validateCertificate: process.env.HANA_VALIDATE_CERT !== 'false',
  };
}

export function getServerConfig(): ServerConfig {
  return {
    httpPort: parseInt(process.env.HTTP_PORT || '3000'),
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
