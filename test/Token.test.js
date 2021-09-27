const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const {
  address,
  minerStart,
  minerStop,
  unlockedAccount,
  mineBlock
} = require('./Utils/Ethereum');

const EIP712 = require('./Utils/EIP712');

const timeMachine = require('ganache-time-traveler');

const Web3 = require('web3');
// Ganache UI on 8545
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const Token = artifacts.require('Token');

// launch ganache-cli with 'npx ganache-cli --deterministic' and set here account1 private key
const ACC1_PRIV_KEY = '0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1'

const BigNumber = web3.utils.BN;
require("chai")
  .use(require("chai-bn")(BigNumber))
  .should();

const { ZERO_ADDRESS } = constants;

contract('Token', function(accounts) {
  const name = 'Slice Token';
  const symbol = 'SLICE';

  let root, a1, a2, chainId;
  let slice, t1, t2;

  root = accounts[0]
  a1 = accounts[1]
  a2 = accounts[2]

  chainId = 1

  it("beforeAll..." , async () => {
    slice = await Token.deployed();
  })

  describe('metadata', () => {
    it('token address not zero', async function () {
      expect(await slice.address).to.be.not.equal(ZERO_ADDRESS);
    });

    it('has given name', async () => {
      expect(await slice.name()).equal(name);
    });

    it('has given symbol', async () => {
      expect(await slice.symbol()).to.equal(symbol);
    });
  });

  describe('balanceOf', () => {
    it('grants to initial account', async () => {
      expect((await slice.balanceOf(root)).toString()).equal(web3.utils.toWei("20000000"));
    });
  });

  describe('delegateBySig', () => {
    const Domain = (slice) => ({ name, chainId, verifyingContract: slice.address });
    const Types = {
      Delegation: [
        { name: 'delegatee', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expiry', type: 'uint256' }
      ]
    };

    it('reverts if the signatory is invalid', async () => {
      const delegatee = root, nonce = 0, expiry = 0;
      await expectRevert(slice.delegateBySig(delegatee, nonce, expiry, 0, '0xbad', '0xbad'), 'Token::delegateBySig: invalid signature')
    });

    it('reverts if the nonce is bad ', async () => {
      const delegatee = root, nonce = 1, expiry = 0;
      const { v, r, s } = EIP712.sign(Domain(slice), 'Delegation', { delegatee, nonce, expiry }, Types, ACC1_PRIV_KEY);
      await expectRevert(slice.delegateBySig(delegatee, nonce, expiry, v, r, s), "Token::delegateBySig: invalid nonce");
    });

    it('reverts if the signature has expired', async () => {
      const delegatee = root, nonce = 0, expiry = 0;
      const { v, r, s } = EIP712.sign(Domain(slice), 'Delegation', { delegatee, nonce, expiry }, Types, ACC1_PRIV_KEY);
      await expectRevert(slice.delegateBySig(delegatee, nonce, expiry, v, r, s), "Token::delegateBySig: signature expired");
    });

    it('delegates on behalf of the signatory', async () => {
      const delegatee = root, nonce = 0, expiry = 10e9;
      const { v, r, s } = EIP712.sign(Domain(slice), 'Delegation', { delegatee, nonce, expiry }, Types, ACC1_PRIV_KEY);
      expect(await slice.delegates(a1)).equal(address(0));
      const tx = await slice.delegateBySig(delegatee, nonce, expiry, v, r, s);
      expect(tx.gasUsed < 80000);
      expect(await slice.delegates(a1)).equal(root);
    });
  });

  describe('numCheckpoints', () => {
    it('returns the number of checkpoints for a delegate', async () => {
      let guy = accounts[5];

      await slice.transfer(guy, web3.utils.toWei('100'), { from: root });
      numCheckpoints = await slice.numCheckpoints(guy);
      expect(numCheckpoints.toString()).equal('0');

      const t1 = await slice.delegate(a1, { from: guy });
      numCheckpoints = await slice.numCheckpoints(a1);
      expect(numCheckpoints.toString()).equal('1');

      const t2 = await slice.transfer(a2, web3.utils.toWei('10'), { from: guy });
      numCheckpoints = await slice.numCheckpoints(a1);
      expect(numCheckpoints.toString()).equal('2');

      const t3 = await slice.transfer(a2, web3.utils.toWei('10'), { from: guy });
      numCheckpoints = await slice.numCheckpoints(a1);
      expect(numCheckpoints.toString()).equal('3');

      const t4 = await slice.transfer(guy, web3.utils.toWei('20'), { from: root });
      numCheckpoints = await slice.numCheckpoints(a1);
      expect(numCheckpoints.toString()).equal('4');

      expect(((await slice.checkpoints(a1, 0))['fromBlock']).toString()).equal((t1.receipt.blockNumber).toString());
      expect(((await slice.checkpoints(a1, 0))['votes']).toString()).equal(web3.utils.toWei('100'));
      expect(((await slice.checkpoints(a1, 1))['fromBlock']).toString()).equal((t2.receipt.blockNumber).toString());
      expect(((await slice.checkpoints(a1, 1))['votes']).toString()).equal(web3.utils.toWei('90'));
      expect(((await slice.checkpoints(a1, 2))['fromBlock']).toString()).equal((t3.receipt.blockNumber).toString());
      expect(((await slice.checkpoints(a1, 2))['votes']).toString()).equal(web3.utils.toWei('80'));
      expect(((await slice.checkpoints(a1, 3))['fromBlock']).toString()).equal((t4.receipt.blockNumber).toString());
      expect(((await slice.checkpoints(a1, 3))['votes']).toString()).equal(web3.utils.toWei('100'));
    });

    it('does not add more than one checkpoint in a block', async () => {
      let guy = accounts[6];
      let guy2 = accounts[7];

      await slice.transfer(guy, 100); //give an account a few tokens for readability
      numCheckpoints = await slice.numCheckpoints(guy2);
      expect(numCheckpoints.toString()).equal('0');
      // await minerStop();

      let t1 = slice.delegate(guy2, { from: guy });
      let t2 = slice.transfer(guy2, 10, { from: guy });
      let t3 = slice.transfer(guy2, 10, { from: guy });

      // await minerStart();
      t1 = await t1;
      t2 = await t2;
      t3 = await t3;

      numCheckpoints = await slice.numCheckpoints(guy2);
      expect(numCheckpoints.toString()).equal('3');
      // await expect(call(slice, 'numCheckpoints', [a1])).resolves.equal('1');

      // expect(((await slice.checkpoints(a1, 0))['fromBlock']).toString()).equal((t1.receipt.blockNumber).toString());
      expect(((await slice.checkpoints(guy2, 1))['votes']).toString()).equal('90');
      expect(((await slice.checkpoints(guy2, 2))['votes']).toString()).equal('80');
      expect(((await slice.checkpoints(guy2, 3))['votes']).toString()).equal('0');
      // await expect(call(slice, 'checkpoints', [a1, 0])).resolves.equal(expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '80' }));
      // await expect(call(slice, 'checkpoints', [a1, 1])).resolves.equal(expect.objectContaining({ fromBlock: '0', votes: '0' }));
      // await expect(call(slice, 'checkpoints', [a1, 2])).resolves.equal(expect.objectContaining({ fromBlock: '0', votes: '0' }));

      const t4 = await slice.transfer(guy, 20, { from: root });
      numCheckpoints = await slice.numCheckpoints(guy2);
      expect(numCheckpoints.toString()).equal('4');
      // await expect(call(slice, 'numCheckpoints', [a1])).resolves.equal('2');
      expect(((await slice.checkpoints(guy2, 4))['votes']).toString()).equal('0');
      // await expect(call(slice, 'checkpoints', [a1, 1])).resolves.equal(expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '100' }));
    });
  });

  describe('getPriorVotes', () => {
    it('reverts if block number >= current block', async () => {
      try {
        await slice.getPriorVotes(a1, 5e10);
      } catch(err) {
        expect(err.toString()).to.have.string('Token::getPriorVotes: not yet determined');
      }
      // await expectRevert(await slice.getPriorVotes(a1, 5e10), 'revert Token::getPriorVotes: not yet determined');
    });

    it('returns 0 if there are no checkpoints', async () => {
      expect((await slice.getPriorVotes(a1, 0)).toString()).equal('0');
    });

    it('returns the latest block if >= last checkpoint block', async () => {
      t1 = await slice.delegate(a1, { from: root });
      // console.log(t1)
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();

      expect((await slice.getPriorVotes(a1, t1.receipt.blockNumber)).toString()).equal('19999979999999999999999880');
      expect((await slice.getPriorVotes(a1, t1.receipt.blockNumber + 1)).toString()).equal('19999979999999999999999880');
    });

    it('returns previous votes if < first checkpoint block', async () => {
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();

      expect((await slice.getPriorVotes(a1, t1.receipt.blockNumber - 1)).toString()).equal('100000000000000000000');
      expect((await slice.getPriorVotes(a1, t1.receipt.blockNumber + 4)).toString()).equal('19999979999999999999999880');
      
    });

    it('generally returns the voting balance at the appropriate checkpoint', async () => {
      const t1 = await slice.delegate(a1, { from: root });
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();
      const t2 = await slice.transfer(a2, 10, { from: root });
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();
      const t3 = await slice.transfer(a2, 10, { from: root });
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();
      const t4 = await slice.transfer(root, 20, { from: a2 });
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();

      expect((await slice.getPriorVotes(a1, t1.receipt.blockNumber - 1)).toString()).equal('19999979999999999999999880');
      expect((await slice.getPriorVotes(a1, t1.receipt.blockNumber)).toString()).equal('19999979999999999999999880');
      expect((await slice.getPriorVotes(a1, t1.receipt.blockNumber+1)).toString()).equal('19999979999999999999999880');
      expect((await slice.getPriorVotes(a1, t2.receipt.blockNumber)).toString()).equal('19999979999999999999999870');
      expect((await slice.getPriorVotes(a1, t2.receipt.blockNumber+1)).toString()).equal('19999979999999999999999870')
      expect((await slice.getPriorVotes(a1, t3.receipt.blockNumber)).toString()).equal('19999979999999999999999860');
      expect((await slice.getPriorVotes(a1, t3.receipt.blockNumber+1)).toString()).equal('19999979999999999999999860');
      expect((await slice.getPriorVotes(a1, t4.receipt.blockNumber)).toString()).equal('19999979999999999999999880');
      expect((await slice.getPriorVotes(a1, t4.receipt.blockNumber+1)).toString()).equal('19999979999999999999999880');
    });
  });
});
