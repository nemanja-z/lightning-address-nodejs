import axios, { AxiosInstance } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { URL } from 'url';

import { LnrpcAddInvoiceResponse, LnrpcInvoice } from './types';
import logger from '../logger';
require('dotenv').config();

const BASE_URL = process.env.LNADDR_LND_REST_BASE_URL;
const MACAROON = process.env.LNADDR_LND_REST_MACAROON_HEX;
const TOR_PROXY_URL = process.env.LNADDR_TOR_PROXY_URL || 'socks5h://localhost:9050';
const WEBHOOK_URL = process.env.LNADDR_NOTIFICATION_WEBHOOK;

if (!BASE_URL || !MACAROON || !TOR_PROXY_URL) {
  throw new Error('Misconfigured Environment Variables');
}

interface LightningAPIArgs {
  baseUrl: string;
  macaroon: string;
  proxy: string;
}

class LightningAPI {
  baseUrl: string;
  macaroon: string;
  axios: AxiosInstance;
  // agent: SocksProxyAgent;
  // proxy: string;
  options: { rejectUnauthorized?: boolean };

  // constructor(args: LightningAPIArgs) {
  //   this.baseUrl = args.baseUrl;
  //   this.macaroon = args.macaroon;
  //   this.proxy = args.proxy;
  //   //
  //   const socks = new URL(args.proxy);
  //   // //
  //   const proxyUrl = `${socks.protocol}://${socks.hostname}:${socks.port}`;
  //
  //   // Pass the constructed URL to SocksProxyAgent
  //   this.agent = new SocksProxyAgent(proxyUrl);
  //   this.axios = axios.create({
  //     baseURL: args.baseUrl.endsWith('/') ? args.baseUrl : `${args.baseUrl}/`,
  //     headers: {
  //       'Grpc-Metadata-macaroon': args.macaroon
  //     },
  //     httpAgent: this.agent,
  //     httpsAgent: this.agent
  //   });
  //    this.agent.options.rejectUnauthorized = false; // Accept self-signed certificates or insecure TLS
  // }
  constructor(args: LightningAPIArgs) {
    this.baseUrl = args.baseUrl;
    this.macaroon = args.macaroon;
    this.options = { rejectUnauthorized: false }; // Accept self-signed certificates or insecure TLS

    // Create the Axios instance without a proxy
    this.axios = axios.create({
      baseURL: args.baseUrl.endsWith('/') ? args.baseUrl : `${args.baseUrl}/`,
      headers: {
        'Grpc-Metadata-macaroon': args.macaroon
      }
      // No need for httpAgent and httpsAgent since we're not using a proxy
    });

    // If you want to accept self-signed certificates or insecure TLS, you can set this option
    this.axios.defaults.httpsAgent = new (require('https').Agent)({
      rejectUnauthorized: false // Accept self-signed certificates or insecure TLS
    });
  }
  async lightningAddInvoice(createInvoiceArgs: LnrpcInvoice): Promise<LnrpcAddInvoiceResponse> {
    const resp = await this.axios.post<LnrpcAddInvoiceResponse>(`v1/invoices`, createInvoiceArgs);
    console.log({ resp });
    const invoice = resp.data;
    return invoice;
  }

  async sendWebhookNotification(data: any) {
    if (!WEBHOOK_URL) {
      logger.debug('Not sending Notification. LNADDR_NOTIFICATION_WEBHOOK not set');
    } else {
      logger.debug('Sending Webhook Notification', { url: WEBHOOK_URL, data });
      try {
        // await axios.post(WEBHOOK_URL, data, {
        //   httpAgent: this.agent,
        //   httpsAgent: this.agent
        // });
        await axios.post(WEBHOOK_URL, data);
      } catch (error) {
        logger.error('Error sending Webhook Notification', error);
      }
    }
  }
}

export const lightningApi = new LightningAPI({
  baseUrl: BASE_URL,
  macaroon: MACAROON,
  proxy: TOR_PROXY_URL
});
