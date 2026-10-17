import { describe, expect, it } from 'vitest';
import { buildOrderWalletReadyEmail } from './mailer.js';
import { walletEmailFixture } from './order-wallet-email.fixture.js';
import { walletEmailAmount } from './order-wallet-email-details.js';

describe('order-specific wallet email', () => {
  it.each([
    ['paypal','PYUSD','arbitrum','PayPal','https://www.paypal.com/myaccount/crypto/'],
    ['venmo','PYUSD','ethereum','Venmo','https://venmo.com/'],
    ['cash_app','BTC','bitcoin','Cash App','https://cash.app/launch/'],
    ['cash_app','USDC','arbitrum','Cash App','https://cash.app/launch/'],
    ['wallet','USDC','base','your crypto wallet',null],
  ] as const)('uses the recorded %s instructions and exact order details', (sendingApp,asset,network,name,url) => {
    const order = {...walletEmailFixture, sendingApp, asset, network, quotedAmountAtomic: asset === 'BTC' ? '12345' : '19090001'};
    const c=buildOrderWalletReadyEmail('https://cruush.app','cruush_plus','plus_monthly',order);
    for(const value of [order.id,order.paymentAddress!,asset, name,'2026-10-17 20:30:00 UTC']) {expect(c.html).toContain(value);expect(c.text).toContain(value);}
    expect(c.text).toContain(`Send exactly: ${asset === 'BTC' ? '0.00012345' : '19.090001'} ${asset}`);
    if (sendingApp === 'cash_app' && asset === 'USDC') { expect(c.text).toContain('Payment tab'); expect(c.text).not.toContain('external Bitcoin address'); }
    if(url) expect(c.html).toContain(`href="${url}"`);
    expect(c.html).toContain('class="glass-panel"');
  });
  it('does not give transfer instructions for unsupported Cash App assets', () => {
    const c=buildOrderWalletReadyEmail('https://cruush.app','cruush_plus','plus_monthly',{...walletEmailFixture,sendingApp:'cash_app'});
    expect(c.text).toContain('choose a supported payment method before sending');
    expect(c.text).not.toContain('full USDC amount');
    expect(c.text).not.toContain('external Bitcoin address');
  });
  it('uses quoted amounts and discounts without current price recalculation',()=>{
    const order={...walletEmailFixture, amountUsdCents:1519, quotedAmountAtomic:'15290000', discount:{code:'CLUBS20' as const,percentOff:20 as const,originalAmountUsdCents:1899,discountAmountUsdCents:380,amountUsdCents:1519}};
    const c=buildOrderWalletReadyEmail('https://cruush.app','cruush_plus','plus_monthly',order);
    expect(c.text).toContain('Discount: $3.80 USD');expect(c.text).toContain('Order total: $15.29 USD');expect(c.text).toContain('Coupon: CLUBS20');
  });
  it('escapes order data and refuses incomplete payment instructions',()=>{
    const c=buildOrderWalletReadyEmail('https://cruush.app','cruush_plus','plus_monthly',{...walletEmailFixture,planName:'<script>bad</script>'});
    expect(c.html).not.toContain('<script>');expect(c.html).toContain('&lt;script&gt;');
    expect(()=>walletEmailAmount({...walletEmailFixture,quotedAmountAtomic:null})).toThrow('Incomplete');
  });
});
