# Slice Governance

<img src="https://gblobscdn.gitbook.com/spaces%2F-MP969WsfbfQJJFgxp2K%2Favatar-1617981494187.png?alt=media" alt="Tranche Logo" width="100">

Slice governace is derived from Compound Governance

## Development

### Install Dependencies

```bash
npm i
```

### Compile project

```bash
truffle compile --all
```

### Run test

Ways to test contracts:

All tests (ganache required: npx ganache-cli --deterministic -l 12000000), gas reporter included:

    `truffle test`   

1 test only (ganache required: npx ganache-cli --deterministic -l 12000000), gas reporter included:

    `truffle test ./test/IncentiveRewards.test.js`   

Solidity Coverage (no ganache required):

    `truffle run coverage --network development --file="<filename>"`   

### Test Coverage

For tests, launch ganache-cli with `npx ganache-cli --deterministic` and set account1 private key in `SGovCastVote.test.js` and in `Token.test.js`

For example `const ACC1_PRIV_KEY = '0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1'`

Tests on Slice governance is 94.74%.

Tests on Timelock is 83.33%.

Tests on Token (only governance part) is 45.57%, other parts tested in token-rotocol repo, total is 100%. 

[(Back to top)](#slice-governance)

## Main contracts - Name, Size and Description

<table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Size (KiB)</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
        <tr>
            <td>SliceGovernor</td>
            <td><code>15.17</code></td>
            <td>Contract for governance (implementation), allowing to add proposals and voting to Slice Holders</td>
        </tr>
        <tr>
            <td>SliceGovernorEvents</td>
            <td><code>0.06</code></td>
            <td>Contract for governance events, used by SliceGovernor contract</td>
        </tr>
        <tr>
            <td>SliceGovernorStorage</td>
            <td><code>0.80</code></td>
            <td>Storage Contract for governance implementation, used by SliceGovernor contract</td>
        </tr>
        <tr>
            <td>Timelock</td>
            <td><code>5.63</code></td>
            <td>Contract that locks time for voting proposals</td>
        </tr>
        <tr>
            <td>Token</td>
            <td><code>10.21</code></td>
            <td>Token contract with governance</td>
        </tr>
    </tbody>
  </table>

[(Back to top)](#slice-governance)