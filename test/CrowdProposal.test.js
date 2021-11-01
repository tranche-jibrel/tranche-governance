const { uint, address, encodeParameters, sendRPC, mergeInterface } = require('./Utils/Helpers');
const BigNumber = require("bignumber.js");
// const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
// const { web3 } = require('@openzeppelin/test-helpers/src/setup');

const Web3 = require('web3');
// Ganache UI on 8545
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const states =  {
  Pending: '0',
  Active: '1',
  Canceled: '2',
  Defeated: '3',
  Succeeded: '4',
  Queued: '5',
  Expired: '6',
  Executed: '7'
};

const Token = artifacts.require('Token');
const SliceGovernor = artifacts.require('SliceGovernor');
const CrowdProposal = artifacts.require('CrowdProposal');

contract('CrowdProposal', (accounts) => {
    let slice, gov, root, a1;
    let author, proposal;

    let targets, values, signatures, callDatas, description;

    root = accounts[0]
    a1 = accounts[1]

    const minSlice = new BigNumber(1000e18);

    beforeEach(async () => {
      
      slice = await Token.deployed();
      gov = await SliceGovernor.deployed();
      
      author = accounts[0];

      // Proposal data
      targets = [root];
      values = ["0"];
      signatures = ["getBalanceOf(address)"];
      callDatas = [encodeParameters(['address'], [a1])];
      description = "do nothing";

      // Create proposal, mimic factory behavior
      proposal = await CrowdProposal.new(
        author, 
        targets, 
        values, 
        signatures, 
        callDatas, 
        description, 
        slice.address, 
        gov.address
        );

      // 1. Stake SLICE
      await slice.transfer(proposal.address, minSlice, { from: root });
    });

    describe('metadata', () => {
      it('has govProposalId set to 0', async () => {
        expect((await proposal.govProposalId.call()).toString()).equal('0');
      });

      it('has given author', async () => {
        expect(await proposal.author.call()).equal(author);
      });

      it('has given slice', async () => {
        expect(await proposal.slice.call()).equal(slice.address);
      });

      it('has given governor', async () => {
        expect(await proposal.governor.call()).equal(gov.address);
      });

      it('has given targets', async () => {
        expect(await proposal.targets.call([0])).equal(targets[0]);
      });

      it('has given values', async () => {
        expect((await proposal.values.call([0])).toString()).equal(values[0]);
      });

      it('has given signatures', async () => {
        expect(await proposal.signatures.call([0])).equal(signatures[0]);
      });

      it('has given calldatas', async () => {
        expect(await proposal.calldatas.call([0])).equal(callDatas[0]);
      });

      it('has given description', async () => {
        expect(await proposal.description.call()).equal(description);
      });
    });

    describe('propose', () => {
      it('should pass if enough votes were delegated', async() => {
        // Check start balance of votes
        expect(parseInt(await slice.balanceOf.call(proposal.address))).equal(minSlice.toNumber());
        expect(parseInt(await slice.getCurrentVotes.call(proposal.address))).equal(minSlice.toNumber());

        // Check that gov proposal has not beem proposed yet
        expect((await proposal.govProposalId.call()).toString()).equal('0');

        // Delegate all votes to proposal
        await slice.delegate(proposal.address, {from: root});

        // Propose
        const trx = await proposal.propose({from: root});

        const govProposalId = await trx.logs.map(async (event) => {
          expect(event.event).equal('CrowdProposalProposed');
          expect(event.args.author).equal(author);
          expect(event.args.proposal).equal(proposal.address);

          expect((await proposal.govProposalId.call()).toString()).equal(event.args.proposalId.toString());
          return event.args.proposalId.toString()
        })[0]

        // Check state of governance proposal
        const proposalData = await gov.proposals.call(govProposalId);
        expect((proposalData.againstVotes).toString()).equal('0');
        expect((proposalData.forVotes).toString()).equal('0');
        expect((await gov.state.call(govProposalId)).toString()).equal(states["Pending"]);

        await sendRPC(web3, "evm_mine", []);
        await sendRPC(web3, "evm_mine", []);

        expect((await gov.state.call(govProposalId)).toString()).equal(states["Active"]);
      })

      it('should revert if gov proposal already exists', async() => {
        // Delegate all votes to proposal
        await slice.delegate(proposal.address, {from: root});

        // Propose successful
        await proposal.propose();
        expect(parseInt(await proposal.govProposalId.call())).to.be.above(0);

        // Propose reverts
        try{
          let trx = await proposal.propose({from: root});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert CrowdProposal::propose: gov proposal already exists -- Reason given: CrowdProposal::propose: gov proposal already exists.');
        }
      })

      it('should revert if not enough votes were delegated', async() => {
        // Propose reverts, not enough votes were delegated
        try{
          let trx = await proposal.propose({from: root});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert SliceGovernor::propose: proposer votes below proposal threshold -- Reason given: SliceGovernor::propose: proposer votes below proposal threshold.');
        }

        expect((await proposal.govProposalId.call()).toString()).equal('0');
      })

      it('should revert if proposal was terminated', async() => {
        let bal = (await slice.balanceOf(author));
        // expect(bal.toString()).equal('19800000000000000000000000'); // should -200000e25 for every before each
        
        await proposal.terminate({from: author});

        // Staked SLICE is transfered back to author
        expect(parseInt(await slice.balanceOf(author))).equal((minSlice.plus(bal)).toNumber());

        try{
          let trx = await proposal.propose({from: root});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert CrowdProposal::propose: proposal has been terminated -- Reason given: CrowdProposal::propose: proposal has been terminated.');
        }
      })
    });

    describe('terminate', () => {
      it('should terminate after gov proposal was created', async() => {

        // check initial balance of author
        let bal = (await slice.balanceOf(author));
        // expect(bal.toString()).equal('19800000000000000000000000');

        // Delegate all votes to proposal
        await slice.delegate(proposal.address, {from: root});

        // Propose
        await proposal.propose({from: root});
        const govProposalId = await proposal.govProposalId.call();

        await sendRPC(web3, "evm_mine", []);

        // Vote for the gov proposal
        await proposal.vote({from: author});

        // Check terminated flag
        expect(await proposal.terminated.call()).equal(false);

        // Terminate crowd proposal
        const trx  = await proposal.terminate({from: author});

        trx.logs.map(async (event) => {
          expect(event.event).equal('CrowdProposalTerminated');
          expect(event.args.author).equal(author);
          expect(event.args.proposal).equal(proposal.address);
        })

        // Check terminated flag
        expect(await proposal.terminated.call()).equal(true);

        // Staked SLICE is transfered back to author
        expect(parseInt(await slice.balanceOf(author))).equal((minSlice.plus(bal)).toNumber());

        // Check state and governance proposal votes
        expect((await gov.state.call(govProposalId)).toString()).equal(states["Active"]);
        const proposalData = await gov.proposals.call(govProposalId);
        expect((proposalData.againstVotes).toString()).equal('0');
        expect((proposalData.forVotes).toString()).equal((await slice.balanceOf(author)).toString());
      })

      it('should terminate without transfering votes', async() => {

        // check initial balance of author
        let bal = (await slice.balanceOf(author));
        // expect(bal.toString()).equal('19800000000000000000000000');

        // Delegate all votes to proposal
        await slice.delegate(proposal.address, {from: root});

        // Propose
        await proposal.propose({from: root});
        const govProposalId = (await proposal.govProposalId.call()).toString();

        // Terminate crowd proposal
        await proposal.terminate({from: author});

        // Staked SLICE is transfered back to author
        expect(parseInt(await slice.balanceOf(author))).equal((minSlice.plus(bal)).toNumber());

        // Check state and governance proposal votes
        expect((await gov.state.call(govProposalId)).toString()).equal(states["Pending"]);
        const proposalData = await gov.proposals.call(govProposalId);
        expect(proposalData.againstVotes.toString()).equal('0');
        expect(proposalData.forVotes.toString()).equal('0');
      })

      it('should terminate without proposing, not enough votes were delegated', async() => {
        // check initial balance of author
        let bal = (await slice.balanceOf(author));
        // expect(bal.toString()).equal('19800000000000000000000000');

        expect((await proposal.govProposalId.call()).toString()).equal('0');
        // Terminate crowd proposal
        await proposal.terminate({from: author});

        // Staked SLICE is transfered back to author
        expect(parseInt(await slice.balanceOf(author))).equal((minSlice.plus(bal)).toNumber());
      })

      it('should terminate without proposing, even with enough delegated votes', async() => {

        // check initial balance of author
        let bal = (await slice.balanceOf(author));
        // expect(bal.toString()).equal('19800000000000000000000000');

        // Delegate all votes to proposal
        await slice.delegate(proposal.address, {from: root});

        expect((await proposal.govProposalId.call()).toString()).equal('0');
        // Terminate crowd proposal
        await proposal.terminate({from: author});

        // Staked SLICE is transfered back to author
        expect(parseInt(await slice.balanceOf(author))).equal((minSlice.plus(bal)).toNumber());
      })

      it('should revert if called not by author', async() => {
        // Terminate reverts
        try{
          let trx = await proposal.terminate({from: a1});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert CrowdProposal::terminate: only author can terminate -- Reason given: CrowdProposal::terminate: only author can terminate.');
        }
      })

      it('should revert if already terminated', async() => {
        // Terminate crowd proposal
        await proposal.terminate({from: author});

        // Terminate reverts
        try{
          let trx = await proposal.terminate({from: author});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert CrowdProposal::terminate: proposal has been already terminated -- Reason given: CrowdProposal::terminate: proposal has been already terminated.');
        }
      })
    });

    describe('vote', () => {
      it('should successfully vote for proposal', async() => {
        // Propose
        await slice.delegate(proposal.address, {from: root});
        await proposal.propose({from: root});
        const govProposalId = await proposal.govProposalId.call();

        await sendRPC(web3, "evm_mine", []);

         // Vote, check event and number of votes
        const trx = await proposal.vote({from: root});

        trx.logs.map(async (event) => {
          expect(event.event).equal('CrowdProposalVoted');
          expect(event.args.proposalId.toString()).equal(govProposalId.toString());
          expect(event.args.proposal).equal(proposal.address);
        })

        const proposalData = await gov.proposals.call(govProposalId);
        expect(proposalData.againstVotes.toString()).equal('0');
        // expect(proposalData.forVotes.toString()).equal((await slice.balanceOf.call(root)).toString());
        expect(parseInt(proposalData.forVotes)).to.be.above(0);
      })

      it('should be able to vote even after proposal was terminated', async() => {
        // Propose
        await slice.delegate(proposal.address, {from: root});
        await proposal.propose({from: root});
        const govProposalId = await proposal.govProposalId.call();

        await proposal.terminate({from: author});

        // Vote and check number of votes
        await proposal.vote({from: root});
        const proposalData = await gov.proposals(govProposalId);

        // SLICE stake is withdrawn by an author, so total number of votes for will be less
        // const leftVotes = new BigNumber(await slice.totalSupply.call()).minus(minSlice).toFixed();
        expect(proposalData.againstVotes.toString()).equal('0');
        expect(proposalData.forVotes.toString()).equal((await slice.balanceOf(author)).toString());
        // expect(proposalData.forVotes.toString()).equal((leftVotes).toString());

      })

      it('should revert if gov proposal is not created yet', async() => {
        // An attempt to vote
        try{
          let trx = await proposal.vote({from: root});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert CrowdProposal::vote: gov proposal has not been created yet -- Reason given: CrowdProposal::vote: gov proposal has not been created yet.');
        }
      })

      it('should revert if gov proposal is not in Active', async() => {
        // Propose
        await slice.delegate(proposal.address, {from: root});
        await proposal.propose({from: root});
        const govProposalId = await proposal.govProposalId.call();

        expect((await gov.state(govProposalId)).toString()).equal(states["Pending"]);

         // Vote
         try{
          let trx = await proposal.vote({from: root});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert SliceGovernor::castVoteInternal: voting is closed -- Reason given: SliceGovernor::castVoteInternal: voting is closed.');
        }
      })

      it('should revert if already voted', async() => {
        // Propose
        await slice.delegate(proposal.address, {from: root});
        await proposal.propose({from: root});
        const govProposalId = await proposal.govProposalId.call();

        await sendRPC(web3, "evm_mine", []);

         // Vote
        await proposal.vote({from: root});

        try{
          let trx = await proposal.vote({from: root});
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString())
          .equal('Error: Returned error: VM Exception while processing transaction: revert SliceGovernor::castVoteInternal: voter already voted -- Reason given: SliceGovernor::castVoteInternal: voter already voted.');
        }
      })
    });

    describe('full workflows', () => {
      it('CrowdProposal is successful', async () => {
        // Delegate more votes to the proposal
        const sliceWhale = accounts[1];
        const proposalThreshold = await gov.proposalThreshold.call();
        const currentVotes = await slice.getCurrentVotes(proposal.address);
        const quorum = new BigNumber(proposalThreshold).plus(1);
        const remainingVotes = quorum.minus(new BigNumber(currentVotes));

        // Create Slice mini whale
        await slice.transfer(sliceWhale, uint(remainingVotes.toFixed()), { from: root });
        // Whale delegates just enough to push proposal through
        await slice.delegate(proposal.address, {from: sliceWhale});

        // Proposal meets threshold requirement
        expect((await slice.getCurrentVotes(proposal.address)).toString()).equal(quorum.toFixed());

        // Launch governance proposal
        await proposal.propose({from: root});
        const govProposalId = await proposal.govProposalId.call();

        await sendRPC(web3, "evm_mine", []);

        // Vote for the gov proposal
        await proposal.vote({from: root});

        let bal = await slice.balanceOf(author);
        expect(parseInt(bal)).to.be.above(0);

        await proposal.terminate({from: author});

        // Staked SLICE is transfered back to author
        expect(parseInt(await slice.balanceOf(author))).equal((minSlice.plus(bal)).toNumber());

        // Check votes for governance proposal
        const proposalData = await gov.proposals(govProposalId);
        expect(proposalData.againstVotes.toString()).equal('0');
        expect(proposalData.forVotes.toString()).equal(quorum.toFixed());
      });

      it('CrowdProposal fails if not enough votes were delegated', async () => {
        // Delegate more votes to the crowd proposal
        const delegator1 = accounts[2];
        const delegator2 = accounts[3];

        const proposalThreshold = await gov.proposalThreshold.call();
        const currentVotes = await slice.getCurrentVotes(proposal.address);
        const quorum = new BigNumber(proposalThreshold).plus(1);
        const remainingVotes = quorum.minus(new BigNumber(currentVotes));

        // Proposal doesn't have enough votes to create governance proposal
        // Fund delegators with some SLICE, but not enough for proposal to pass
        await slice.transfer(delegator1, uint(remainingVotes.dividedToIntegerBy(10).toFixed()), { from: root });
        await slice.transfer(delegator2, uint(remainingVotes.dividedToIntegerBy(10).toFixed()), { from: root });

        // Delegation period
        await slice.delegate(proposal.address, {from: delegator1});
        await slice.delegate(proposal.address, {from: delegator2});

        // An attempt to propose with not enough delegations
        try{
          let trx = await proposal.propose({from: root})
          expect(trx).equal(null);
        } catch (err){
          expect(err.toString()).equal("Error: Returned error: VM Exception while processing transaction: revert SliceGovernor::propose: proposer votes below proposal threshold -- Reason given: SliceGovernor::propose: proposer votes below proposal threshold.")
        }

        // Time passes ..., nobody delegates, proposal author gives up and wants their staked SLICE back
        expect((await proposal.govProposalId()).toString()).equal("0");


        let bal = await slice.balanceOf(author);
        expect(parseInt(bal)).to.be.above(0);

        await proposal.terminate({from: author});

        // Staked SLICE is transfered back to author
        expect(parseInt(await slice.balanceOf(author))).equal((minSlice.plus(bal)).toNumber());
      });
    });
})