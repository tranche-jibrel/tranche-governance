const {
  BN,
  constants,
  ether,
  time,
  balance,
  expectEvent,
  expectRevert
} = require('@openzeppelin/test-helpers');
const {
  both,
  etherMantissa,
  encodeParameters,
  advanceBlocks,
  freezeTime,
  mineBlock
} = require('./Utils/Ethereum');

const timeMachine = require('ganache-time-traveler');

const Web3 = require('web3');
// Ganache UI on 8545
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const Token = artifacts.require('Token');
const Timelock = artifacts.require('Timelock');
const SliceGovernor = artifacts.require('SliceGovernor');

async function enfranchise(slice, actor, amount) {
  await slice.transfer(actor, web3.utils.toWei(amount))
  await slice.delegate(actor, {from: actor})
}

contract('SliceGovernor#queue/1', function(accounts) {
  let root, a1, a2, a3;
  let timelock, gov, slice;

  root = accounts[0]
  a1 = accounts[1]
  a2 = accounts[2]
  a3 = accounts[3]

  describe("overlapping actions", () => {
    it('Before all...', async () => {
      slice = await Token.deployed();
      console.log(web3.utils.fromWei(await slice.balanceOf(root)));
      timelock = await Timelock.deployed();
      gov = await SliceGovernor.deployed();
    })
      

    it("reverts on queueing overlapping actions in same proposal", async () => {
      await enfranchise(slice, a1, "3000000");
      await timeMachine.advanceBlock();

      const targets = [slice.address, slice.address];
      const values = ["0", "0"];
      const signatures = ["getBalanceOf(address)", "getBalanceOf(address)"];
      const calldatas = [encodeParameters(['address'], [root]), encodeParameters(['address'], [root])];
      await gov.propose(targets, values, signatures, calldatas, 'do nothing', { from: a1 })

      proposalId1 = await gov.latestProposalIds(a1)
      proposal = await gov.proposals(proposalId1)
      console.log(JSON.stringify(proposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

      await timeMachine.advanceBlock();

      const txVote1 = await gov.castVote(proposalId1, 1, {from: a1});

      let block = await web3.eth.getBlockNumber();
      console.log(block)
      for (let i=0; i<18000; i++) {
        await timeMachine.advanceBlock();
      }
      block = await web3.eth.getBlockNumber();
      console.log(block)

      await expectRevert(gov.queue(proposalId1), 'SliceGovernor::queueOrRevertInternal: identical proposal action already queued at eta')
    });

    it("reverts on queueing overlapping actions in different proposals, works if waiting", async () => {
      await enfranchise(slice, a2, "3000000");
      await enfranchise(slice, a3, "3000000");
      await timeMachine.advanceBlock();

      const targets = [slice.address];
      const values = ["0"];
      const signatures = ["getBalanceOf(address)"];
      const calldatas = [encodeParameters(['address'], [root])];

      await gov.propose(targets, values, signatures, calldatas, 'do nothing', { from: a2 })
      proposalId1 = await gov.latestProposalIds(a2)
      proposal1 = await gov.proposals(proposalId1)
      console.log(JSON.stringify(proposal1, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

      await gov.propose(targets, values, signatures, calldatas, 'do nothing', { from: a3 })
      proposalId2 = await gov.latestProposalIds(a3)
      proposal2 = await gov.proposals(proposalId2)
      console.log(JSON.stringify(proposal2, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

      await timeMachine.advanceBlock();

      const txVote1 = await gov.castVote(proposalId1, 1, {from: a2});
      const txVote2 = await gov.castVote(proposalId2, 1, {from: a3});

      let block = await web3.eth.getBlockNumber();
      console.log(block)
      for (let i=0; i<18000; i++) {
        await timeMachine.advanceBlock();
      }
      block = await web3.eth.getBlockNumber();
      console.log(block)

      await timeMachine.advanceTimeAndBlock(100);

      const txQueue1 = await gov.queue(proposalId1);
      await expectRevert(gov.queue(proposalId2), 'SliceGovernor::queueOrRevertInternal: identical proposal action already queued at eta')

      await timeMachine.advanceTimeAndBlock(1);
      const txQueue2 = await gov.queue(proposalId2);
    }); 
  });
});
