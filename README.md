# LND Lightning Address

A dead simple [Lightning Address](https://www.lightningaddress.com) server for your personal Lightning Node!

This will allow your to receive lightning address payments. It's like an email address but for sats!

## What you need

- LND Server
- Domain Name

## Usage

### Setup Environment Variables

- Create a .env file
- Find your LND REST Endpoint
- Generate a Macaroon with Create Invoice permissions
- Set your LND config. See `.env.sample` for example values
- Set your domain name

### Start Server

- `docker compose up`

## Config

| Env Var                        | Required | Description                                                                                  |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| `LNADDR_LND_REST_BASE_URL`     | true     | Your LND REST URL e.g. `https://xxxx.onion:8080` address                                     |
| `LNADDR_LND_REST_MACAROON_HEX` | true     | Create Invoice Macaroon                                                                      |
| `LNADDR_DOMAIN`                | true     | Your domain name e.g. `fatbear.me`                                                           |
| `LNADDR_NOTIFICATION_WEBHOOK`  | false    | Webhook URL to receive notifications when invoices are created. e.g. `https://hookb.in/xxxx` |

## Endpoints

| Endpoint                                     | Description                 |
| -------------------------------------------- | --------------------------- |
| `/`                                          | Basic welcome page          |
| `/healthz`                                   | Health Check                |
| `/.well-known/lnurlp/:username`              | Lightning Address           |
| `/.well-known/lnurlp/:username/verify/:hash` | LUD-21 payment verification |

The invoice callback advertises the `verify` URL, so a payer can confirm settlement and
obtain the preimage without watching the chain. The macaroon needs invoice read permission
as well as invoice creation.

## Attack modes (regtest only)

For testing a payer against a hostile receiver. Off unless `LNADDR_ATTACK_MODES=1`, which also
requires `LNADDR_ATTACK_TOKEN`. Never enable it on a server with real funds.

The username's prefix picks the behaviour; any other username gets an ordinary invoice:

| Address                 | Invoice returned                                                               |
| ----------------------- | ------------------------------------------------------------------------------ |
| `skim-<name>@domain`    | Ordinary. The fee comes from the channel policy of the node in front of LND    |
| `hint-<name>@domain`    | Private, so it carries route hints with that node's fee over a private channel |
| `hold-<name>@domain`    | Hold invoice: the HTLC stays pending until settled or cancelled below          |
| `over-<name>@domain`    | Twice the requested amount                                                     |
| `zero-<name>@domain`    | No amount                                                                      |
| `expired-<name>@domain` | Expires after one second                                                       |

Hold invoices are settled or cancelled with the token in an `x-attack-token` header:

| Endpoint                         | Description                                |
| -------------------------------- | ------------------------------------------ |
| `GET /attack/hold`               | Hashes of hold invoices not yet resolved   |
| `POST /attack/hold/:hash/settle` | Settle with the preimage this server kept  |
| `POST /attack/hold/:hash/cancel` | Cancel, failing the HTLC back to the payer |

Preimages live in memory, so a restart leaves earlier hold invoices to expire on their own.
The macaroon needs invoice write permission for the `v2/invoices` calls.

## Deploy

### Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Deploy on [Render](https://render.com/) free tier. You will need to configure you [Custom Domain](https://render.com/docs/custom-domains) after it deploys.

Services on [free plan](https://render.com/docs/free) are automatically spun down after 15 minutes of inactivity. When a new request for a free service comes in, Render spins it up again so it can process the request. This can cause a response delay of up to 30 seconds for the first request that comes in after a period of inactivity.

**Fatbear Pro Tip:** You could setup a cron job on your umbrel to curl the `/healthz` endpoint every ~15 minutes.

## Umbrel

There are a few additional setups required for this to work on your Umbrel node. That is until [Issue 1082](https://github.com/getumbrel/umbrel/issues/1082) has been resolved.

STEPS:

1. SSH to your umbrel server `ssh umbrel@umbrel.local` you will need your umbrel password
2. Find your LND REST browser URL `cat umbrel/tor/data/lnd-rest/hostname`. It have a bunch of characters and end with `.onion`. Prepend `https://` and append `:8080` to this values to get `LNADDR_LND_REST_BASE_URL` env variable.
3. Open your LND Config File `vim umbrel/lnd/lnd.conf`
4. Under Application Options add an additional `tlsextradomain` line with your hostname from step 2.
5. Restart your Umbrel. Can be done from your Umbrel's settings UI.

Your lnd.config should have two `tlsextradomain` lines. e.g.

```
tlsextradomain=umbrel.local
tlsextradomain=xxxxxx.onion
```

## Create Invoice Macaroon

You will need a HEX encoded macaroon for the `LNADDR_LND_REST_MACAROON_HEX` env variable.
I highly recommend generating a macaroon with only create invoice permissions. You can use Thunderhub to do this easily.

1. Open Thunderhub
2. Go to `Tools` in sidebar
3. Bakery -> Bake Macaroon
4. Give `Create Invoice` permissions
5. Hit `Bake new macaroon` button.
6. Copy the HEX encoded value
