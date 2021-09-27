const {
  advanceBlocks,
  etherUnsigned,
  both,
  encodeParameters,
  etherMantissa,
  mineBlock,
  freezeTime,
  increaseTime
} = require('./Utils/Ethereum');

const {
  BN,
  constants,
  ether,
  time,
  balance,
  expectEvent,
  expectRevert
} = require('@openzeppelin/test-helpers');

const timeMachine = require('ganache-time-traveler');

const Web3 = require('web3');
// Ganache UI on 8545
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const path = require('path');
const solparse = require('solparse');

const Token = artifacts.require('Token');
const Timelock = artifacts.require('Timelock');
const SliceGovernor = artifacts.require('SliceGovernor');

// const SLICE_ADDRESS = '0x0AeE8703D34DD9aE107386d3eFF22AE75Dd616D1';

const SliceGovernorPath = path.join(__dirname, '..', 'contracts', 'SliceGovernorStorage.sol');
console.log(SliceGovernorPath)
const statesInverted = solparse
  .parseFile(SliceGovernorPath)
  .body
  .find(k => k.name === 'SliceGovernorStorage')
  .body
  .find(k => k.name == 'ProposalState')
  .members

const states = Object.entries(statesInverted).reduce((obj, [key, value]) => ({ ...obj, [value]: key }), {});

