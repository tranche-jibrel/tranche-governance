const Web3 = require('web3');
// Ganache UI on 8545
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const { uint, address, encodeParameters, mergeInterface } = require('./Utils/Helpers');
const BigNumber = require("bignumber.js");

const Token = artifacts.require('Token');
const SliceGovernor = artifacts.require('SliceGovernor');
const CrowdProposalFactory = artifacts.require('CrowdProposalFactory');
const Timelock = artifacts.require('Timelock');

contract('CrowdProposalFactory', (accounts) => {
    let slice, timelock, gov, root, a1;
    let factory;

    const minSlice = new BigNumber(1000e18);

    //beforeEach(async() => {
      root = accounts[0];
      a1 = accounts[1];

      // timelock = await Timelock.new(root, 172800)
      // slice = await Token.new('Slice Token', 'SLICE', 20000000, 1664028133);
      // gov = await SliceGovernor.new({from: root});

      // await gov.initialize(
      //   timelock.address,
      //   slice.address,
      //   17280,
      //   1,
      //   200000e18,
      //   {from: root}
      // )

      // factory = await CrowdProposalFactory.new(
      //   comp.address, 
      //   gov.address, 
      //   minSlice
      // );
    it ("settings" , async () => {
      slice = await Token.deployed();
      gov = await SliceGovernor.deployed();
      factory = await CrowdProposalFactory.deployed();
    });

    describe('metadata', () => {
      it('has given comp', async () => {
        expect(await factory.slice.call()).equal(slice.address);
      });

      it('has given governor', async () => {
        expect(await factory.governor.call()).equal(gov.address);
      });

      it('has given min comp threshold', async () => {
        expect(parseInt(await factory.sliceStakeAmount.call())).equal(minSlice.toNumber());
      });
    });

    describe('createCrowdProposal', () => {
        it('successfully creates crowd proposal', async () => {
          const author = accounts[0];

          // Fund author account
          await slice.transfer(author, (minSlice), { from: root });
          // expect((await slice.balanceOf(author)).toString()).equal(minSlice.toString());

          // Approve factory to stake COMP tokens for proposal
          await slice.approve(factory.address, (minSlice), {from: author});

          // Proposal data
          const targets = [root];
          const values = ["0"];
          const signatures = ["getBalanceOf(address)"];
          const callDatas = [encodeParameters(['address'], [a1])];
          const description = "do nothing";

          const trx = await factory.createCrowdProposal(targets, values, signatures, callDatas, description, {from: author});

          // Check balance of proposal and delegated votes
          const newProposal = trx.logs.map((event) => {
            expect(event.event).equal('CrowdProposalCreated');
            expect(event.args.author).equal(author);
            return event.args.proposal;
          })[0]

          expect(parseInt(await slice.balanceOf.call(newProposal))).equal(minSlice.toNumber());
          // expect((await slice.balanceOf(author)).toString()).equal("0");
          expect(parseInt(await slice.getCurrentVotes(newProposal))).equal(minSlice.toNumber());
        });

        it('revert if author does not have enough Comp', async () => {
          let author = accounts[0];

          // Fund author account
          const sliceBalance = 999e18;
          await slice.transfer(author, uint(sliceBalance), { from: root });
          // expect(parseInt(await slice.balanceOf(author))).equal((sliceBalance).toString());

          // Approve factory to stake COMP tokens for proposal
          await slice.approve(factory.address, uint(sliceBalance), {from: author});

          // Proposal data
          const targets = [root];
          const values = ["0"];
          const signatures = ["getBalanceOf(address)"];
          const callDatas = [encodeParameters(['address'], [a1])];
          const description = "do nothing";

          try{
            let trx = await factory.createCrowdProposal(targets, values, signatures, callDatas, description, {from: author});
            expect(trx).equal(null);
          } catch (err){
            expect(err.toString()).equal("Error: Returned error: VM Exception while processing transaction: revert ERC20: transfer amount exceeds allowance -- Reason given: ERC20: transfer amount exceeds allowance.")
          }

        });
    });
})