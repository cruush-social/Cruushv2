# Crypto checkout amounts and sending allowances

September 12, 2026. Applies equally to cruush+ and Pulse packs. Implemented in `server/src/crypto-funding-estimate.ts` and the shared store component. Julien approved keeping unused sending allowance in the customer's app.

## Two amounts

- **Send exactly:** product price plus cruush's quoted collection cost, converted into the selected asset. This is the amount encoded in the payment QR code and required for settlement.
- **Have available:** that exact payment plus an estimated allowance for the selected app's sending fee. The allowance is not paid to cruush. For Cash App's USDC flow this is an available dollar balance; Cash App converts the payment into USDC. For Bitcoin and PYUSD this is an available crypto balance, with a dollar equivalent.

The collection cost covers the automatic transfer into cruush's ELLIPAL destination. Stablecoin collection includes the native gas-funding transaction where needed, the token transfer, and applicable network fee components. Receiving a normal Bitcoin or ERC-20 transfer does not create a separate recipient gas charge. The customer's outgoing app fee is separate.

## Implemented allowance policy

These are cruush's generous estimates, not Cash App, PayPal or Venmo fee quotes. No public rate schedule or accessible API establishes a guaranteed maximum for all customer sends. The app's final charge remains authoritative.

For each order the allowance is the largest of:

1. The payment-option floor below.
2. Ten percent of the product price, rounded up to the next whole dollar.
3. Three times the quoted cruush collection fee, rounded up to the next whole dollar, to add headroom when the selected network is expensive.

The third input uses cruush's observed network cost as a congestion signal; it does not reproduce a custodial app's batching or pricing. The estimate never changes the stored exact recipient amount. A generic wallet gets no sender allowance estimate.

| Product | Price | Cash App USDC / BTC | PayPal PYUSD / BTC | Venmo BTC | Venmo PYUSD / Ethereum |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 Pulses | $2.99 | $5 | $5 | $5 | $10 |
| 10 Pulses | $7.99 | $5 | $5 | $5 | $10 |
| 25 Pulses | $14.99 | $5 | $5 | $5 | $10 |
| 7 days cruush+ | $10.99 | $5 | $5 | $5 | $10 |
| 1 month cruush+ | $18.99 | $5 | $5 | $5 | $10 |
| 3 months cruush+ | $35.97 | $5 | $5 | $5 | $10 |
| 6 months cruush+ | $53.94 | $6 | $6 | $6 | $10 |
| Founder annual | $99.99 | $10 | $10 | $10 | $10 |
| Annual | $119.99 | $12 | $12 | $12 | $12 |
| Founder lifetime | $999.99 | $100 | $100 | $100 | $100 |
| Lifetime | $1,999.99 | $200 | $200 | $200 | $200 |

These table values are the price-based baseline. The network adjustment can raise them. Product availability still follows the existing catalog and founder supply rules. An allowance in the table does not make a below-minimum payment eligible.

For example, a $18.99 subscription with a $0.02 collection quote requires **19.01 USDC/PYUSD sent to cruush**. With a $5 allowance, the suggested available balance is **24.01**. If the app charges $2 to send it, the remaining $3 stays with the customer. Bitcoin uses the same split in satoshis at the stored order exchange rate.

## Provider minimums

PayPal and Venmo require at least 0.001 BTC for an external Bitcoin send. Venmo's Ethereum option requires at least 10 PYUSD; PayPal's Arbitrum option requires at least 1 PYUSD. The quote response flags orders below these recipient minimums and the checkout tells the member to choose another method before buying. Buying extra crypto cannot fix a recipient amount below the app's send minimum. [PayPal Digital terms, covering both apps](https://www.paypal.com/us/legalhub/paypal/cryptocurrencies-tnc)

Cash App's on-chain Bitcoin minimum is 0.00005 BTC. Its free Standard send requires at least 0.001 BTC and can take up to 24 hours. The code uses on-chain Bitcoin, not Lightning. [Cash App Bitcoin fees](https://cash.app/bitcoin/fees)

No third-party quote API is integrated. The sending allowance is an estimate of needed balance, not a guaranteed fiat checkout total for buying crypto. App purchase fees, account holds and price movement can affect acquiring that balance. The exact BTC invoice remains fixed once issued.

## Runtime evidence

A real local Arbitrum quote for the $99.99 founder annual plan returned a $0.02 collection fee, 100.01 USDC to send and $110.01 suggested Cash App balance. Changing to PayPal cancelled the first order and issued a distinct address with the same 100.01 PYUSD recipient amount and a fresh deadline. No funds were sent during these UI checks.

Pulse runtime verification returned a $2.99 pack plus $0.02 collection fee: 3.01 USDC to send and $8.01 suggested Cash App balance. Venmo returned 3.03 PYUSD with a $0.04 collection fee and correctly displayed its 10 PYUSD minimum warning. No funds were sent.