contract('SliceGovernor#state/1', function(accounts) {
  let slice, gov, root, acct1, acct2, timelock;
  let trivialProposal, targets, values, signatures, callDatas;
  root = accounts[0];
  acct1 = accounts[1];
  acct2 = accounts[2];

  it('Before all...', async () => {
    // await timeMachine.advanceTimeAndBlock(100);
    
    slice = await Token.deployed();

    console.log(web3.utils.fromWei(await slice.balanceOf(root)));
    timelock = await Timelock.deployed();
    gov = await SliceGovernor.deployed();

    await gov.setTimelockAdmin(gov.address, {from: root})

    await slice.transfer(acct1, web3.utils.toWei('4000000'), {from: root})
    console.log(web3.utils.fromWei(await slice.balanceOf(acct1)));

    await slice.delegate(acct1, {from: acct1})

    targets = [root];
    values = ['0'];
    signatures = ['getBalanceOf(address)']
    callDatas = [encodeParameters(['address'], [acct1])];
    await slice.delegate(root)

    await gov.propose(targets, values, signatures, callDatas, 'do nothing')

    proposalId = await gov.latestProposalIds(root)
    trivialProposal = await gov.proposals(proposalId)
    console.log(JSON.stringify(trivialProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))
  })

  it('Invalid for proposal not found', async () => {
    await expectRevert(gov.state(5), 'SliceGovernor::state: invalid proposal id')
  })

  it('Pending', async () => {
    expect((await gov.state(trivialProposal[0])).toString()).equal(states['Pending'])
  })

  it('Active', async () => {
    await timeMachine.advanceBlock();
    await timeMachine.advanceBlock();
    expect((await gov.state(trivialProposal[0])).toString()).equal(states['Active'])
  })

  it('Canceled', async () => {
    await slice.transfer(acct2, web3.utils.toWei('4000000'), {from: root})
    await slice.delegate(acct2, {from: acct2})
    await timeMachine.advanceBlock();
    await gov.propose(targets, values, signatures, callDatas, 'do nothing', { from: acct2 })

    let newProposalId = await gov.proposalCount()
    newProposal = await gov.proposals(newProposalId)
    console.log(JSON.stringify(newProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

    // send away the delegates
    await slice.delegate(root, {from: acct2})
    await gov.cancel(newProposalId)

    expect((await gov.state(newProposalId)).toString()).equal(states['Canceled'])
  })

  it('Defeated', async () => {
    // travel to end block
    let block = await web3.eth.getBlockNumber();
    console.log(block)
    for (let i=0; i<18000; i++) {
      await timeMachine.advanceBlock();
    }
    block = await web3.eth.getBlockNumber();
    console.log(block)

    expect((await gov.state(trivialProposal[0])).toString()).equal(states['Defeated'])
  })

  it('Succeeded', async () => {
    await timeMachine.advanceBlock();
    await gov.propose(targets, values, signatures, callDatas, 'do nothing', { from: acct1 })

    newProposalId = await gov.latestProposalIds(acct1)
    newProposal = await gov.proposals(newProposalId)
    console.log(JSON.stringify(newProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

    await timeMachine.advanceBlock();
    await gov.castVote(newProposalId, 1)

    let block = await web3.eth.getBlockNumber();
    console.log(block)
    for (let i=0; i<18000; i++) {
      await timeMachine.advanceBlock();
    }
    block = await web3.eth.getBlockNumber();
    console.log(block)

    expect((await gov.state(newProposalId)).toString()).equal(states['Succeeded'])
  })

  it('Queued', async () => {
    await timeMachine.advanceBlock();
    await gov.propose(targets, values, signatures, callDatas, 'do nothing', { from: acct1 })
    
    newProposalId = await gov.latestProposalIds(acct1)
    newProposal = await gov.proposals(newProposalId)
    console.log(JSON.stringify(newProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

    await timeMachine.advanceBlock();
    await gov.castVote(newProposalId, 1)

    let block = await web3.eth.getBlockNumber();
    console.log(block)
    for (let i=0; i<18000; i++) {
      await timeMachine.advanceBlock();
    }
    block = await web3.eth.getBlockNumber();
    console.log(block)

    await gov.queue(newProposalId, { from: acct1 })
    expect((await gov.state(newProposalId)).toString()).equal(states['Queued'])
  })

  it('Expired', async () => {
    await timeMachine.advanceBlock();
    await gov.propose(targets, values, signatures, callDatas, 'do nothing', { from: acct1 })

    newProposalId = await gov.latestProposalIds(acct1)
    newProposal = await gov.proposals(newProposalId)
    console.log(JSON.stringify(newProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

    await timeMachine.advanceBlock();
    await gov.castVote(newProposalId, 1)

    let block = await web3.eth.getBlockNumber();
    console.log(block)
    for (let i=0; i<18000; i++) {
      await timeMachine.advanceBlock();
    }
    block = await web3.eth.getBlockNumber();
    console.log(block)

    await timeMachine.advanceTimeAndBlock(1);
    await gov.queue(newProposalId, { from: acct1 })

    block = await web3.eth.getBlockNumber();
    timeNow = (await web3.eth.getBlock(block)).timestamp
    console.log(timeNow)

    let gracePeriod = await timelock.GRACE_PERIOD()
    let p = await gov.proposals(newProposalId);
    let eta = new BN(p[2])
    console.log("eta: " + eta.toString())
    console.log("eta + gracePeriod: " + Number(eta.add(gracePeriod))) 
    
    diffTime = Number(eta.add(gracePeriod)) - Number(timeNow) - Number(1)
    console.log("seconds to advance before grace period expiration: " + diffTime)

    const addTime = Number(time.duration.seconds(Number(diffTime)));
    await timeMachine.advanceTimeAndBlock(addTime);
    block = await web3.eth.getBlockNumber();
    console.log("now: " + (await web3.eth.getBlock(block)).timestamp)

    expect((await gov.state(newProposalId)).toString()).equal(states['Queued'])

    await timeMachine.advanceTimeAndBlock(1);
    block = await web3.eth.getBlockNumber();
    console.log("now: " +(await web3.eth.getBlock(block)).timestamp)

    expect((await gov.state(newProposalId)).toString()).equal(states['Expired'])
  })

  it('Executed', async () => {
    await timeMachine.advanceBlock();

    await gov.propose(targets, values, signatures, callDatas, 'do nothing', { from: acct1 })

    newProposalId = await gov.latestProposalIds(acct1)
    newProposal = await gov.proposals(newProposalId)
    console.log(JSON.stringify(newProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

    await timeMachine.advanceBlock();
    await gov.castVote(newProposalId, 1)

    let block = await web3.eth.getBlockNumber();
    console.log(block)
    for (let i=0; i<18000; i++) {
      await timeMachine.advanceBlock();
    }
    block = await web3.eth.getBlockNumber();
    console.log(block)

    await timeMachine.advanceTimeAndBlock(1);
    await gov.queue(newProposalId, { from: acct1 })

    block = await web3.eth.getBlockNumber();
    timeNow = (await web3.eth.getBlock(block)).timestamp
    console.log(timeNow)

    let gracePeriod = await timelock.GRACE_PERIOD()
    let p = await gov.proposals(newProposalId);
    let eta = new BN(p[2])
    console.log("eta: " + eta.toString())
    console.log("eta + gracePeriod: " + Number(eta.add(gracePeriod))) 

    diffTime = Number(eta.add(gracePeriod)) - Number(timeNow) - Number(1)
    console.log("seconds to advance before grace period expiration: " + diffTime)

    const addTime = Number(time.duration.seconds(Number(diffTime)));
    await timeMachine.advanceTimeAndBlock(addTime);
    block = await web3.eth.getBlockNumber();
    console.log("now: " + (await web3.eth.getBlock(block)).timestamp)

    expect((await gov.state(newProposalId)).toString()).equal(states['Queued'])

    await gov.execute(newProposalId, { from: acct1 })

    expect((await gov.state(newProposalId)).toString()).equal(states['Executed'])

    // still executed even though would be expired
    await timeMachine.advanceTimeAndBlock(1);
    block = await web3.eth.getBlockNumber();
    console.log("now: " + (await web3.eth.getBlock(block)).timestamp)

    expect((await gov.state(newProposalId)).toString()).equal(states['Executed'])
  })

  it("resume all proposals", async () => {
    counter = await gov.proposalCount();
    for (let i = 1; i <= counter; i++) {
      p = await gov.proposals(i)
      console.log(JSON.stringify(p, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))
    }
  })

})