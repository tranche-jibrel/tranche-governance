const {
  BN,
  ether
} = require('@openzeppelin/test-helpers');
const {
  encodeParameters,
} = require('../test/Utils/Ethereum');

const Timelock = artifacts.require('Timelock');
const SliceGovernor = artifacts.require('SliceGovernor');
const Token = artifacts.require('Token');
const CrowdProposalFactory = artifacts.require('CrowdProposalFactory');

// const SLICE_ADDRESS = '0x0AeE8703D34DD9aE107386d3eFF22AE75Dd616D1';
const PROP_THR = ether('250000');
const SLICE_STAKE_AMOUNT = ether('1000');

module.exports = async (deployer, network, accounts) => {
  const admin = accounts[0];
  if (network == 'development') {
    // console.log(admin);

    await deployer.deploy(Token, 'Slice Token', 'SLICE', 20000000, 1664028133);
    const sInstance = await Token.deployed();
    console.log(sInstance.address);

    await deployer.deploy(Timelock, admin, 172800);  // 2 days
    const tlInstance = await Timelock.deployed();
    console.log(tlInstance.address);

    await deployer.deploy(SliceGovernor);
    const sgInstance = await SliceGovernor.deployed();
    console.log(sgInstance.address);

    await tlInstance.setSliceGovAddress(sgInstance.address)

    await sgInstance.initialize(tlInstance.address, sInstance.address, 17280, 1, PROP_THR)

    await deployer.deploy(CrowdProposalFactory,
      sInstance.address,
      sgInstance.address,
      SLICE_STAKE_AMOUNT
    )
    const cpfInstance = await CrowdProposalFactory.deployed();
    console.log(cpfInstance.address);

  } else if (network == 'kovan') {
    const { SLICE_ADDRESS } = process.env;
    // const slice = await Token.at(SLICE_ADDRESS);
    // let targets = [admin];
    // let values = ["0"];
    // let signatures = ["getBalanceOf(address)"];
    // let callDatas = [encodeParameters(['address'], [admin])];

    await deployer.deploy(Timelock, admin, 172800);  // 2 days
    const tlInstance = await Timelock.deployed();
    console.log("TIME_LOCK_ADDRESS=", tlInstance.address);

    await deployer.deploy(SliceGovernor);
    const sgInstance = await SliceGovernor.deployed();
    console.log("SLICE_GOVERNANCE", sgInstance.address);

    console.log('control in set slice gov')
    await tlInstance.setSliceGovAddress(sgInstance.address)

    console.log('control in initialize')
    await sgInstance.initialize(tlInstance.address, SLICE_ADDRESS, 5760, 1, PROP_THR)

    console.log('CrowdProposalFactory')
    const crowdProposalInstance = await deployer.deploy(CrowdProposalFactory,
      SLICE_ADDRESS,
      sgInstance.address,
      SLICE_STAKE_AMOUNT
    )
    console.log("CROWD_PROPOSAL_ADDRESS=", crowdProposalInstance.address);

    // console.log('delegating')
    // await slice.delegate(admin)
    // console.log('proposing')
    // await sgInstance.propose(targets, values, signatures, callDatas, 'do nothing')

    // proposalId = await sgInstance.latestProposalIds(admin)
    // trivialProposal = await sgInstance.proposals(proposalId)
    // console.log(JSON.stringify(trivialProposal, ["id", "proposer", "eta", "startBlock", "endBlock", "forVotes", "againstVotes", "abstainVotes", "canceled", "executed"]))
  }
};
