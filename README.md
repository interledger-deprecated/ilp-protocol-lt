# ilp-protocol-lt
Implementation of Loopback Transport (IL-RFC-29)

For a demo of how to route a chunked payment over a connector with a random exchange rate, run:
```sh
git clone https://github.com/interledgerjs/ilp-protocol-lt
cd ilp-protocol-lt
npm install
npm run test
node scripts/rouletteReceiver.js

# in a second window:
cd ilp-protocol-lt
node scripts/rouletteConnector.js

# in a third window:
cd ilp-protocol-lt
node scripts/rouletteSender.js
```
