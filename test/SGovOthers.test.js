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
    address,
    etherMantissa,
    encodeParameters,
    mineBlock
    } = require('./Utils/Ethereum');
  
const timeMachine = require('ganache-time-traveler');

const Web3 = require('web3');
// Ganache UI on 8545
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const Token = artifacts.require('Token');
const Timelock = artifacts.require('Timelock');
const SliceGovernor = artifacts.require('SliceGovernor');
  
contract('SliceGovernor#propose/5', function(accounts) {
    let slice, gov, root, acct1, acct2, timelock;
    let trivialProposal, targets, values, signatures, callDatas;
    root = accounts[0];
    acct1 = accounts[1];

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
    })

    it('Cast vote to abstain', async () => {
        targets = [acct1];
        values = ["0"];
        signatures = ["getBalanceOf(address)"];
        callDatas = [encodeParameters(['address'], [acct1])];

        await slice.delegate(root)
        await gov.propose(targets, values, signatures, callDatas, 'do nothing')

        proposalId = await gov.latestProposalIds(root)
        trivialProposal = await gov.proposals(proposalId)
        console.log(JSON.stringify(trivialProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

        await timeMachine.advanceBlock();
        await timeMachine.advanceBlock();

        let vote = await gov.castVote(proposalId, 2, { from: acct1 });
        console.log(JSON.stringify(vote.logs[0].args, ["voter", "proposalId", "support", "votes", "reason"]))
        await expectEvent(vote, 'VoteCast');
    })

    it('Other function to call to complete test coverage', async () => {
        await gov._setVotingDelay(12000);
        await gov._setVotingPeriod(50000);
        await gov._setProposalThreshold(web3.utils.toWei("280000"));
        await gov._setPendingAdmin(acct1);
        await gov._acceptAdmin({from: acct1});
        await gov._setPendingAdmin(root, {from: acct1});
        await gov._acceptAdmin();
    })
})