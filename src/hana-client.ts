import hana from '@sap/hana-client';
import { HanaConfig } from './config.js';

export class HanaClient {
  private connection: any;
  private config: HanaConfig;

  constructor(config: HanaConfig) {
    this.config = config;
    this.connection = null;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = hana.createConnection();
      
      conn.connect(
        {
          serverNode: `${this.config.host}:${this.config.port}`,
          uid: this.config.user,
          pwd: this.config.password,
          encrypt: this.config.encrypt,
          sslValidateCertificate: this.config.validateCertificate,
        },
        (err: any) => {
          if (err) {
            reject(err);
          } else {
            this.connection = conn;
            resolve();
          }
        }
      );
    });
  }

  async query(sql: string): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Not connected to HANA');
    }

    return new Promise((resolve, reject) => {
      this.connection.exec(sql, (err: any, result: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(result || []);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      return new Promise((resolve, reject) => {
        this.connection.close((err: any) => {
          if (err) {
            reject(err);
          } else {
            this.connection = null;
            resolve();
          }
        });
      });
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}
