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
  mineBlock,
  unlockedAccount,
  mergeInterface
} = require('./Utils/Ethereum');
const EIP712 = require('./Utils/EIP712');
const BigNumber = require('bignumber.js');
const chalk = require('chalk');

const timeMachine = require('ganache-time-traveler');

const Web3 = require('web3');
// Ganache UI on 8545
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const Token = artifacts.require('Token');
const SliceGovernor = artifacts.require('SliceGovernor');

// launch ganache-cli with 'npx ganache-cli --deterministic' and set here account1 private key
const ACC1_PRIV_KEY = '0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1'

async function enfranchise(slice, actor, amount) {
  await slice.transfer(actor, web3.utils.toWei(amount))
  await slice.delegate(actor, {from: actor})
}

contract("SliceGovernor#castVote", function(accounts) {
  let slice, gov, root, a1;
  let targets, values, signatures, callDatas, proposalId;

  root = accounts[0]
  a1 = accounts[1]

  it("beforeAll..." , async () => {
    slice = await Token.deployed();

    gov = await SliceGovernor.deployed();
    
    targets = [a1];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(['address'], [a1])];

    await slice.delegate(root)
    await gov.propose(targets, values, signatures, callDatas, 'do nothing')

    proposalId = await gov.latestProposalIds(root)
    trivialProposal = await gov.proposals(proposalId)
    console.log(JSON.stringify(trivialProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))
  });

  describe("We must revert if:", () => {
    it("There does not exist a proposal with matching proposal id where the current block number is between the proposal's start block (exclusive) and end block (inclusive)", async () => {
      await expectRevert(gov.castVote(proposalId, 1), 'SliceGovernor::castVoteInternal: voting is closed')
    });

    it("Such proposal already has an entry in its voters set matching the sender", async () => {
      await timeMachine.advanceBlock();
      await timeMachine.advanceBlock();

      let vote = await gov.castVote(proposalId, 1, { from: accounts[4] });
      console.log(JSON.stringify(vote.logs[0].args, ["voter", "proposalId", "support", "votes", "reason"]))
      await expectEvent(vote, 'VoteCast');

      let vote2 = await gov.castVoteWithReason(proposalId, 1, "", { from: accounts[3] });
      console.log(JSON.stringify(vote2.logs[0].args, ["voter", "proposalId", "support", "votes", "reason"]))

      await expectRevert(gov.castVote(proposalId, 1, { from: accounts[4] }), 'SliceGovernor::castVoteInternal: voter already voted')
    });
    
  });

  describe("Otherwise", () => {
    it("we add the sender to the proposal's voters set", async () => {
      let receipt1 = await gov.getReceipt(proposalId, accounts[2])
      console.log(JSON.stringify(receipt1, ["hasVoted", "support", "votes"]))

      let vote = await gov.castVote(proposalId, 1, { from: accounts[2] });
      console.log(JSON.stringify(vote.logs[0].args, ["voter", "proposalId", "support", "votes", "reason"]))

      let receipt2 = await gov.getReceipt(proposalId, accounts[2])
      console.log(JSON.stringify(receipt2, ["hasVoted", "support", "votes"]))
    });

    describe("and we take the balance returned by GetPriorVotes for the given sender and the proposal's start block, which may be zero,", () => {
      let actor; // an account that will propose, receive tokens, delegate to self, and vote on own proposal

      it("and we add that ForVotes", async () => {
        actor = accounts[2];
        await enfranchise(slice, actor, "400001");

        await gov.propose(targets, values, signatures, callDatas, "do nothing", { from: actor });
        proposalId = await gov.latestProposalIds(actor);

        let beforeFors = (await gov.proposals(proposalId)).forVotes;
        await timeMachine.advanceBlock();
        await gov.castVote(proposalId, 1, { from: actor });

        let afterFors = (await gov.proposals(proposalId)).forVotes;

        balForNow = (new BN(beforeFors)).add(new BN(web3.utils.toWei("400001")))
        expect(afterFors.toString()).equal(balForNow.toString());
      })

      it("or AgainstVotes corresponding to the caller's support flag.", async () => {
        actor = accounts[3];
        await enfranchise(slice, actor, "400001");

        await gov.propose(targets, values, signatures, callDatas, "do nothing", { from: actor });
        proposalId = await gov.latestProposalIds(actor);

        let beforeAgainsts = (await gov.proposals(proposalId)).againstVotes;
        await timeMachine.advanceBlock();
        await gov.castVote(proposalId, 0, { from: actor });

        let afterAgainsts = (await gov.proposals(proposalId)).againstVotes;

        balAgainstNow = (new BN(beforeAgainsts)).add(new BN(web3.utils.toWei("400001")))
        expect(afterAgainsts.toString()).equal(balAgainstNow.toString());
      });
    });

    describe('castVoteBySig', () => {
      const Domain = (gov) => ({
        name: 'Slice Governor',
        chainId: 1, // await web3.eth.net.getId(); See: https://github.com/trufflesuite/ganache-core/issues/515
        verifyingContract: gov.address
      });
      const Types = {
        Ballot: [
          { name: 'proposalId', type: 'uint256' },
          { name: 'support', type: 'uint8' },
        ]
      };

      it('reverts if the signatory is invalid', async () => {
        await expectRevert(gov.castVoteBySig(proposalId, 0, 0, '0xbad', '0xbad'), 'SliceGovernor::castVoteBySig: invalid signature')
      });

      it('casts vote on behalf of the signatory', async () => {
        await enfranchise(slice, a1, "400001");
        await gov.propose(targets, values, signatures, callDatas, "do nothing", { from: a1 })
        proposalId = await gov.latestProposalIds(a1);

        // const { message, v, r, s } = EIP712.sign(Domain(gov), 'Ballot', { proposalId, support: 1 }, Types, unlockedAccount(a1).secretKey);
        const { message, v, r, s } = EIP712.sign(Domain(gov), 'Ballot', { proposalId, support: 1 }, Types, ACC1_PRIV_KEY);
        // const { v, r, s } = EIP712.sign(Domain(gov), 'Ballot', { proposalId, support: 1 }, Types, unlockedAccount(a1).secretKey);
        console.log(JSON.stringify(message) + ", v: " + v.toString() + ", r: " + r.toString('hex') + ", s: " + s.toString('hex'))
        // encMsg = web3.eth.accounts.sign('{"proposalId":"4","support":1}', ACC1_PRIV_KEY);
        // console.log(encMsg)
        // addr = await web3.eth.accounts.recover(JSON.stringify(message), encMsg.signature)
        // console.log(addr)

        let beforeFors = (await gov.proposals(proposalId)).forVotes;
        await timeMachine.advanceBlock();
        const tx = await gov.castVoteBySig(proposalId, 1, v, r, s);
        expect(tx.gasUsed < 80000);

        let afterFors = (await gov.proposals(proposalId)).forVotes;

        balForNow = (new BN(beforeFors)).add(new BN(web3.utils.toWei("400001")))
        expect(afterFors.toString()).equal(balForNow.toString());
      });

      it("receipt uses two loads", async () => {
        let actor = accounts[5];
        let actor2 = accounts[6];
        await enfranchise(slice, actor, "400001");
        await enfranchise(slice, actor2, "400001");
        await gov.propose(targets, values, signatures, callDatas, "do nothing", { from: actor });
      
        proposalId = await gov.latestProposalIds(actor)
        proposal = await gov.proposals(proposalId)
        console.log(JSON.stringify(proposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))

        await timeMachine.advanceBlock();
        await timeMachine.advanceBlock();
        await gov.castVote(proposalId, 1, { from: actor });
        await gov.castVote(proposalId, 0, { from: actor2 });

        let trxReceipt = await gov.getReceipt(proposalId, actor);
        let trxReceipt2 = await gov.getReceipt(proposalId, actor2);

        console.log("User: " + actor + ", Proposal #: " + proposalId + ", Receipt: " + JSON.stringify(trxReceipt, ["hasVoted", "support", "votes"]))
        console.log("User: " + actor2 + ", Proposal #: " + proposalId + ", Receipt: " + JSON.stringify(trxReceipt2, ["hasVoted", "support", "votes"]))

        // console.log(JSON.stringify(trxReceipt, ["hasVoted", "support", "votes"]))
        // console.log(JSON.stringify(trxReceipt2, ["hasVoted", "support", "votes"]))
        /*
        let govDelegateAddress = '000000000000000000000000' + govDelegate.address.toString().toLowerCase().substring(2);

        await saddle.trace(trxReceipt, {
          constants: {
            "account": actor
          },
          preFilter: ({op}) => op === 'SLOAD',
          postFilter: ({source}) => !source || source.includes('receipts'),
          execLog: (log) => {
            let [output] = log.outputs;
            let votes = "000000000000000000000000000000000000000054b419003bdf81640000";
            let voted = "01";
            let support = "01";

            if(log.depth == 0) {
              expect(output).toEqual(
                `${govDelegateAddress}`
              );
            }
            else {
              expect(output).toEqual(
                `${votes}${support}${voted}`
              );
            }
          },
          exec: (logs) => {
            expect(logs[logs.length - 1]["depth"]).toEqual(1); // last log is depth 1 (two SLOADS)
          }
        });

        await saddle.trace(trxReceipt2, {
          constants: {
            "account": actor2
          },
          preFilter: ({op}) => op === 'SLOAD',
          postFilter: ({source}) => !source || source.includes('receipts'),
          execLog: (log) => {
            let [output] = log.outputs;
            let votes = "0000000000000000000000000000000000000000a968320077bf02c80000";
            let voted = "01";
            let support = "00";

            if(log.depth == 0) {
              expect(output).toEqual(
                `${govDelegateAddress}`
              );
            }
            else {
              expect(output).toEqual(
                `${votes}${support}${voted}`
              );
            }
          },
          exec: (logs) => {
            expect(logs[logs.length - 1]["depth"]).toEqual(1); // last log is depth 1 (two SLOADS)
          }
        */
      });

    });
    
  });
  
});