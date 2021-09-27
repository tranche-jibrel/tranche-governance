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
const SliceGovernor = artifacts.require('SliceGovernor');

contract('SliceGovernor#propose/5', function(accounts) {
  let gov, slice, root, acct;
  let trivialProposal, targets, values, signatures, callDatas;
  let proposalBlock;

  root = accounts[0]
  acct = accounts[1]
  a2 = accounts[2]
  a3 = accounts[3]

  it("beforeAll..." , async () => {
    slice = await Token.deployed();

    gov = await SliceGovernor.deployed();
    
    targets = [root];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(['address'], [acct])];

    await slice.delegate(root)
    await gov.propose(targets, values, signatures, callDatas, 'do nothing')

    proposalId = await gov.latestProposalIds(root)
    trivialProposal = await gov.proposals(proposalId)
    console.log(JSON.stringify(trivialProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))
    proposalBlock = +(await web3.eth.getBlockNumber());
    console.log("Proposal block: " + proposalBlock)
  });

  it("Given the sender's GetPriorVotes for the immediately previous block is above the Proposal Threshold (e.g. 2%), the given proposal is added to all proposals, given the following settings", async () => {
    console.log('TODO: depends on get prior votes and delegation and voting');
  });

  describe("simple initialization", () => {
    it("ID is set to a globally unique identifier", async () => {
      expect(Number(trivialProposal.id)).equal(Number(proposalId));
    });

    it("Proposer is set to the sender", async () => {
      expect(trivialProposal.proposer).equal(root);
    });

    it("Start block is set to the current block number plus vote delay", async () => {
      expect(Number(trivialProposal.startBlock)).equal(Number(proposalBlock + 1 + ""));
    });

    it("End block is set to the current block number plus the sum of vote delay and vote period", async () => {
      expect(Number(trivialProposal.endBlock)).equal(Number(proposalBlock + 1 + 17280 + ""));
    });

    it("ForVotes and AgainstVotes are initialized to zero", async () => {
      expect((trivialProposal.forVotes).toString()).equal("0");
      expect((trivialProposal.againstVotes).toString()).equal("0");
    });

    it("Voters is initialized to the empty set", async () => {
      console.log('TODO: mmm probably nothing to prove here unless we add a counter or something');
    });

    it("Executed and Canceled flags are initialized to false", async () => {
      expect(trivialProposal.canceled).equal(false);
      expect(trivialProposal.executed).equal(false);
    });

    it("ETA is initialized to zero", async () => {
      expect((trivialProposal.eta).toString()).equal("0");
    });

    it("Targets, Values, Signatures, Calldatas are set according to parameters", async () => {
      let dynamicFields = await gov.getActions(trivialProposal.id);
      console.log(JSON.stringify(dynamicFields, ["targets", "values", "signatures", "calldatas"]))
      expect(dynamicFields.targets[0]).equal(targets[0]);
      expect((dynamicFields.values[0]).toString()).equal(values[0]);
      expect((dynamicFields.signatures[0]).toString()).equal(signatures[0]);
      expect(dynamicFields.calldatas[0]).equal(callDatas[0]);
    });

    describe("This function must revert if", () => {
      it("the length of the values, signatures or calldatas arrays are not the same length,", async () => {
        await expectRevert(gov.propose(targets.concat(root), values, signatures, callDatas, "do nothing"), 
            'SliceGovernor::propose: proposal function information arity mismatch')

        await expectRevert(gov.propose(targets, values.concat(values), signatures, callDatas, "do nothing"), 
            'SliceGovernor::propose: proposal function information arity mismatch')

        await expectRevert(gov.propose(targets, values, signatures.concat(signatures), callDatas, "do nothing"), 
            'SliceGovernor::propose: proposal function information arity mismatch')

        await expectRevert(gov.propose(targets, values, signatures, callDatas.concat(callDatas), "do nothing"), 
            'SliceGovernor::propose: proposal function information arity mismatch')
      });

      it("or if that length is zero or greater than Max Operations.", async () => {
        await expectRevert(gov.propose([], [], [], [], "do nothing"), 'SliceGovernor::propose: must provide actions')
      });

      describe("Additionally, if there exists a pending or active proposal from the same proposer, we must revert.", () => {
        it("reverts with pending", async () => {
          await expectRevert(gov.propose(targets, values, signatures, callDatas, "do nothing"), 
              'SliceGovernor::propose: one live proposal per proposer, found an already active proposal')
        });

        it("reverts with active", async () => {
          await timeMachine.advanceBlock();
          await timeMachine.advanceBlock();

          await expectRevert(gov.propose(targets, values, signatures, callDatas, "do nothing"), 
              'SliceGovernor::propose: one live proposal per proposer, found an already active proposal')
        });
      });
    });

    it("This function returns the id of the newly created proposal. # proposalId(n) = succ(proposalId(n-1))", async () => {
      await slice.transfer(a2, web3.utils.toWei("400001"))
      await slice.delegate(a2, {from: a2})

      await timeMachine.advanceBlock();
      await gov.propose(targets, values, signatures, callDatas, "yoot", { from: a2 });
      // let nextProposalId = await call(gov, 'propose', [targets, values, signatures, callDatas, "second proposal"], { from: accounts[2] });
      nextProposalId = await gov.latestProposalIds(a2);

      expect(+nextProposalId).equal(+trivialProposal.id + 1);
    });

    it("emits log with id and description", async () => {
      await slice.transfer(a3, web3.utils.toWei("400001"))
      await slice.delegate(a3, {from: a3})

      await timeMachine.advanceBlock();
      // await gov.propose(targets, values, signatures, callDatas, "yoot", { from: a3 });
      // proposalId = await gov.latestProposalIds(a3);

      const {tx} = await gov.propose(targets, values, signatures, callDatas, "second proposal", { from: a3 });
      nextProposalId = await gov.latestProposalIds(a3);
      nextProposal = await gov.proposals(nextProposalId)
      console.log(JSON.stringify(nextProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))
      blStart = nextProposal.startBlock
      blEnd = nextProposal.endBlock
      await expectEvent.inTransaction(tx, gov, 'ProposalCreated', eventArgs = {
                          id: nextProposalId,
                          targets: targets,
                          values: values,
                          signatures: signatures,
                          calldatas: callDatas,
                          startBlock: blStart,
                          endBlock: blEnd,
                          description: "second proposal",
                          proposer: accounts[3] })

    });
  });

});
